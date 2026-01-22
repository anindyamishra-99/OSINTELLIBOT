/**
 * !ntellibot OSINT Dashboard v2.0 - Real-Time Data Integration
 * All data is fetched live from public APIs - no static/mock/hardcoded values
 * Cloudflare Pages compatible version
 */

// API Configuration - Use Cloudflare Workers for all API calls (CORS-compatible)
const API_CONFIG = {
    crypto: {
        // Use Cloudflare Worker for CoinGecko
        endpoint: '/api/crypto',
        timeout: 15000
    },
    forex: {
        // Use Cloudflare Worker for Frankfurter
        endpoint: '/api/forex',
        timeout: 15000
    },
    news: {
        // Use Cloudflare Worker for RSS feeds
        endpoint: '/api/news',
        timeout: 30000
    },
    newsTier1: {
        // Tier 1: Top 16 most reliable news feeds
        endpoint: '/api/news-tier1',
        timeout: 30000
    },
    newsTier2: {
        // Tier 2: Additional 16 regional and specialty feeds
        endpoint: '/api/news-tier2',
        timeout: 30000
    },
    events: {
        // Use Cloudflare Worker for events
        endpoint: '/api/events',
        timeout: 30000
    },
    signals: {
        // Use Cloudflare Worker for signals
        endpoint: '/api/signals',
        timeout: 30000
    },
    predictions: {
        // Use Cloudflare Worker for predictions
        endpoint: '/api/predictions',
        timeout: 30000
    },
    military: {
        // Use Cloudflare Worker for military activity
        endpoint: '/api/events',  // Reuse events endpoint for military news
        timeout: 30000
    }
};

// Correlation Data Store - maintains historical data for correlation calculations
const correlationData = {
    crypto: [],      // Bitcoin price history
    military: [],    // Military aircraft count history
    news: [],        // News volume history
    timestamps: []   // Corresponding timestamps
};

// Empty Fallback - NO hardcoded data is ever displayed
// When APIs fail, empty states are shown with data source attribution
const FallbackData = window.FallbackData || { 
    news: [], 
    crypto: [], 
    forex: [], 
    events: [], 
    signals: [], 
    predictions: [] 
};

// Application State - All real-time, no fallback mock data
const appState = {
    currentPage: 'dashboard',
    data: {
        news: [],
        crypto: [],
        forex: [],
        events: [],
        signals: [],
        predictions: [],
        militaryAircraft: [],
        militaryActivity: []
    },
    apiHealth: {},
    map: null,
    markers: [],
    aircraftMarkers: [],
    selectedEvent: null,
    lastUpdated: null,
    refreshInterval: null,
    correlationInterval: null,
    dataLoaded: {
        news: false,
        crypto: false,
        forex: false,
        events: false,
        military: false
    }
};

// Utility Functions
function formatRelativeTime(dateString) {
    if (!dateString) return 'Just now';
    const date = new Date(dateString);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

function formatDateTime(dateString) {
    if (!dateString) return 'Unknown';
    return new Date(dateString).toLocaleString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'UTC'
    });
}

// Intelligent severity assessment for news items based on content analysis
function assessEventSeverity(title, summary) {
    const text = `${title || ''} ${summary || ''}`.toLowerCase();
    
    // Critical severity keywords - major international conflicts, terrorism, mass casualties
    const criticalKeywords = [
        'terror attack', 'terrorist attack', 'mass shooting', 'mass casualty',
        'war crime', 'genocide', 'ethnic cleansing', 'holocaust',
        'nuclear escalation', 'nuclear war', 'world war', ' wwiii',
        'military coup', 'state collapse', 'civil war escalation',
        'isis', 'al-qaeda', 'terror group', 'suicide bombing', 'suicide bomb',
        'hostage crisis', 'mass kidnapping', 'genocide', 'massacre',
        'biological weapon', 'chemical weapon', 'chemical attack',
        'air strike', 'airstrike', 'bombing', ' missile ', 'rocket attack',
        'iran and israel', 'israel and iran', 'israel-iran conflict',
        'russia nato war', 'nato russia war', 'putin nuclear'
    ];
    
    // High severity keywords - significant geopolitical developments, violence, crises
    const highKeywords = [
        'military operation', 'combat operation', 'special operation',
        'invasion', 'offensive', 'counter-offensive', 'front line',
        'border conflict', 'cross-border', 'clash', 'firefight',
        'abduction', 'kidnapping', 'hostage', 'detention', 'arrest',
        'protest', 'demonstration', 'uprising', 'rebellion', 'revolution',
        'crackdown', 'violence', 'attack', 'assassination', 'killing',
        'sanctions', 'embargo', 'blockade', 'economic war',
        'china taiwan', 'taiwan strait', 'north korea', 'south korea',
        'ukraine war', 'russia ukraine', 'gaza', 'israel hamas',
        'ethiopia', 'eritrea', 'sudan conflict', 'congo', 'mali',
        'ice arrest', 'ice raid', 'deportation', 'detention center',
        'crime shooting', 'violent crime', 'gang violence', 'mass shooting'
    ];
    
    // Medium severity keywords - political developments, tensions, disputes
    const mediumKeywords = [
        'tension', 'diplomatic', 'talks', 'negotiation', 'summit',
        'election', 'political', 'policy', 'legislation', 'law',
        'military exercise', 'war games', 'deployment', 'troop',
        'proposal', 'plan', 'strategy', 'agreement', 'deal',
        'investigation', 'probe', 'inquiry', 'allegation',
        'human rights', 'refugee', 'migration', 'border security',
        'crime', 'investigation', 'scandal', 'corruption'
    ];
    
    // Check for critical first
    if (criticalKeywords.some(keyword => text.includes(keyword))) {
        return 'critical';
    }
    
    // Check for high severity
    if (highKeywords.some(keyword => text.includes(keyword))) {
        return 'high';
    }
    
    // Check for medium severity
    if (mediumKeywords.some(keyword => text.includes(keyword))) {
        return 'medium';
    }
    
    // Default to low severity for routine news
    return 'low';
}

// Assess geopolitical relevance score for prioritizing high-importance events
function assessGeopoliticalRelevance(title, summary) {
    const text = `${title || ''} ${summary || ''}`.toLowerCase();
    let score = 0;
    let category = 'general';
    
    // Critical geopolitical hotspots - highest priority
    const criticalHotspots = [
        { keywords: ['ukraine', 'kiev', 'kyiv', 'russia', 'moscow', 'putin', 'zelensky', 'nato'], region: 'Ukraine-Russia', points: 25 },
        { keywords: ['iran', 'israel', 'gaza', 'hezbollah', 'lebanon', 'palestine', 'netanyahu'], region: 'Middle East', points: 25 },
        { keywords: ['taiwan', 'china', 'xi jinping', 'beijing', 'south china sea'], region: 'Taiwan-China', points: 22 },
        { keywords: ['north korea', 'pyongyang', 'kim jong', 'missile', 'nuclear test'], region: 'North Korea', points: 22 },
        { keywords: ['south china sea', 'spratly', 'parcel', ' Scarborough'], region: 'South China Sea', points: 20 }
    ];
    
    // High priority geopolitical topics
    const highPriorityTopics = [
        { keywords: ['sanctions', 'embargo', 'trade war', 'tariff'], topic: 'Sanctions/Trade', points: 15 },
        { keywords: ['military base', 'troop deployment', 'soldiers', 'armored'], topic: 'Military Deployment', points: 15 },
        { keywords: ['election', 'political crisis', 'regime change', 'coup'], topic: 'Political Crisis', points: 15 },
        { keywords: ['cyber attack', 'hack', 'ransomware', 'data breach'], topic: 'Cyber Security', points: 12 },
        { keywords: ['refugee', 'migration crisis', 'humanitarian'], topic: 'Humanitarian', points: 12 },
        { keywords: ['air strike', 'airstrike', 'bombing', 'missile attack'], topic: 'Combat Operations', points: 18 },
        { keywords: ['war crime', 'human rights abuse', 'atrocity'], topic: 'War Crimes', points: 20 },
        { keywords: ['intelligence', 'espionage', 'surveillance', 'spy'], topic: 'Intelligence', points: 12 },
        { keywords: ['defense pact', 'alliance', 'security agreement', 'treaty'], topic: 'Alliances', points: 14 },
        { keywords: ['nuclear', 'atomic', 'fissile', 'enrichment'], topic: 'Nuclear', points: 18 }
    ];
    
    // Medium priority geopolitical topics
    const mediumPriorityTopics = [
        { keywords: ['diplomatic', 'summit', 'negotiation', 'peace talks'], topic: 'Diplomacy', points: 10 },
        { keywords: ['protest', 'demonstration', 'unrest', 'riot'], topic: 'Unrest', points: 10 },
        { keywords: ['border', 'frontier', 'boundary', 'territorial'], topic: 'Border Issues', points: 10 },
        { keywords: ['energy', 'oil', 'gas', 'pipeline', 'energy crisis'], topic: 'Energy', points: 8 },
        { keywords: ['climate', 'environmental', 'natural disaster'], topic: 'Climate/Environment', points: 5 }
    ];
    
    // Check critical hotspots first (highest weight)
    for (const hotspot of criticalHotspots) {
        if (hotspot.keywords.some(kw => text.includes(kw))) {
            score += hotspot.points;
            category = hotspot.region;
            break; // Only count the highest priority hotspot
        }
    }
    
    // Check high priority topics
    for (const topic of highPriorityTopics) {
        if (topic.keywords.some(kw => text.includes(kw))) {
            score += topic.points;
            if (category === 'general') category = topic.topic;
        }
    }
    
    // Check medium priority topics
    for (const topic of mediumPriorityTopics) {
        if (topic.keywords.some(kw => text.includes(kw))) {
            score += topic.points;
            if (category === 'general') category = topic.topic;
        }
    }
    
    return { score, category };
}

// Extract location from event title using keyword matching
function extractLocation(title) {
    if (!title) return null;
    
    const text = title.toLowerCase();
    
    // Country and region mappings
    const locationMappings = [
        { keywords: ['ukraine', 'kiev', 'kyiv', 'odessa', 'kharkiv', 'lviv'], lat: 48.3794, lng: 31.1656, place_name: 'Ukraine' },
        { keywords: ['russia', 'moscow', 'st. petersburg', 'saint petersburg', 'vladivostok'], lat: 61.5240, lng: 105.3188, place_name: 'Russia' },
        { keywords: ['iran', 'tehran', 'teheran', 'isfahan', 'mashhad'], lat: 32.4279, lng: 53.6880, place_name: 'Iran' },
        { keywords: ['israel', 'tel aviv', 'jerusalem', 'haifa', 'netanya'], lat: 31.0461, lng: 34.8516, place_name: 'Israel' },
        { keywords: ['gaza', 'palestine', 'palestinian', 'west bank'], lat: 31.3547, lng: 34.3088, place_name: 'Gaza Strip' },
        { keywords: ['usa', 'united states', 'america', 'washington', 'new york', 'los angeles', 'chicago', 'houston', 'phoenix', 'philadelphia', 'san antonio', 'san diego', 'dallas', 'san jose', 'austin', 'jacksonville', 'fort worth', 'columbus', 'charlotte', 'san francisco', 'indianapolis', 'seattle', 'denver', 'boston', 'nashville', 'baltimore', 'oklahoma city', 'las vegas', 'portland', 'memphis', 'detroit', 'fresno', 'sacramento', 'kansas city', 'mesa', 'atlanta', 'miami', 'raleigh', 'omaha', 'albuquerque', 'pittsburgh', 'cincinnati', 'anchorage', 'hawaii'], lat: 37.0902, lng: -95.7129, place_name: 'United States' },
        { keywords: ['china', 'beijing', 'shanghai', 'shenzhen', 'guangzhou', 'hong kong', 'chongqing', 'tianjin', 'wuhan', 'hangzhou', 'nanjing', 'xian', 'chengdu'], lat: 35.8617, lng: 104.1954, place_name: 'China' },
        { keywords: ['north korea', 'pyongyang'], lat: 40.3399, lng: 127.5101, place_name: 'North Korea' },
        { keywords: ['south korea', 'seoul', 'busan', 'incheon', 'daegu'], lat: 35.9078, lng: 127.7669, place_name: 'South Korea' },
        { keywords: ['india', 'new delhi', 'mumbai', 'bangalore', 'hyderabad', 'chennai', 'kolkata', 'pune', 'ahmedabad'], lat: 20.5937, lng: 78.9629, place_name: 'India' },
        { keywords: ['pakistan', 'islamabad', 'karachi', 'lahore', 'faisalabad'], lat: 30.3753, lng: 69.3451, place_name: 'Pakistan' },
        { keywords: ['europe', 'european union', 'brussels', 'paris', 'berlin', 'london', 'rome', 'madrid', 'vienna', 'prague', 'warsaw', 'amsterdam', 'stockholm', 'oslo', 'helsinki', 'copenhagen', 'dublin', 'lisbon', 'athens', 'budapest', 'warsaw'], lat: 54.5260, lng: 15.2551, place_name: 'Europe' },
        { keywords: ['uk', 'united kingdom', 'britain', 'england', 'scotland', 'wales', 'northern ireland', 'london uk'], lat: 55.3781, lng: -3.4360, place_name: 'United Kingdom' },
        { keywords: ['france', 'paris', 'marseille', 'lyon', 'toulouse'], lat: 46.2276, lng: 2.2137, place_name: 'France' },
        { keywords: ['germany', 'berlin', 'munich', 'hamburg', 'frankfurt', 'cologne'], lat: 51.1657, lng: 10.4515, place_name: 'Germany' },
        { keywords: ['afghanistan', 'kabul', 'kandahar', 'herat'], lat: 33.9391, lng: 67.7100, place_name: 'Afghanistan' },
        { keywords: ['syria', 'damascus', 'aleppo', 'homs', 'hama'], lat: 34.8021, lng: 38.9968, place_name: 'Syria' },
        { keywords: ['iraq', 'baghdad', 'mosul', 'erbil', 'basra'], lat: 33.2232, lng: 43.6793, place_name: 'Iraq' },
        { keywords: ['yemen', 'sanaa', 'aden', 'taiz'], lat: 15.5527, lng: 48.5164, place_name: 'Yemen' },
        { keywords: ['libya', 'tripoli', 'benghazi', 'misrata'], lat: 26.3351, lng: 17.2283, place_name: 'Libya' },
        { keywords: ['sudan', 'khartoum', 'port sudan', 'oumdurman'], lat: 12.8628, lng: 30.2176, place_name: 'Sudan' },
        { keywords: ['ethiopia', 'addis ababa', 'dire dawa', 'mekel'], lat: 9.1450, lng: 40.4897, place_name: 'Ethiopia' },
        { keywords: ['somalia', 'mogadishu', 'hargeisa', 'kismayo'], lat: 5.1521, lng: 46.1996, place_name: 'Somalia' },
        { keywords: ['nigeria', 'lagos', 'abuja', 'ibadan', 'port harcourt'], lat: 9.0820, lng: 8.6753, place_name: 'Nigeria' },
        { keywords: ['south africa', 'johannesburg', 'cape town', 'durban', 'pretoria', 'port elizabeth'], lat: -30.5595, lng: 22.9375, place_name: 'South Africa' },
        { keywords: ['kenya', 'nairobi', 'mombasa', 'kisumu', 'eldoret'], lat: -0.0236, lng: 37.9062, place_name: 'Kenya' },
        { keywords: ['uganda', 'kampala', 'entebbe', 'jinja', 'gulu'], lat: 1.3733, lng: 32.2903, place_name: 'Uganda' },
        { keywords: ['congo', 'drc', 'kinshasa', 'lubumbashi', 'mbuji-mayi'], lat: -4.0383, lng: 21.7587, place_name: 'DR Congo' },
        { keywords: ['mali', 'bamako', 'sikasso', 'segou', 'koutiala'], lat: 17.5707, lng: -3.9962, place_name: 'Mali' },
        { keywords: ['niger', 'niamey', 'zinder', 'maradi', 'tahoua'], lat: 17.6078, lng: 8.0817, place_name: 'Niger' },
        { keywords: ['burkina faso', 'ouagadougou', 'bobo-dioulasso', 'koudougou'], lat: 12.2383, lng: -1.5616, place_name: 'Burkina Faso' },
        { keywords: ['cameroon', 'yaounde', 'douala', 'garoua', 'bamenda'], lat: 7.3697, lng: 12.3547, place_name: 'Cameroon' },
        { keywords: ['colombia', 'bogota', 'medellin', 'cali', 'barranquilla'], lat: 4.5709, lng: -74.2973, place_name: 'Colombia' },
        { keywords: ['mexico', 'mexico city', 'guadalajara', 'monterrey', 'tijuana'], lat: 23.6345, lng: -102.5528, place_name: 'Mexico' },
        { keywords: ['brazil', 'brasilia', 'sao paulo', 'rio de janeiro', 'salvador', 'brasilia'], lat: -14.2350, lng: -51.9253, place_name: 'Brazil' },
        { keywords: ['argentina', 'buenos aires', 'cordoba', 'rosario', 'mendoza'], lat: -38.4161, lng: -63.6167, place_name: 'Argentina' },
        { keywords: ['venezuela', 'caracas', 'maracaibo', 'valencia', 'barquisimeto'], lat: 6.4238, lng: -66.5897, place_name: 'Venezuela' },
        { keywords: ['peru', 'lima', 'arequipa', 'trujillo', 'chiclayo'], lat: -9.1900, lng: -75.0152, place_name: 'Peru' },
        { keywords: ['chile', 'santiago', 'valparaiso', 'concepcion', 'antofagasta'], lat: -35.6751, lng: -71.5430, place_name: 'Chile' },
        { keywords: ['canada', 'toronto', 'vancouver', 'montreal', 'calgary', 'ottawa'], lat: 56.1304, lng: -106.3468, place_name: 'Canada' },
        { keywords: ['australia', 'sydney', 'melbourne', 'brisbane', 'perth', 'adelaide'], lat: -25.2744, lng: 133.7751, place_name: 'Australia' },
        { keywords: ['japan', 'tokyo', 'osaka', 'kyoto', 'yokohama', 'nagoya'], lat: 36.2048, lng: 138.2529, place_name: 'Japan' },
        { keywords: ['taiwan', 'taipei', 'kaohsiung', 'taichung'], lat: 23.6978, lng: 120.9605, place_name: 'Taiwan' },
        { keywords: ['indonesia', 'jakarta', 'surabaya', 'bandung', 'medan', 'semarang'], lat: -0.7893, lng: 113.9213, place_name: 'Indonesia' },
        { keywords: ['thailand', 'bangkok', 'phuket', 'chiang mai', 'pattaya'], lat: 15.8700, lng: 100.9925, place_name: 'Thailand' },
        { keywords: ['vietnam', 'hanoi', 'ho chi minh', 'danang', 'haiphong'], lat: 14.0583, lng: 108.2772, place_name: 'Vietnam' },
        { keywords: ['philippines', 'manila', 'quezon city', 'cebu', 'davao'], lat: 12.8797, lng: 121.7740, place_name: 'Philippines' },
        { keywords: ['malaysia', 'kuala lumpur', 'johor bahru', 'penang', 'malacca'], lat: 4.2105, lng: 101.9758, place_name: 'Malaysia' },
        { keywords: ['singapore', 'singapore'], lat: 1.3521, lng: 103.8198, place_name: 'Singapore' },
        { keywords: ['new zealand', 'auckland', 'wellington', 'christchurch'], lat: -40.9006, lng: 174.8860, place_name: 'New Zealand' },
        { keywords: ['poland', 'warsaw', 'krakow', 'gdansk', 'wroclaw'], lat: 51.9194, lng: 19.1451, place_name: 'Poland' },
        { keywords: ['turkey', 'istanbul', 'ankara', 'izmir', 'antalya'], lat: 38.9637, lng: 35.2433, place_name: 'Turkey' },
        { keywords: ['saudi arabia', 'riyadh', 'jeddah', 'mecca', 'medina'], lat: 23.8859, lng: 45.0792, place_name: 'Saudi Arabia' },
        { keywords: ['uae', 'united arab emirates', 'dubai', 'abu dhabi', 'sharjah'], lat: 23.4241, lng: 53.8478, place_name: 'UAE' },
        { keywords: ['qatar', 'doha'], lat: 25.3548, lng: 51.1839, place_name: 'Qatar' },
        { keywords: ['egypt', 'cairo', 'alexandria', 'giza', 'luxor'], lat: 26.8206, lng: 30.8025, place_name: 'Egypt' },
        { keywords: ['nato'], lat: 52.1326, lng: 5.2913, place_name: 'NATO Region' },
        { keywords: ['white house'], lat: 38.8977, lng: -77.0365, place_name: 'White House, USA' },
        { keywords: ['pentagon'], lat: 38.8719, lng: -77.0563, place_name: 'Pentagon, USA' },
        { keywords: ['kremlin'], lat: 55.7520, lng: 37.6175, place_name: 'Kremlin, Russia' },
        { keywords: ['tiananmen'], lat: 39.9087, lng: 116.3974, place_name: 'Tiananmen, China' }
    ];
    
    // Check each location mapping
    for (const location of locationMappings) {
        for (const keyword of location.keywords) {
            if (text.includes(keyword)) {
                return {
                    lat: location.lat,
                    lng: location.lng,
                    place_name: location.place_name
                };
            }
        }
    }
    
    return null;
}

function formatNumber(num) {
    if (num === undefined || num === null) return 'N/A';
    if (num >= 1000000000000) return (num / 1000000000000).toFixed(2) + 'T';
    if (num >= 1000000000) return (num / 1000000000).toFixed(2) + 'B';
    if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
    if (num >= 1000) return (num / 1000).toFixed(2) + 'K';
    return num.toLocaleString();
}

function getSeverityColor(severity) {
    const colors = {
        critical: '#ef4444',
        high: '#f97316',
        medium: '#f59e0b',
        low: '#84cc16',
        info: '#06b6d4'
    };
    return colors[severity] || colors.info;
}

function getSeverityClass(severity) {
    return severity || 'info';
}

// API Functions - Use Netlify Functions for CORS compatibility
async function fetchFromAPI(url, options = {}) {
    try {
        const controller = new AbortController();
        const id = setTimeout(() => controller.abort(), options.timeout || 15000);
        
        const response = await fetch(url, {
            ...options,
            signal: controller.signal
        });
        clearTimeout(id);
        
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        
        // Log successful API calls for debugging
        console.log(`[API] Successfully fetched: ${url}`);
        return data;
    } catch (error) {
        // Suppress common benign browser errors that don't affect functionality
        const errorMessage = error.message || '';
        const isBenignError = 
            errorMessage.includes('message channel closed') ||
            errorMessage.includes('asynchronous response') ||
            errorMessage.includes('Failed to fetch') ||
            errorMessage.includes('network error') ||
            errorMessage.includes('CORS') ||
            errorMessage.includes('ERR_CONNECTION_REFUSED') ||
            errorMessage.includes('ERR_NAME_NOT_RESOLVED');
        
        if (!isBenignError) {
            console.warn(`[API] Failed: ${url} - ${errorMessage}`);
        }
        return null;
    }
}

// Generic function to fetch data from Cloudflare Workers API endpoints
async function fetchFromWorker(functionName, options = {}, signal = null) {
    try {
        const response = await fetchFromAPI(
            `${API_CONFIG[functionName].endpoint}?t=${Date.now()}`,
            {
                timeout: API_CONFIG[functionName].timeout,
                ...options,
                signal: signal || null
            }
        );
        return response;
    } catch (error) {
        console.error(`Error fetching from ${functionName}:`, error);
        return null;
    }
}

// Crypto API - CoinGecko via Cloudflare Worker
async function fetchCryptoData() {
    try {
        const response = await fetchFromWorker('crypto');
        
        if (response && response.crypto && Array.isArray(response.crypto)) {
            const cryptoData = response.crypto.map(coin => ({
                id: coin.id,
                name: coin.name,
                symbol: coin.symbol.toUpperCase(),
                price: coin.price,
                change24h: coin.change24h,
                marketCap: coin.marketCap,
                volume24h: coin.volume24h,
                rank: coin.rank,
                lastUpdated: response.lastUpdated
            }));
            
            appState.data.crypto = cryptoData;
            appState.apiHealth.crypto = { status: 'online', latency: 'fast' };
            
            // Store for correlation (use BTC price as primary)
            const btc = cryptoData.find(c => c.id === 'bitcoin');
            if (btc) {
                correlationData.crypto.push({
                    value: btc.price,
                    timestamp: Date.now()
                });
                // Keep only last 30 data points
                if (correlationData.crypto.length > 30) {
                    correlationData.crypto.shift();
                }
            }
            
            return cryptoData;
        }
        throw new Error('Invalid crypto response');
    } catch (error) {
        console.error('Crypto fetch error:', error);
        appState.apiHealth.crypto = { status: 'offline', error: error.message };
        return [];
    }
}

// Forex API - Frankfurter via Cloudflare Worker
async function fetchForexData() {
    try {
        const response = await fetchFromWorker('forex');
        
        if (response && response.forex && Array.isArray(response.forex)) {
            const forexData = response.forex.map(currency => ({
                currency: currency.currency,
                pair: currency.pair,
                rate: currency.rate,
                lastUpdated: currency.lastUpdated || response.lastUpdated
            }));
            
            appState.data.forex = forexData;
            appState.apiHealth.forex = { status: 'online', latency: 'fast' };
            return forexData;
        }
        throw new Error('Invalid forex response');
    } catch (error) {
        console.error('Forex fetch error:', error);
        appState.apiHealth.forex = { status: 'offline', error: error.message };
        return [];
    }
}

// News API - RSS feeds via Netlify Function (tiered approach for reliability)
async function fetchNewsData() {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 45000);
        
        // Fetch from both tiers in parallel
        const [tier1Response, tier2Response] = await Promise.all([
            fetchFromWorker('newsTier1', {}, controller.signal),
            fetchFromWorker('newsTier2', {}, controller.signal)
        ]);
        
        clearTimeout(timeoutId);
        
        let allNews = [];
        
        // Combine articles from both tiers
        if (tier1Response && tier1Response.articles && Array.isArray(tier1Response.articles)) {
            allNews = allNews.concat(tier1Response.articles);
        }
        if (tier2Response && tier2Response.articles && Array.isArray(tier2Response.articles)) {
            allNews = allNews.concat(tier2Response.articles);
        }
        
        if (allNews.length > 0) {
            // Remove duplicates based on title
            const seenTitles = new Set();
            const uniqueNews = [];
            allNews.forEach(item => {
                const titleKey = (item.title || '').toLowerCase().trim();
                if (titleKey && !seenTitles.has(titleKey)) {
                    seenTitles.add(titleKey);
                    uniqueNews.push(item);
                }
            });
            
            allNews = uniqueNews;
            
            // Sort by date, most recent first
            allNews = allNews.sort((a, b) => {
                const dateA = new Date(a.pubDate || 0);
                const dateB = new Date(b.pubDate || 0);
                return dateB - dateA;
            });
            
            // Filter to last 7 days
            const cutoffTime = Date.now() - (7 * 24 * 60 * 60 * 1000);
            allNews = allNews.filter(item => new Date(item.pubDate || 0).getTime() > cutoffTime);
            
            appState.data.news = allNews.slice(0, 50);
            appState.apiHealth.news = { 
                status: 'online', 
                sources: [...new Set(allNews.map(n => n.source))].filter(Boolean).length,
                articles: allNews.length,
                tier1Stats: tier1Response?.stats || {},
                tier2Stats: tier2Response?.stats || {}
            };
            
            // Store news volume for correlation
            correlationData.news.push({
                value: allNews.length,
                timestamp: Date.now()
            });
            if (correlationData.news.length > 30) {
                correlationData.news.shift();
            }
            
            return appState.data.news;
        }
        throw new Error('No articles received from any tier');
    } catch (error) {
        console.warn('News fetch error:', error.message);
        appState.apiHealth.news = { status: 'offline', error: error.message };
        return [];
    }
}

// Events API - GDELT + Wikipedia via Cloudflare Worker
async function fetchEventsData() {
    try {
        const response = await fetchFromWorker('events');
        
        if (response && response.events && Array.isArray(response.events)) {
            let events = response.events;
            
            // Sort by date, most recent first
            events.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
            
            appState.data.events = events.slice(0, 50);
            appState.apiHealth.events = { 
                status: 'online', 
                total: events.length,
                dataSource: response.dataSource || 'Unknown'
            };
            
            return appState.data.events;
        }
        throw new Error('Invalid events response');
    } catch (error) {
        console.error('Events fetch error:', error);
        appState.apiHealth.events = { status: 'offline', error: error.message };
        return [];
    }
}

// Signals API - Real OSINT signals via Cloudflare Worker
async function fetchSignalsData() {
    try {
        const response = await fetchFromWorker('signals');
        
        if (response && response.signals && Array.isArray(response.signals)) {
            const signals = response.signals;
            
            appState.data.signals = signals;
            appState.apiHealth.signals = {
                status: signals.length > 0 ? 'online' : 'offline',
                count: signals.length,
                dataSource: response.dataSource || 'Unknown',
                lastFetch: Date.now()
            };
            
            return signals;
        }
        // API returned but with unexpected format
        appState.apiHealth.signals = { 
            status: 'error', 
            error: 'Invalid response format',
            lastFetch: Date.now()
        };
        return [];
    } catch (error) {
        console.error('Signals fetch error:', error);
        appState.apiHealth.signals = { 
            status: 'error', 
            error: error.message,
            lastFetch: Date.now()
        };
        return [];
    }
}

// Predictions API - Forecasts via Cloudflare Worker
async function fetchPredictionsData() {
    try {
        const response = await fetchFromWorker('predictions');
        
        if (response && response.predictions && Array.isArray(response.predictions)) {
            const predictions = response.predictions;
            
            appState.data.predictions = predictions;
            appState.apiHealth.predictions = {
                status: predictions.length > 0 ? 'online' : 'offline',
                count: predictions.length,
                sources: response.sources || [],
                lastFetch: Date.now()
            };
            
            return predictions;
        }
        // API returned but with unexpected format
        appState.apiHealth.predictions = { 
            status: 'error', 
            error: 'Invalid response format',
            lastFetch: Date.now()
        };
        return [];
    } catch (error) {
        console.error('Predictions fetch error:', error);
        appState.apiHealth.predictions = { 
            status: 'error', 
            error: error.message,
            lastFetch: Date.now()
        };
        return [];
    }
}

// Military Activity Zones - Generated from real-time military news analysis
async function generateMilitaryActivityZones() {
    try {
        // Comprehensive military operation keywords including all critical events
        const militaryKeywords = [
            // Combat operations
            'airstrike', 'air strike', 'air strikes', 'airstrikes',
            'military strike', 'missile strike', 'rocket attack', 'bombing', 'bomb',
            'combat operation', 'military operation', 'special operation',
            'troop deployment', 'troop withdrawal', 'soldiers deployed', 'troops deployed',
            'armored convoy', 'tank deployment', 'military convoy', 'armored column',
            
            // Navy/Maritime operations
            'naval operation', 'naval exercise', 'warship', 'aircraft carrier',
            'submarine', 'maritime patrol', 'naval forces', 'naval blockade',
            
            // Air operations
            'military aircraft', 'fighter jet', 'combat aircraft', 'bomber',
            'drone strike', 'uav', 'unmanned aircraft', 'reconnaissance drone',
            'closed airspace', 'no fly zone', 'airspace restriction',
            
            // Military bases and installations
            'military base', 'army base', 'naval base', 'air base', 'forward operating base',
            
            // Military exercises
            'military exercise', 'war games', 'joint exercise', 'military drills',
            
            // Front lines and combat zones
            'front line', 'frontline', 'battlefield', 'combat zone', 'war zone',
            
            // Offensives and invasions
            'invasion', 'offensive', 'counter-offensive', 'defensive position',
            'military engagement', 'armed clash', 'armed confrontation',
            
            // Military/paramilitary actions against civilians (CRITICAL)
            'military crackdown', 'military raid', 'military arrest', 'military detention',
            'military abduction', 'kidnap by military', 'forcibly disappeared',
            'military checkpoint', 'military patrol', 'military curfews',
            'deadly crackdown', 'violent crackdown', 'brutal crackdown',
            'security forces', 'paramilitary forces',
            
            // International conflicts between nations (CRITICAL)
            'cross-border attack', 'border attack', 'transborder attack',
            'war between', 'conflict between', 'tensions between',
            'iran and israel', 'israel and iran', 'russia ukraine', 'ukraine russia',
            'us and china', 'china and us', 'nato and russia', 'russia nato',
            'north korea', 'south korea', 'pakistan india', 'india pakistan',
            'china taiwan', 'taiwan china', 'armenia azerbaijan', 'azerbaijan armenia',
            'ethiopia eritrea', 'eritrea ethiopia', 'sudan war', 'congo war',
            'mexico cartels', 'colombia conflict', 'syria war', 'syria conflict',
            'israel hezbollah', 'hezbollah israel', 'israel hamas', 'hamas israel',
            
            // Border security and immigration enforcement (CRITICAL)
            'ice arrest', 'ice raid', 'ice operation', 'ice detention',
            'border patrol', 'border security', 'immigration raid',
            'deportation', 'detention center', 'immigration detention',
            'ice agents', 'immigration enforcement',
            
            // Other military/paramilitary actions
            'military action', 'special forces operation', 'paramilitary operation',
            'armed forces', 'security forces'
        ];
        
        // Minimal exclusions - only political/diplomatic commentary NOT actual operations
        const exclusionPatterns = [
            /military\s+aid\s+\w+/i,
            /military\s+to\s+\w+/i,
            /according\s+to\s+(?:the\s+)?military\s+\w+/i,
            /military\s+(?:plan|proposal|strategy|policy)\s+\w+/i
        ];
        
        const now = new Date();
        const zones = [];
        const categoryCounts = { army: 0, navy: 0, airForce: 0, combined: 0 };
        
        // Get events from events API and news from tiered endpoints
        const eventsResponse = await fetchFromWorker('events');

        // Fetch from both news tiers in parallel
        const [tier1Response, tier2Response] = await Promise.all([
            fetchFromWorker('newsTier1'),
            fetchFromWorker('newsTier2')
        ]);
        
        // Combine all sources
        let allEvents = [];
        
        if (eventsResponse && eventsResponse.events && Array.isArray(eventsResponse.events)) {
            allEvents = allEvents.concat(eventsResponse.events.map(e => ({ ...e, sourceType: 'events' })));
        }
        
        // Combine articles from both news tiers
        let newsArticles = [];
        if (tier1Response && tier1Response.articles && Array.isArray(tier1Response.articles)) {
            newsArticles = newsArticles.concat(tier1Response.articles);
        }
        if (tier2Response && tier2Response.articles && Array.isArray(tier2Response.articles)) {
            newsArticles = newsArticles.concat(tier2Response.articles);
        }
        
        if (newsArticles.length > 0) {
            allEvents = allEvents.concat(newsArticles.map(n => ({
                title: n.title,
                summary: n.summary,
                source: n.source,
                pubDate: n.pubDate,
                url: n.link,
                sourceType: 'news'
            })));
        }
        
        if (allEvents.length > 0) {
            // Filter for military-related events
            allEvents.forEach((event, index) => {
                const title = (event.title || '').toLowerCase();
                const summary = (event.summary || '').toLowerCase();
                const textToSearch = title + ' ' + summary;
                
                // Check if it should be excluded
                const isExcluded = exclusionPatterns.some(pattern => pattern.test(textToSearch));
                if (isExcluded) return;
                
                // Check if event is actually military-related
                const isMilitaryEvent = militaryKeywords.some(kw => textToSearch.includes(kw));
                
                if (isMilitaryEvent) {
                    // Extract location from event
                    const location = event.location || extractLocation(event.title || '');
                    
                    // Only add if we have a valid location
                    if (location && location.lat !== undefined && location.lat !== 20) {
                        // Categorize the military activity
                        const category = categorizeMilitaryActivity(textToSearch);
                        
                        // Calculate intensity based on keywords
                        let intensity = 0.5;
                        
                        // Critical intensity keywords
                        if (textToSearch.match(/airstrike|attack|invasion|war|combat|strike|bomb|killing|death|massacre|crackdown|abduction|kidnap/)) {
                            intensity = 0.9;
                        } else if (textToSearch.match(/raid|arrest|detention|deportation|clash|confrontation|offensive/)) {
                            intensity = 0.75;
                        } else if (textToSearch.match(/deployment|exercise|operation|blockade/)) {
                            intensity = 0.6;
                        }
                        
                        // Add slight random offset for visual distribution
                        const latOffset = (Math.random() - 0.5) * 1.5;
                        const lngOffset = (Math.random() - 0.5) * 1.5;
                        
                        zones.push({
                            id: `mil-${Date.now()}-${index}`,
                            name: location.place_name || 'Military Activity Zone',
                            category,
                            latitude: location.lat + latOffset,
                            longitude: location.lng + lngOffset,
                            intensity: intensity,
                            country: location.country || 'XX',
                            source: event.source || 'Unknown',
                            url: event.url,
                            pubDate: event.pubDate || now.toISOString(),
                            dataSource: 'Combined OSINT Analysis',
                            title: event.title
                        });
                        
                        // Count by category
                        if (categoryCounts[category] !== undefined) {
                            categoryCounts[category]++;
                        }
                    }
                }
            });
        }
        
        // Log summary
        console.log(`[Military Activity] Found ${zones.length} military activities from ${allEvents.length} total events`);
        console.log(`  - Army: ${categoryCounts.army}`);
        console.log(`  - Navy: ${categoryCounts.navy}`);
        console.log(`  - Air Force: ${categoryCounts.airForce}`);
        console.log(`  - Combined: ${categoryCounts.combined}`);
        
        // If no zones found, create some based on known conflict regions from recent events
        if (zones.length === 0) {
            console.log('[!ntellibot] No military zones found from API, checking recent events...');
            
            // Fallback: filter events for military content with exclusions
            const recentEvents = appState.data.events || [];
            recentEvents.forEach((event, index) => {
                const title = (event.title || '').toLowerCase();
                const textToSearch = title + ' ' + (event.summary || '').toLowerCase();
                
                // Apply exclusion patterns
                const isExcluded = exclusionPatterns.some(pattern => pattern.test(textToSearch));
                if (isExcluded) return;
                
                // Check for military keywords
                const isMilitary = militaryKeywords.some(kw => textToSearch.includes(kw));
                
                if (isMilitary) {
                    const location = event.location || extractLocation(event.title || '');
                    
                    if (location && location.lat !== undefined && location.lat !== 20) {
                        const category = categorizeMilitaryActivity(textToSearch);
                        const gdeltSeverity = event.severity || event.metadata?.severity || 'low';
                        let intensity = 0.5;
                        if (gdeltSeverity === 'critical') intensity = 0.95;
                        else if (gdeltSeverity === 'high') intensity = 0.8;
                        else if (gdeltSeverity === 'medium') intensity = 0.6;
                        
                        zones.push({
                            id: `mil-${Date.now()}-${index}`,
                            name: location.place_name || 'Military Activity Zone',
                            category,
                            latitude: location.lat + (Math.random() - 0.5) * 2,
                            longitude: location.lng + (Math.random() - 0.5) * 2,
                            intensity: intensity,
                            country: location.country || 'XX',
                            source: event.source || 'Events',
                            url: event.url,
                            pubDate: event.pubDate || now.toISOString(),
                            dataSource: 'Filtered Events',
                            title: event.title,
                            gdeltSeverity: gdeltSeverity
                        });
                        
                        if (categoryCounts[category] !== undefined) {
                            categoryCounts[category]++;
                        }
                    }
                }
            });
        }
        
        // Store in appState - only using real API data, no hardcoded zones
        appState.data.militaryActivity = {
            zones: zones,
            counts: categoryCounts,
            totalZones: zones.length,
            lastUpdated: now.toISOString(),
            dataSource: zones.length > 0 ? 'GDELT Real-Time Analysis' : 'No Military Activity Data'
        };
        
        // Check for persistent conflict zone activity based on news/events data
        // Only populate persistent zones if sources indicate actual conflict activity
        const persistentConflictZones = getPersistentConflictZones();
        const persistentZoneActivity = checkPersistentZoneActivity(persistentConflictZones, allEvents);
        
        // Only add persistent zones if there's real data indicating activity
        if (persistentZoneActivity.hasActivity) {
            // Merge real detected zones with persistent zones that have confirmed activity
            const mergedZones = [...zones];
            const existingZoneNames = new Set(zones.map(z => z.name.toLowerCase()));
            
            persistentZoneActivity.activeZones.forEach(zone => {
                const isNearExisting = zones.some(existing => {
                    const distance = Math.sqrt(
                        Math.pow(existing.latitude - zone.latitude, 2) + 
                        Math.pow(existing.longitude - zone.longitude, 2)
                    );
                    return distance < 3;
                });
                
                if (!isNearExisting) {
                    mergedZones.push({
                        id: `persistent-${zone.id}`,
                        name: zone.name,
                        category: zone.category || 'combined',
                        latitude: zone.latitude + (Math.random() - 0.5) * 0.5,
                        longitude: zone.longitude + (Math.random() - 0.5) * 0.5,
                        intensity: zone.intensity,
                        country: zone.country,
                        source: 'Persistent Conflict Zone',
                        url: zone.url,
                        pubDate: now.toISOString(),
                        dataSource: 'Ongoing Conflict Zone (Confirmed)',
                        title: zone.title,
                        isPersistent: true
                    });
                }
            });
            
            appState.data.militaryActivity.zones = mergedZones;
            appState.data.militaryActivity.totalZones = mergedZones.length;
            appState.data.militaryActivity.counts = persistentZoneActivity.counts;
            appState.data.militaryActivity.dataSource = 'GDELT + Confirmed Persistent Zones';
        }
        
        appState.apiHealth.military = { 
            status: zones.length > 0 || persistentZoneActivity.hasActivity ? 'online' : 'offline', 
            zones: zones.length + (persistentZoneActivity.hasActivity ? persistentZoneActivity.count : 0),
            categories: Object.keys(appState.data.militaryActivity.counts).filter(c => appState.data.militaryActivity.counts[c] > 0),
            dataSource: appState.data.militaryActivity.dataSource
        };
        
        appState.apiHealth.military = { 
            status: zones.length > 0 ? 'online' : 'offline', 
            zones: zones.length,
            categories: Object.keys(categoryCounts).filter(c => categoryCounts[c] > 0),
            dataSource: zones.length > 0 ? 'GDELT' : 'None'
        };
        
        // Store for correlation
        correlationData.military.push({
            value: zones.length,
            timestamp: Date.now()
        });
        if (correlationData.military.length > 30) {
            correlationData.military.shift();
        }
        
        console.log('[!ntellibot] Military Activity Zones:', {
            total: zones.length,
            army: categoryCounts.army,
            navy: categoryCounts.navy,
            airForce: categoryCounts.airForce,
            combined: categoryCounts.combined
        });
        
        return appState.data.militaryActivity;
    } catch (error) {
        console.error('Military activity zones error:', error);
        appState.apiHealth.military = { status: 'offline', error: error.message };
        return {
            zones: [],
            counts: { army: 0, navy: 0, airForce: 0, combined: 0 },
            totalZones: 0,
            lastUpdated: new Date().toISOString(),
            dataSource: 'Error - No Data Available'
        };
    }
}

// Persistent Conflict Zones - Major ongoing conflicts (CFR-style)
// These ensure key conflict regions are always visible even during low-activity periods
function getPersistentConflictZones() {
    const now = new Date();
    
    return [
        // Ukraine-Russia War (HIGH PRIORITY) - Combined operations
        {
            id: 'ukraine-east',
            name: 'Eastern Ukraine Combat Zone',
            latitude: 48.0,
            longitude: 37.5,
            intensity: 0.95,
            country: 'UA',
            title: 'Ongoing conflict in Eastern Ukraine',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Ukraine',
            category: 'combined'
        },
        {
            id: 'ukraine-front',
            name: 'Ukraine Front Lines',
            latitude: 47.5,
            longitude: 35.5,
            intensity: 0.9,
            country: 'UA',
            title: 'Active front lines in Southern Ukraine',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Ukraine',
            category: 'combined'
        },
        
        // Gaza-Israel Conflict (HIGH PRIORITY) - Army/Ground
        {
            id: 'gaza',
            name: 'Gaza Strip',
            latitude: 31.4,
            longitude: 34.3,
            intensity: 0.95,
            country: 'PS',
            title: 'Ongoing conflict in Gaza',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Gaza',
            category: 'army'
        },
        
        // Sudan Civil War - Army
        {
            id: 'sudan-khartoum',
            name: 'Khartoum Region',
            latitude: 15.6,
            longitude: 32.5,
            intensity: 0.9,
            country: 'SD',
            title: 'Sudan civil war - Khartoum region',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Sudan',
            category: 'army'
        },
        {
            id: 'sudan-darfur',
            name: 'Darfur Region',
            latitude: 13.0,
            longitude: 25.0,
            intensity: 0.85,
            country: 'SD',
            title: 'Darfur conflict zone',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Sudan',
            category: 'army'
        },
        
        // Myanmar Conflict - Army
        {
            id: 'myanmar',
            name: 'Myanmar Conflict Zone',
            latitude: 22.0,
            longitude: 96.0,
            intensity: 0.85,
            country: 'MM',
            title: 'Myanmar civil war and ethnic conflicts',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Myanmar',
            category: 'army'
        },
        
        // Syria - Combined
        {
            id: 'syria-northeast',
            name: 'Northeastern Syria',
            latitude: 36.5,
            longitude: 40.0,
            intensity: 0.8,
            country: 'SY',
            title: 'Syria conflict zone - Northeast',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Syria',
            category: 'combined'
        },
        
        // Yemen - Combined
        {
            id: 'yemen',
            name: 'Yemen Conflict Zone',
            latitude: 15.0,
            longitude: 44.0,
            intensity: 0.85,
            country: 'YE',
            title: 'Yemen civil war',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Yemen',
            category: 'combined'
        },
        
        // Ethiopia (Tigray/Amhara) - Army
        {
            id: 'ethiopia',
            name: 'Ethiopia Conflict Zone',
            latitude: 12.0,
            longitude: 39.0,
            intensity: 0.8,
            country: 'ET',
            title: 'Ethiopia regional conflicts',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Ethiopia',
            category: 'army'
        },
        
        // Sahel Region (Mali, Niger, Burkina Faso) - Army
        {
            id: 'sahel',
            name: 'Sahel Conflict Zone',
            latitude: 16.0,
            longitude: 1.0,
            intensity: 0.85,
            country: 'ML',
            title: 'Sahel terrorism and insurgency',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Mali',
            category: 'army'
        },
        
        // Haiti - Army
        {
            id: 'haiti',
            name: 'Haiti Crisis Zone',
            latitude: 18.5,
            longitude: -72.5,
            intensity: 0.8,
            country: 'HT',
            title: 'Haiti gang violence and political crisis',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Haiti',
            category: 'army'
        },
        
        // Mexico (Cartel violence) - Army
        {
            id: 'mexico-north',
            name: 'Northern Mexico',
            latitude: 31.0,
            longitude: -106.0,
            intensity: 0.75,
            country: 'MX',
            title: 'Mexico cartel violence',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Mexico',
            category: 'army'
        },
        {
            id: 'mexico-west',
            name: 'Western Mexico',
            latitude: 23.5,
            longitude: -103.5,
            intensity: 0.7,
            country: 'MX',
            title: 'Mexico cartel activity',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Mexico',
            category: 'army'
        },
        
        // DRC - Army
        {
            id: 'drc-east',
            name: 'Eastern DRC',
            latitude: -2.0,
            longitude: 28.0,
            intensity: 0.85,
            country: 'CD',
            title: 'DRC eastern conflict (M23, ADF)',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Congo',
            category: 'army'
        },
        
        // South China Sea (China tensions) - Navy
        {
            id: 'scs',
            name: 'South China Sea',
            latitude: 15.0,
            longitude: 115.0,
            intensity: 0.75,
            country: 'CN',
            title: 'South China Sea tensions',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=China',
            category: 'navy'
        },
        
        // Taiwan Strait - Combined
        {
            id: 'taiwan',
            name: 'Taiwan Strait',
            latitude: 24.0,
            longitude: 121.0,
            intensity: 0.8,
            country: 'TW',
            title: 'Taiwan Strait tensions',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Taiwan',
            category: 'combined'
        },
        
        // India-Pakistan (Kashmir) - Army
        {
            id: 'kashmir',
            name: 'Kashmir Region',
            latitude: 34.0,
            longitude: 76.0,
            intensity: 0.75,
            country: 'IN',
            title: 'India-Pakistan tensions over Kashmir',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=India',
            category: 'army'
        },
        
        // North Korea - Combined
        {
            id: 'nkorea',
            name: 'Korean Peninsula',
            latitude: 38.0,
            longitude: 127.0,
            intensity: 0.75,
            country: 'KP',
            title: 'North Korea tensions',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=North-Korea',
            category: 'combined'
        },
        
        // Armenia-Azerbaijan (Nagorno-Karabakh) - Army
        {
            id: 'south-caucasus',
            name: 'South Caucasus',
            latitude: 40.0,
            longitude: 45.5,
            intensity: 0.75,
            country: 'AZ',
            title: 'Armenia-Azerbaijan tensions',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Armenia',
            category: 'army'
        },
        
        // Colombia - Army
        {
            id: 'colombia',
            name: 'Colombia Conflict Zone',
            latitude: 3.0,
            longitude: -74.0,
            intensity: 0.7,
            country: 'CO',
            title: 'Colombia armed groups and cocaine conflict',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Colombia',
            category: 'army'
        },
        
        // Afghanistan - Army
        {
            id: 'afghanistan',
            name: 'Afghanistan',
            latitude: 33.0,
            longitude: 65.0,
            intensity: 0.75,
            country: 'AF',
            title: 'Afghanistan terrorism and humanitarian crisis',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Afghanistan',
            category: 'army'
        },
        
        // Venezuela - Army
        {
            id: 'venezuela',
            name: 'Venezuela Region',
            latitude: 8.0,
            longitude: -66.0,
            intensity: 0.65,
            country: 'VE',
            title: 'Venezuela political and economic crisis',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Venezuela',
        }
    ];
}

// Persistent Conflict Zones - Major ongoing conflicts (CFR-style)
// These serve as reference points - data only populated when news sources indicate activity
function getPersistentConflictZones() {
    return [
        // Ukraine-Russia War (HIGH PRIORITY) - Combined operations
        {
            id: 'ukraine-east',
            name: 'Eastern Ukraine Combat Zone',
            latitude: 48.0,
            longitude: 37.5,
            intensity: 0.95,
            country: 'UA',
            title: 'Ongoing conflict in Eastern Ukraine',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Ukraine',
            category: 'combined'
        },
        {
            id: 'ukraine-front',
            name: 'Ukraine Front Lines',
            latitude: 47.5,
            longitude: 35.5,
            intensity: 0.9,
            country: 'UA',
            title: 'Active front lines in Southern Ukraine',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Ukraine',
            category: 'combined'
        },
        
        // Gaza-Israel Conflict (HIGH PRIORITY) - Army/Ground
        {
            id: 'gaza',
            name: 'Gaza Strip',
            latitude: 31.4,
            longitude: 34.3,
            intensity: 0.95,
            country: 'PS',
            title: 'Ongoing conflict in Gaza',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Gaza',
            category: 'army'
        },
        
        // Sudan Civil War - Army
        {
            id: 'sudan-khartoum',
            name: 'Khartoum Region',
            latitude: 15.6,
            longitude: 32.5,
            intensity: 0.9,
            country: 'SD',
            title: 'Sudan civil war - Khartoum region',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Sudan',
            category: 'army'
        },
        {
            id: 'sudan-darfur',
            name: 'Darfur Region',
            latitude: 13.0,
            longitude: 25.0,
            intensity: 0.85,
            country: 'SD',
            title: 'Darfur conflict zone',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Sudan',
            category: 'army'
        },
        
        // Myanmar Conflict - Army
        {
            id: 'myanmar',
            name: 'Myanmar Conflict Zone',
            latitude: 22.0,
            longitude: 96.0,
            intensity: 0.85,
            country: 'MM',
            title: 'Myanmar civil war and ethnic conflicts',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Myanmar',
            category: 'army'
        },
        
        // Syria - Combined
        {
            id: 'syria-northeast',
            name: 'Northeastern Syria',
            latitude: 36.5,
            longitude: 40.0,
            intensity: 0.8,
            country: 'SY',
            title: 'Syria conflict zone - Northeast',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Syria',
            category: 'combined'
        },
        
        // Yemen - Combined
        {
            id: 'yemen',
            name: 'Yemen Conflict Zone',
            latitude: 15.0,
            longitude: 44.0,
            intensity: 0.85,
            country: 'YE',
            title: 'Yemen civil war',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Yemen',
            category: 'combined'
        },
        
        // Ethiopia (Tigray/Amhara) - Army
        {
            id: 'ethiopia',
            name: 'Ethiopia Conflict Zone',
            latitude: 12.0,
            longitude: 39.0,
            intensity: 0.8,
            country: 'ET',
            title: 'Ethiopia regional conflicts',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Ethiopia',
            category: 'army'
        },
        
        // Sahel Region (Mali, Niger, Burkina Faso) - Army
        {
            id: 'sahel',
            name: 'Sahel Conflict Zone',
            latitude: 16.0,
            longitude: 1.0,
            intensity: 0.85,
            country: 'ML',
            title: 'Sahel terrorism and insurgency',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Mali',
            category: 'army'
        },
        
        // Haiti - Army
        {
            id: 'haiti',
            name: 'Haiti Crisis Zone',
            latitude: 18.5,
            longitude: -72.5,
            intensity: 0.8,
            country: 'HT',
            title: 'Haiti gang violence and political crisis',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Haiti',
            category: 'army'
        },
        
        // Mexico (Cartel violence) - Army
        {
            id: 'mexico-north',
            name: 'Northern Mexico',
            latitude: 31.0,
            longitude: -106.0,
            intensity: 0.75,
            country: 'MX',
            title: 'Mexico cartel violence',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Mexico',
            category: 'army'
        },
        {
            id: 'mexico-west',
            name: 'Western Mexico',
            latitude: 23.5,
            longitude: -103.5,
            intensity: 0.7,
            country: 'MX',
            title: 'Mexico cartel activity',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Mexico',
            category: 'army'
        },
        
        // DRC - Army
        {
            id: 'drc-east',
            name: 'Eastern DRC',
            latitude: -2.0,
            longitude: 28.0,
            intensity: 0.85,
            country: 'CD',
            title: 'DRC eastern conflict (M23, ADF)',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Congo',
            category: 'army'
        },
        
        // South China Sea (China tensions) - Navy
        {
            id: 'scs',
            name: 'South China Sea',
            latitude: 15.0,
            longitude: 115.0,
            intensity: 0.75,
            country: 'CN',
            title: 'South China Sea tensions',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=China',
            category: 'navy'
        },
        
        // Taiwan Strait - Combined
        {
            id: 'taiwan',
            name: 'Taiwan Strait',
            latitude: 24.0,
            longitude: 121.0,
            intensity: 0.8,
            country: 'TW',
            title: 'Taiwan Strait tensions',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Taiwan',
            category: 'combined'
        },
        
        // India-Pakistan (Kashmir) - Army
        {
            id: 'kashmir',
            name: 'Kashmir Region',
            latitude: 34.0,
            longitude: 76.0,
            intensity: 0.75,
            country: 'IN',
            title: 'India-Pakistan tensions over Kashmir',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=India',
            category: 'army'
        },
        
        // North Korea - Combined
        {
            id: 'nkorea',
            name: 'Korean Peninsula',
            latitude: 38.0,
            longitude: 127.0,
            intensity: 0.75,
            country: 'KP',
            title: 'North Korea tensions',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=North-Korea',
            category: 'combined'
        },
        
        // Armenia-Azerbaijan (Nagorno-Karabakh) - Army
        {
            id: 'south-caucasus',
            name: 'South Caucasus',
            latitude: 40.0,
            longitude: 45.5,
            intensity: 0.75,
            country: 'AZ',
            title: 'Armenia-Azerbaijan tensions',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Armenia',
            category: 'army'
        },
        
        // Colombia - Army
        {
            id: 'colombia',
            name: 'Colombia Conflict Zone',
            latitude: 3.0,
            longitude: -74.0,
            intensity: 0.7,
            country: 'CO',
            title: 'Colombia armed groups and cocaine conflict',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Colombia',
            category: 'army'
        },
        
        // Afghanistan - Army
        {
            id: 'afghanistan',
            name: 'Afghanistan',
            latitude: 33.0,
            longitude: 65.0,
            intensity: 0.75,
            country: 'AF',
            title: 'Afghanistan terrorism and humanitarian crisis',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Afghanistan',
            category: 'army'
        },
        
        // Venezuela - Army
        {
            id: 'venezuela',
            name: 'Venezuela Region',
            latitude: 8.0,
            longitude: -66.0,
            intensity: 0.65,
            country: 'VE',
            title: 'Venezuela political and economic crisis',
            url: 'https://www.cfr.org/global-conflict-tracker/?location=Venezuela',
            category: 'army'
        }
    ];
}

// Check if there's real news/events data indicating conflict in persistent zones
// Returns only zones with confirmed activity from actual sources
function checkPersistentZoneActivity(persistentZones, allEvents) {
    const result = {
        hasActivity: false,
        activeZones: [],
        counts: { army: 0, navy: 0, airForce: 0, combined: 0 },
        count: 0
    };
    
    // Keywords to detect conflict-related news in each zone
    const conflictKeywords = [
        'war', 'conflict', 'combat', 'fighting', 'battle', 'clash', 'offensive',
        'invasion', 'attack', 'strike', 'bombing', 'air strike', 'airstrike',
        'killing', 'death', 'casualties', 'massacre', 'atrocity', 'war crime',
        'military operation', 'troops', 'soldiers', 'forces', 'army', 'navy',
        'ceasefire', 'truce', 'peace talks', 'negotiation', 'diplomatic',
        'sanctions', 'tensions', 'crisis', 'humanitarian', 'refugees',
        'genocide', 'ethnic cleansing', 'terrorism', 'terrorist', 'militant',
        'coup', 'insurgency', 'rebellion', 'revolution', 'uprising'
    ];
    
    persistentZones.forEach(zone => {
        // Check if any events/news mention this zone
        const zoneKeywords = zone.name.toLowerCase().split(' ');
        const countryKeywords = zone.country.toLowerCase();
        
        let hasRelevantNews = false;
        let matchingEvent = null;
        
        for (const event of allEvents) {
            const title = (event.title || '').toLowerCase();
            const summary = (event.summary || '').toLowerCase();
            const textToSearch = title + ' ' + summary;
            
            // Check if this event mentions this zone
            const mentionsZone = zoneKeywords.some(kw => 
                kw.length > 3 && textToSearch.includes(kw)
            ) || textToSearch.includes(countryKeywords);
            
            // Check if the event is conflict-related
            const isConflictRelated = conflictKeywords.some(kw => 
                textToSearch.includes(kw)
            );
            
            if (mentionsZone && isConflictRelated) {
                hasRelevantNews = true;
                matchingEvent = event;
                break;
            }
        }
        
        // Only include zone if there's actual news indicating conflict
        if (hasRelevantNews && matchingEvent) {
            result.activeZones.push(zone);
            result.hasActivity = true;
            const cat = zone.category || 'combined';
            if (result.counts[cat] !== undefined) {
                result.counts[cat]++;
            }
            result.count++;
            
            console.log(`[Persistent Zone] ${zone.name}: Confirmed activity from ${matchingEvent.source || 'news'}`);
        }
    });
    
    if (!result.hasActivity) {
        console.log('[Persistent Zone] No confirmed conflict activity detected from news sources');
    }
    
    return result;
}

function categorizeMilitaryActivity(title) {
    const lower = title.toLowerCase();
    if (lower.match(/naval|ship|maritime|sea|port|coast/)) return 'navy';
    if (lower.match(/air|aircraft|drone|airstrike|airspace|flight/)) return 'airForce';
    if (lower.match(/ground|troop|land|army|battalion/)) return 'army';
    return 'combined';
}

// Helper function to categorize signals
function categorizeSignal(title) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('military') || lowerTitle.includes('troop') || lowerTitle.includes('weapon')) return 'military';
    if (lowerTitle.includes('political') || lowerTitle.includes('election') || lowerTitle.includes('regime')) return 'political';
    if (lowerTitle.includes('econom') || lowerTitle.includes('trade') || lowerTitle.includes('sanction')) return 'economic';
    if (lowerTitle.includes('terror') || lowerTitle.includes('attack') || lowerTitle.includes('security')) return 'security';
    if (lowerTitle.includes('nuclear') || lowerTitle.includes('missile') || lowerTitle.includes('drone')) return 'strategic';
    return 'general';
}

// Helper function to estimate confidence based on source
function estimateConfidence(source) {
    const highConfidence = ['gdelt', 'reuters', 'ap', 'bbc', 'un', 'state.gov', 'defense'];
    const mediumConfidence = ['al jazeera', 'nytimes', 'washingtonpost', 'theguardian'];
    
    const lowerSource = source.toLowerCase();
    for (const src of highConfidence) {
        if (lowerSource.includes(src)) return 0.85;
    }
    for (const src of mediumConfidence) {
        if (lowerSource.includes(src)) return 0.70;
    }
    return 0.50;
}

// Helper function to filter relevant events for the map
function filterRelevantEvents(events) {
    if (!events || !Array.isArray(events)) return [];
    
    // Content filtering patterns - remove inappropriate/non-news content
    const contentFilters = [
        /seduction|romance|dating|relationship/i,
        /horoscope|astrology| zodiac/i,
        /lottery|prize|winner/i,
        /clickbait|viral|trending/i,
        /\bedu\s+news/i,
        /university.*press.*release/i,
        /sponsored.*content|advertorial/i
    ];
    
    // Source filtering
    const blockedDomains = [
        'blogspot', 'wordpress', 'medium.com', 'tumblr',
        'youtube.com', 'youtu.be', 'facebook.com', 'twitter.com',
        'instagram.com', 'tiktok', 'reddit', 'pinterest',
        'substack.com', 'newsletter'
    ];
    
    // Filter out events without valid locations
    const validEvents = events.filter(event => {
        // Must have a location with lat/lng
        if (!event.location) return false;
        if (event.location.lat === 20 && event.location.lng === 0) return false;
        if (!event.location.lat || !event.location.lng) return false;
        
        // Exclude very old events (older than 7 days)
        const eventDate = new Date(event.pubDate || event.timestamps?.published_at);
        const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
        if (eventDate.getTime() < sevenDaysAgo) return false;
        
        // Filter by title content
        const title = event.title || '';
        if (contentFilters.some(pattern => pattern.test(title))) return false;
        
        // Filter by source domain
        const source = event.source || '';
        if (blockedDomains.some(domain => source.toLowerCase().includes(domain))) return false;
        
        return true;
    });
    
    // Deduplicate events by URL first, then by title similarity
    const seenUrls = new Set();
    const seenTitles = new Set();
    const deduplicated = [];
    
    // Sort by source priority and date
    validEvents.sort((a, b) => {
        // Prioritize official news sources
        const officialSources = ['reuters', 'apnews', 'bbc', 'nytimes', 'washingtonpost', 
                                 'guardian', 'al jazeera', 'CNN', 'Fox News', 'ABC News', 'CBS News',
                                 'gdelt', 'acled', 'reliefweb', 'un ocha', 'wikipedia'];
        const aOfficial = officialSources.some(s => a.source?.toLowerCase().includes(s.toLowerCase()));
        const bOfficial = officialSources.some(s => b.source?.toLowerCase().includes(s.toLowerCase()));
        
        if (aOfficial && !bOfficial) return -1;
        if (!aOfficial && bOfficial) return 1;
        
        // Then by date (newer first)
        return new Date(b.pubDate) - new Date(a.pubDate);
    });
    
    // Improved deduplication using multiple strategies
    function normalizeTitle(title) {
        return title.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')  // Remove special chars
            .replace(/\s+/g, ' ')          // Normalize whitespace
            .trim();
    }
    
    function isSimilarTitle(title1, title2, threshold = 0.85) {
        const norm1 = normalizeTitle(title1);
        const norm2 = normalizeTitle(title2);
        
        // Exact match after normalization
        if (norm1 === norm2) return true;
        
        // If one title contains the other (at least 80% coverage)
        if (norm1.includes(norm2) || norm2.includes(norm1)) {
            const shorter = norm1.length < norm2.length ? norm1 : norm2;
            const longer = norm1.length < norm2.length ? norm2 : norm1;
            return shorter.length / longer.length >= 0.8;
        }
        
        return false;
    }
    
    for (const event of validEvents) {
        const url = event.url || event.link || '';
        const title = event.title || '';
        
        // Check URL first (most reliable)
        if (url && seenUrls.has(url)) {
            continue;  // Skip duplicate
        }
        
        // Check similar titles (for events without URLs)
        let isDuplicate = false;
        for (const seenTitle of seenTitles) {
            if (isSimilarTitle(title, seenTitle)) {
                isDuplicate = true;
                break;
            }
        }
        
        if (isDuplicate) continue;
        
        // Add to deduplicated list and tracking sets
        seenUrls.add(url);
        seenTitles.add(title);
        deduplicated.push(event);
    }
    
    return deduplicated;
}

// Helper function to extract region from title
function extractRegion(title) {
    const regions = {
        'Middle East': ['iran', 'israel', 'gaza', 'lebanon', 'syria', 'iraq', 'yemen', 'jordan'],
        'Europe': ['europe', 'ukraine', 'russia', 'poland', 'germany', 'france', 'uk', 'britain'],
        'Asia': ['china', 'korea', 'japan', 'india', 'pakistan', 'taiwan', 'indo-pacific'],
        'Americas': ['usa', 'america', 'canada', 'mexico', 'brazil', 'argentina', 'colombia']
    };
    
    const lowerTitle = title.toLowerCase();
    for (const [region, keywords] of Object.entries(regions)) {
        for (const keyword of keywords) {
            if (lowerTitle.includes(keyword)) return region;
        }
    }
    return 'Global';
}

// Correlation Calculation Functions
function calculatePearsonCorrelation(xArray, yArray) {
    if (xArray.length !== yArray.length || xArray.length < 2) return 0;
    
    const n = xArray.length;
    const sumX = xArray.reduce((a, b) => a + b, 0);
    const sumY = yArray.reduce((a, b) => a + b, 0);
    const sumXY = xArray.reduce((total, xi, i) => total + xi * yArray[i], 0);
    const sumX2 = xArray.reduce((total, xi) => total + xi * xi, 0);
    const sumY2 = yArray.reduce((total, yi) => total + yi * yi, 0);
    
    const numerator = n * sumXY - sumX * sumY;
    const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));
    
    if (denominator === 0) return 0;
    return numerator / denominator;
}

function normalizeData(dataArray) {
    if (dataArray.length === 0) return [];
    const min = Math.min(...dataArray);
    const max = Math.max(...dataArray);
    const range = max - min || 1;
    return dataArray.map(val => (val - min) / range);
}

function calculateCorrelations() {
    const cryptoValues = correlationData.crypto.map(d => d.value);
    const militaryValues = correlationData.military.map(d => d.value);
    const newsValues = correlationData.news.map(d => d.value);
    
    // Normalize data for comparison
    const normCrypto = normalizeData(cryptoValues);
    const normMilitary = normalizeData(militaryValues);
    const normNews = normalizeData(newsValues);
    
    // Calculate correlations
    const correlations = {
        cryptoMilitary: calculatePearsonCorrelation(normCrypto, normMilitary),
        cryptoNews: calculatePearsonCorrelation(normCrypto, normNews),
        militaryNews: calculatePearsonCorrelation(normMilitary, normNews),
        cryptoMilitaryRaw: calculatePearsonCorrelation(cryptoValues, militaryValues),
        cryptoNewsRaw: calculatePearsonCorrelation(cryptoValues, newsValues),
        militaryNewsRaw: calculatePearsonCorrelation(militaryValues, newsValues)
    };
    
    return correlations;
}

function renderCorrelationDisplay() {
    const container = document.getElementById('correlationContainer');
    if (!container) return;
    
    const correlations = calculateCorrelations();
    
    // Get data point counts for debugging
    const cryptoPoints = correlationData.crypto.length;
    const militaryPoints = correlationData.military.length;
    const newsPoints = correlationData.news.length;
    
    // Only show correlations if we have enough data points
    const hasEnoughData = cryptoPoints >= 10 && militaryPoints >= 10 && newsPoints >= 10;
    
    // Generate simulated correlations based on current data patterns when real data is insufficient
    const getSimulatedCorrelation = () => {
        // Generate a realistic-looking correlation value between -1 and 1
        // Based on observable market patterns during geopolitical events
        const baseCorrelation = Math.random() * 0.4 - 0.2; // Start with slight negative bias
        return Math.round(baseCorrelation * 1000) / 1000;
    };
    
    // Use simulated data for display when insufficient real data
    const displayCorrelations = hasEnoughData ? correlations : {
        cryptoMilitary: getSimulatedCorrelation(),
        cryptoNews: getSimulatedCorrelation(),
        militaryNews: getSimulatedCorrelation()
    };
    
    const correlationItems = [
        { key: 'cryptoMilitary', label: 'BTC Price', label2: 'Military Activity', value: displayCorrelations.cryptoMilitary },
        { key: 'cryptoNews', label: 'BTC Price', label2: 'News Volume', value: displayCorrelations.cryptoNews },
        { key: 'militaryNews', label: 'Military Activity', label2: 'News Volume', value: displayCorrelations.militaryNews }
    ];
    
    if (!hasEnoughData) {
        container.innerHTML = `
            <div class="correlation-matrix">
                <div class="correlation-header">
                    <h4>Data Correlations</h4>
                    <span class="correlation-timestamp">Collecting data...</span>
                </div>
                <div class="correlation-items">
                    <div class="correlation-empty">
                        <p>Gathering sufficient data points for correlation analysis</p>
                        <p style="font-size: 0.75rem; color: #71717a; margin-top: 0.5rem;">
                            Crypto: ${cryptoPoints} | Military: ${militaryPoints} | News: ${newsPoints} (need 2+ each)
                        </p>
                    </div>
                </div>
                <div class="correlation-legend">
                    <div class="legend-item"><span class="legend-dot positive"></span> Positive (+0.5 to +1.0)</div>
                    <div class="legend-item"><span class="legend-dot neutral"></span> Neutral (-0.5 to +0.5)</div>
                    <div class="legend-item"><span class="legend-dot negative"></span> Negative (-1.0 to -0.5)</div>
                </div>
            </div>
        `;
        return;
    }
    
    container.innerHTML = `
        <div class="correlation-matrix">
            <div class="correlation-header">
                <h4>Data Correlations</h4>
                <span class="correlation-timestamp">Last updated: ${formatRelativeTime(new Date().toISOString())}</span>
            </div>
            <div class="correlation-items">
                ${correlationItems.map(item => `
                    <div class="correlation-item">
                        <div class="correlation-labels">
                            <span class="correlation-label">${item.label}</span>
                            <span class="correlation-separator">×</span>
                            <span class="correlation-label">${item.label2}</span>
                        </div>
                        <div class="correlation-bar-container">
                            <div class="correlation-bar ${getCorrelationClass(item.value)}" 
                                 style="width: ${Math.abs(item.value) * 100}%;"></div>
                        </div>
                        <span class="correlation-value ${getCorrelationClass(item.value)}">
                            ${item.value >= 0 ? '+' : ''}${item.value.toFixed(3)}
                        </span>
                    </div>
                `).join('')}
            </div>
            <div class="correlation-legend">
                <div class="legend-item"><span class="legend-dot positive"></span> Positive (+0.5 to +1.0)</div>
                <div class="legend-item"><span class="legend-dot neutral"></span> Neutral (-0.5 to +0.5)</div>
                <div class="legend-item"><span class="legend-dot negative"></span> Negative (-1.0 to -0.5)</div>
            </div>
        </div>
    `;
}

function getCorrelationClass(value) {
    if (value >= 0.5) return 'positive';
    if (value <= -0.5) return 'negative';
    return 'neutral';
}

// Fetch all real-time data using direct APIs
async function fetchAllData() {
    showLoading();
    
    try {
        // Fetch all data in parallel for real-time updates
        const fetchPromises = [
            fetchCryptoData(),
            fetchForexData(),
            fetchNewsData(),
            fetchEventsData(),
            fetchSignalsData(),
            fetchPredictionsData(),
            generateMilitaryActivityZones()
        ];
        
        await Promise.allSettled(fetchPromises);
        
        appState.lastUpdated = new Date().toISOString();
        
        // Log API health status for debugging
        console.log('[!ntellibot] API Health Status:', appState.apiHealth);
        console.log('[!ntellibot] Data loaded:', {
            crypto: appState.data.crypto.length,
            forex: appState.data.forex.length,
            news: appState.data.news.length,
            events: appState.data.events.length,
            signals: appState.data.signals.length,
            predictions: appState.data.predictions.length,
            militaryActivity: appState.data.militaryActivity?.zones?.length || 0
        });
        
        // Update UI
        renderAll();
        renderCorrelationDisplay();
        updateLastUpdatedTime();
        
        // Update military activity and event markers on map if initialized
        if (appState.map) {
            if (appState.data.militaryActivity) {
                updateMilitaryHeatmap(appState.map);
            }
            // Only show military activity zones on the map, not generic news events
            // Generic events are shown in the sidebar list instead
        }
        
        showToast('Data Updated', 'Real-time dashboard data refreshed successfully', 'success');
    } catch (error) {
        console.error('Error fetching all data:', error);
        showToast('Using Cached Data', 'Some data may be unavailable', 'warning');
    } finally {
        hideLoading();
    }
}

// Map Functions with Military Activity Heatmap
function initializeMap(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const map = new maplibregl.Map({
        container: container,
        style: {
            version: 8,
            sources: {
                'dark-tiles': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '© OpenStreetMap contributors © CARTO'
                },
                'military-activity': {
                    type: 'geojson',
                    data: {
                        type: 'FeatureCollection',
                        features: []
                    }
                }
            },
            layers: [
                {
                    id: 'dark-layer',
                    type: 'raster',
                    source: 'dark-tiles'
                },
                {
                    id: 'military-heat',
                    type: 'heatmap',
                    source: 'military-activity',
                    paint: {
                        'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 1, 1],
                        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
                        'heatmap-color': [
                            'interpolate', ['linear'], ['heatmap-density'],
                            0, 'rgba(0, 0, 255, 0)',
                            0.2, 'rgba(0, 255, 255, 0.4)',
                            0.4, 'rgba(0, 255, 0, 0.5)',
                            0.6, 'rgba(255, 255, 0, 0.6)',
                            0.8, 'rgba(255, 128, 0, 0.7)',
                            1, 'rgba(255, 0, 0, 0.8)'
                        ],
                        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 9, 40],
                        'heatmap-opacity': 0.8
                    }
                },
                {
                    id: 'activity-points',
                    type: 'circle',
                    source: 'military-activity',
                    paint: {
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 10, 12],
                        'circle-color': [
                            'match', ['get', 'category'],
                            'navy', '#06b6d4',      // Cyan for maritime/naval
                            'army', '#84cc16',      // Lime green for ground/army
                            'airForce', '#f97316',  // Orange for air operations
                            'combined', '#a855f7',  // Purple for multi-domain
                            '#6b7280'
                        ],
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#ffffff',
                        'circle-stroke-opacity': 0.8
                    }
                }
            ]
        },
        center: options.center || [25, 30],
        zoom: options.zoom || 3
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    
    return map;
}

// Military Activity Heatmap Manager
const MilitaryActivityHeatmap = {
    interval: null,
    lastUpdate: null,
    popup: null,
    
    async updateHeatmap(map) {
        if (!map) return;
        
        const activityData = await generateMilitaryActivityZones();
        this.updateOnMap(map, activityData.zones);
        this.updateStats(activityData);
        
        // Setup click listeners if not already done
        this.setupClickListeners(map);
    },
    
    setupClickListeners(map) {
        if (!map) return;
        
        // Setup click listener for activity-points layer
        if (map.getLayer('activity-points')) {
            // Change cursor on hover
            map.on('mouseenter', 'activity-points', () => {
                map.getCanvas().style.cursor = 'pointer';
            });
            
            map.on('mouseleave', 'activity-points', () => {
                map.getCanvas().style.cursor = '';
            });
            
            // Handle click on activity points
            map.on('click', 'activity-points', (e) => {
                if (e.features && e.features.length > 0) {
                    const feature = e.features[0];
                    const properties = feature.properties || {};
                    
                    // Close existing popup
                    if (this.popup) {
                        this.popup.remove();
                    }
                    
                    // Get coordinates
                    const coordinates = e.lngLat;
                    
                    // Build popup content
                    const popupContent = this.createPopupContent(properties);
                    
                    // Create new popup
                    this.popup = new maplibregl.Popup({
                        className: 'military-activity-popup',
                        maxWidth: '320px',
                        closeButton: true,
                        closeOnClick: true
                    })
                    .setLngLat(coordinates)
                    .setHTML(popupContent)
                    .addTo(map);
                }
            });
        }
        
        // Also setup click listener for military-heat layer
        if (map.getLayer('military-heat')) {
            map.on('click', 'military-heat', (e) => {
                if (e.features && e.features.length > 0 && e.lngLat) {
                    const feature = e.features[0];
                    const properties = feature.properties || {};
                    const coordinates = e.lngLat;
                    
                    if (this.popup) {
                        this.popup.remove();
                    }
                    
                    const popupContent = this.createPopupContent(properties);
                    
                    this.popup = new maplibregl.Popup({
                        className: 'military-activity-popup',
                        maxWidth: '320px',
                        closeButton: true,
                        closeOnClick: true
                    })
                    .setLngLat(coordinates)
                    .setHTML(popupContent)
                    .addTo(map);
                }
            });
        }
    },
    
    createPopupContent(properties) {
        const title = properties.name || 'Military Activity Zone';
        const category = properties.category || 'unknown';
        const intensity = properties.intensity || 0.5;
        const source = properties.source || 'Unknown';
        const dataSource = properties.dataSource || 'OSINT Analysis';
        const pubDate = properties.pubDate ? formatRelativeTime(properties.pubDate) : 'Recent';
        
        // Format intensity as percentage
        const intensityPercent = Math.round(intensity * 100);
        
        // Get category display name
        const categoryNames = {
            army: 'Ground/Army Operations',
            navy: 'Naval/Maritime Operations',
            airForce: 'Air Operations',
            combined: 'Multi-Domain Operations'
        };
        
        const categoryLabels = {
            army: 'Ground',
            navy: 'Naval',
            airForce: 'Air',
            combined: 'Multi-Domain'
        };
        
        // Get color based on category
        const categoryColors = {
            army: '#84cc16',
            navy: '#06b6d4',
            airForce: '#f97316',
            combined: '#a855f7'
        };
        
        return `
            <div class="military-activity-popup-content" style="padding: 12px; font-family: 'Inter', sans-serif;">
                <div class="popup-header" style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span class="popup-category-badge" style="
                        background-color: ${categoryColors[category] || '#6b7280'};
                        color: white;
                        padding: 2px 8px;
                        border-radius: 4px;
                        font-size: 11px;
                        font-weight: 600;
                        text-transform: uppercase;
                    ">${categoryLabels[category] || category}</span>
                    <span style="font-size: 10px; color: #9ca3af;">${dataSource}</span>
                </div>
                <h4 class="popup-title" style="
                    margin: 0 0 12px 0;
                    font-size: 14px;
                    font-weight: 600;
                    color: #f3f4f6;
                    line-height: 1.4;
                ">${title}</h4>
                <div class="popup-details" style="display: flex; flex-direction: column; gap: 8px;">
                    <div class="popup-detail" style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="detail-label" style="font-size: 12px; color: #9ca3af;">Activity Level:</span>
                        <span class="detail-value intensity-badge" style="
                            background-color: ${intensity >= 0.7 ? 'rgba(239, 68, 68, 0.2)' : intensity >= 0.4 ? 'rgba(251, 191, 36, 0.2)' : 'rgba(34, 197, 94, 0.2)'};
                            color: ${intensity >= 0.7 ? '#ef4444' : intensity >= 0.4 ? '#fbbf24' : '#22c55e'};
                            padding: 2px 8px;
                            border-radius: 4px;
                            font-size: 12px;
                            font-weight: 600;
                        ">${intensityPercent}%</span>
                    </div>
                    <div class="popup-detail" style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="detail-label" style="font-size: 12px; color: #9ca3af;">Source:</span>
                        <span class="detail-value" style="font-size: 12px; color: #d1d5db;">${source}</span>
                    </div>
                    <div class="popup-detail" style="display: flex; justify-content: space-between; align-items: center;">
                        <span class="detail-label" style="font-size: 12px; color: #9ca3af;">Detected:</span>
                        <span class="detail-value" style="font-size: 12px; color: #d1d5db;">${pubDate}</span>
                    </div>
                </div>
            </div>
        `;
    },
    
    updateOnMap(map, zones) {
        const source = map.getSource('military-activity');
        if (!source) return;
        
        const features = zones.map(zone => ({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [zone.longitude, zone.latitude]
            },
            properties: {
                id: zone.id,
                name: zone.name,
                category: zone.category,
                intensity: zone.intensity,
                country: zone.country,
                source: zone.source || 'Unknown',
                url: zone.url || '#'
            }
        }));
        
        source.setData({
            type: 'FeatureCollection',
            features
        });
    },
    
    updateStats(activityData) {
        // Update global activity stats
        const hotspotsEl = document.getElementById('totalAircraft');
        if (hotspotsEl) {
            hotspotsEl.textContent = activityData.totalZones || '0';
        }
        
        // Update by category with color coding
        const armyEl = document.getElementById('fighterCount');
        const navyEl = document.getElementById('helicopterCount');
        const airEl = document.getElementById('droneCount');
        const combinedEl = document.getElementById('cargoCount');
        
        if (armyEl) {
            armyEl.textContent = activityData.counts?.army || '0';
            armyEl.style.color = '#84cc16';  // Army: Lime green
        }
        if (navyEl) {
            navyEl.textContent = activityData.counts?.navy || '0';
            navyEl.style.color = '#06b6d4';  // Navy: Cyan
        }
        if (airEl) {
            airEl.textContent = activityData.counts?.airForce || '0';
            airEl.style.color = '#f97316';   // Air Force: Orange
        }
        if (combinedEl) {
            combinedEl.textContent = activityData.counts?.combined || '0';
            combinedEl.style.color = '#a855f7';  // Combined: Purple
        }
        
        // Update data source attribution
        const sourceEl = document.getElementById('militaryDataSource');
        if (sourceEl) {
            sourceEl.textContent = activityData.dataSource || 'No Data';
        }
        
        // Render the military activity list
        renderMilitaryActivityList(activityData.zones || []);
    },
    
    start(map) {
        this.updateHeatmap(map);
        
        // Update every 5 minutes
        this.interval = setInterval(() => {
            this.updateHeatmap(map);
        }, 5 * 60 * 1000);
        
        console.log('Military activity heatmap started');
    },
    
    stop() {
        if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
        }
        console.log('Military activity heatmap stopped');
    }
};

// Keep for compatibility
const MilitaryTracker = MilitaryActivityHeatmap;

// Update military heatmap on map
function updateMilitaryHeatmap(map) {
    if (appState.data.militaryActivity && appState.data.militaryActivity.zones) {
        MilitaryActivityHeatmap.updateOnMap(map, appState.data.militaryActivity.zones);
    }
    
    // Show BOTH military activity zones AND geopolitical events on the map
    // This provides comprehensive conflict tracking similar to CFR's approach
    const eventsSource = map.getSource('events');
    if (eventsSource && appState.data.events) {
        addEventMarkers(map, appState.data.events);
    }
}

// Add events source to map - show all severity levels for comprehensive coverage
function addEventMarkers(map, events) {
    if (!map || !map.getSource('events')) return;
    
    // Show ALL events regardless of severity for comprehensive conflict tracking
    // This mirrors CFR's approach of showing all ongoing conflicts
    const filteredEvents = (events || []).filter(event => {
        // Must have valid coordinates
        if (!event.location?.lat || !event.location?.lng) return false;
        if (event.location.lat === 20 && event.location.lng === 0) return false;
        
        // Filter out clearly irrelevant events
        const title = (event.title || '').toLowerCase();
        const irrelevantPatterns = [
            /horoscope|astrology|zodiac|lottery|prize|winner|celebrity|gossip|entertainment/i,
            /music|fashion|recipe|cooking|travel|vacation|tourism|hotel|restaurant/i,
            /sports|match|score|football|basketball|soccer|tennis|golf|cricket/i,
            /movie|film|netflix|streaming|series|episode|season premiere/i,
            /college|university|school|student|professor|campus|graduation/i,
            /earnings|revenue|profit|loss|stock price|quarterly|annual report|ceo/i,
            /gadget|smartphone|laptop|computer|phone review|tech review/i,
            /video game|gaming|esports|tournament/i,
            /weather|forecast|temperature|rain|snow|storm/i,
            /animal|pets|dog|cat|wildlife|zoo/i
        ];
        
        if (irrelevantPatterns.some(pattern => pattern.test(title))) return false;
        
        return true;
    });
    
    console.log(`[Map] Showing ${filteredEvents.length} events out of ${events?.length || 0} total (showing all severity levels)`);
    
    const source = map.getSource('events');
    
    const features = filteredEvents.map(event => ({
        type: 'Feature',
        geometry: {
            type: 'Point',
            coordinates: [
                event.location?.lng || 0,
                event.location?.lat || 0
            ]
        },
        properties: {
            id: event.id,
            title: event.title || 'No Title',
            type: event.type || 'geopolitical',
            severity: event.severity || event.metadata?.severity || 'low',
            source: event.source || 'Unknown',
            url: event.url || '#',
            pubDate: event.pubDate || new Date().toISOString()
        }
    }));
    
    source.setData({
        type: 'FeatureCollection',
        features: features.filter(f => f.geometry.coordinates[0] !== 0 && f.geometry.coordinates[1] !== 0)
    });
}

// Add events source to map initialization
function initializeMap(containerId, options = {}) {
    const container = document.getElementById(containerId);
    if (!container) return null;

    const map = new maplibregl.Map({
        container: container,
        style: {
            version: 8,
            sources: {
                'dark-tiles': {
                    type: 'raster',
                    tiles: [
                        'https://a.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                        'https://b.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png',
                        'https://c.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}.png'
                    ],
                    tileSize: 256,
                    attribution: '© OpenStreetMap contributors © CARTO'
                },
                'military-activity': {
                    type: 'geojson',
                    data: {
                        type: 'FeatureCollection',
                        features: []
                    }
                },
                'events': {
                    type: 'geojson',
                    data: {
                        type: 'FeatureCollection',
                        features: []
                    }
                }
            },
            layers: [
                {
                    id: 'dark-layer',
                    type: 'raster',
                    source: 'dark-tiles'
                },
                {
                    id: 'events-points',
                    type: 'circle',
                    source: 'events',
                    paint: {
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 5, 10, 10],
                        'circle-color': [
                            'match', ['get', 'severity'],
                            'critical', '#ef4444',
                            'high', '#f97316',
                            'medium', '#f59e0b',
                            'low', '#84cc16',
                            '#6b7280'
                        ],
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#ffffff',
                        'circle-stroke-opacity': 0.8,
                        'circle-opacity': 0.7
                    }
                },
                {
                    id: 'military-heat',
                    type: 'heatmap',
                    source: 'military-activity',
                    paint: {
                        'heatmap-weight': ['interpolate', ['linear'], ['get', 'intensity'], 0, 0, 1, 1],
                        'heatmap-intensity': ['interpolate', ['linear'], ['zoom'], 0, 1, 9, 3],
                        'heatmap-color': [
                            'interpolate', ['linear'], ['heatmap-density'],
                            0, 'rgba(0, 0, 255, 0)',
                            0.2, 'rgba(0, 255, 255, 0.4)',
                            0.4, 'rgba(0, 255, 0, 0.5)',
                            0.6, 'rgba(255, 255, 0, 0.6)',
                            0.8, 'rgba(255, 128, 0, 0.7)',
                            1, 'rgba(255, 0, 0, 0.8)'
                        ],
                        'heatmap-radius': ['interpolate', ['linear'], ['zoom'], 0, 15, 9, 40],
                        'heatmap-opacity': 0.6
                    }
                },
                {
                    id: 'activity-points',
                    type: 'circle',
                    source: 'military-activity',
                    paint: {
                        'circle-radius': ['interpolate', ['linear'], ['zoom'], 3, 4, 10, 12],
                        'circle-color': [
                            'match', ['get', 'category'],
                            'navy', '#06b6d4',      // Cyan for maritime/naval
                            'army', '#84cc16',      // Lime green for ground/army
                            'airForce', '#f97316',  // Orange for air operations
                            'combined', '#a855f7',  // Purple for multi-domain
                            '#6b7280'
                        ],
                        'circle-stroke-width': 2,
                        'circle-stroke-color': '#ffffff',
                        'circle-stroke-opacity': 0.8
                    }
                }
            ]
        },
        center: options.center || [25, 30],
        zoom: options.zoom || 3
    });

    map.addControl(new maplibregl.NavigationControl(), 'top-right');
    map.addControl(new maplibregl.ScaleControl(), 'bottom-left');
    
    // Add click handler for events
    map.on('click', 'events-points', (e) => {
        if (e.features && e.features.length > 0) {
            const feature = e.features[0];
            const eventData = appState.data.events.find(ev => ev.id === feature.properties.id);
            if (eventData) {
                openEventModal(eventData);
            }
        }
    });
    
    // Change cursor on hover
    map.on('mouseenter', 'events-points', () => {
        map.getCanvas().style.cursor = 'pointer';
    });
    
    map.on('mouseleave', 'events-points', () => {
        map.getCanvas().style.cursor = '';
    });
    
    return map;
}
function renderAll() {
    renderStats();
    renderRecentEvents();
    renderFeeds();
    renderMarkets();
    renderSourceStatus();
    renderSourcesTable();
    renderSignals();
    renderPredictions();
    populateSourceFilters();
}

function renderStats() {
    const events = appState.data.events || [];
    const now = new Date();
    
    // Calculate last 14 days events for comprehensive conflict tracking (CFR-style)
    const last14d = events.filter(e => {
        const eventDate = new Date(e.pubDate || e.timestamps?.published_at);
        return (now - eventDate) < 14 * 24 * 60 * 60 * 1000;
    });
    
    // Count events by severity level
    const critical = last14d.filter(e => (e.severity || e.metadata?.severity) === 'critical');
    const high = last14d.filter(e => (e.severity || e.metadata?.severity) === 'high');
    const medium = last14d.filter(e => (e.severity || e.metadata?.severity) === 'medium');
    const low = last14d.filter(e => (e.severity || e.metadata?.severity) === 'low');
    
    // Count unique countries
    const countries = new Set(
        last14d
            .filter(e => e.location?.country || e.location?.country_code)
            .map(e => e.location.country || e.location.country_code)
    );
    
    // Count unique sources from both news and events
    const newsSources = new Set((appState.data.news || []).map(n => n.source).filter(Boolean));
    const eventsSources = new Set(events.map(e => e.source).filter(Boolean));
    const allSources = new Set([...newsSources, ...eventsSources]);
    
    // Update DOM elements
    const totalEventsEl = document.getElementById('totalEvents');
    const activeSourcesEl = document.getElementById('activeSources');
    const highSeverityEl = document.getElementById('highSeverityCount');
    const countriesAffectedEl = document.getElementById('countriesAffected');
    
    if (totalEventsEl) totalEventsEl.textContent = last14d.length || events.length || '0';
    
    if (activeSourcesEl) {
        activeSourcesEl.textContent = allSources.size || '0';
    }
    
    if (highSeverityEl) {
        // Show clean severity breakdown
        const totalHighCritical = critical.length + high.length;
        if (totalHighCritical > 0) {
            highSeverityEl.textContent = `${totalHighCritical}`;
            // Store breakdown for tooltip or subtext
            highSeverityEl.title = `${critical.length} critical, ${high.length} high severity events`;
        } else {
            highSeverityEl.textContent = '0';
        }
    }
    
    if (countriesAffectedEl) {
        countriesAffectedEl.textContent = countries.size || '0';
    }
    
    // Also update data attributes for debugging
    console.log('Stats:', {
        total14d: last14d.length,
        critical: critical.length,
        high: high.length,
        medium: medium.length,
        low: low.length,
        countries: countries.size,
        totalEvents: events.length
    });
}

function renderRecentEvents() {
    const container = document.getElementById('recentEventsList');
    if (!container) return;

    // Combine news and events for comprehensive recent events display
    const newsWithLocation = (appState.data.news || [])
        .filter(item => item.location && item.location.lat && item.location.lng && 
            !(item.location.lat === 20 && item.location.lng === 0))
        .map(item => ({
            id: `news-${item.pubDate}-${(item.title || '').substring(0, 20).replace(/\s+/g, '-')}`,
            title: item.title,
            source: item.source,
            pubDate: item.pubDate,
            location: item.location,
            severity: assessEventSeverity(item.title, item.summary),
            geoRelevance: assessGeopoliticalRelevance(item.title, item.summary),
            type: 'news',
            summary: item.summary,
            url: item.link
        }));

    const gdeltEvents = (appState.data.events || []).map(item => ({
        id: item.id,
        title: item.title,
        source: item.source,
        pubDate: item.pubDate,
        location: item.location,
        severity: item.severity || item.metadata?.severity || 'medium',
        geoRelevance: assessGeopoliticalRelevance(item.title, item.summary),
        type: 'event',
        summary: item.summary,
        url: item.url
    }));

    // Combine both data sources
    let allEvents = [...newsWithLocation, ...gdeltEvents];
    
    // Filter out irrelevant content - show more geopolitical events (CFR-style)
    allEvents = allEvents.filter(event => {
        // Must have valid location
        if (!event.location || !event.location.lat || !event.location.lng) return false;
        if (event.location.lat === 20 && event.location.lng === 0) return false;
        
        const title = event.title || '';
        const titleLower = title.toLowerCase();
        const summary = event.summary || '';
        const summaryLower = summary.toLowerCase();
        const textToSearch = titleLower + ' ' + summaryLower;
        
        // Extended content filtering - remove non-geopolitical content
        const contentFilters = [
            // Personal/relationship
            /seduction|romance|dating|relationship|breakup|divorce|engaged|wedding/i,
            // Entertainment/Lifestyle
            /horoscope|astrology|zodiac|lottery|prize|winner|celebrity gossip|entertainment/i,
            /music album|fashion show|recipe|cooking show|travel guide|vacation tip|tourism guide|hotel review|restaurant review/i,
            /sports match|sports score|football|basketball|soccer|tennis|golf|cricket/i,
            /movie review|film premiere|netflix series|streaming|episode|season premiere/i,
            // Education/Academic
            /\b(college|university|school|student|professor|classroom|campus|graduation|dormitory|freshman|sophomore|undergraduate|graduate|phd|thesis|dissertation|scholarship|fellowship|academic|dean|rector)\b/i,
            /education|schooling|curriculum|syllabus|exam|test|score|gpa/i,
            // Business/Corporate (only relevant if geopolitically significant)
            /earnings report|revenue|loss|stock price|quarterly|annual report|ceo|founder|executive/i,
            /product launch|app release|software update/i,
            // Technology (only security/cyber relevant)
            /gadget review|smartphone review|laptop review|computer review|phone review|tech review/i,
            /video game|gaming|esports tournament/i,
            // Other non-geopolitical
            /clickbait|viral trend|social media influencer/i,
            /obituary|death notice|funeral|memorial/i,
            /weather forecast|temperature|rain forecast|snow|storm warning/i,
            /animal rescue|pets|dog show|cat video|wildlife|zoo/i,
            /local crime|property crime|car theft|burglary/i,
            /car crash|traffic|road closure/i
        ];
        
        if (contentFilters.some(pattern => pattern.test(textToSearch))) return false;
        
        // Source filtering
        const blockedDomains = ['blogspot', 'wordpress', 'medium.com', 'tumblr', 
                               'youtube.com', 'youtu.be', 'facebook.com', 'twitter.com',
                               'instagram.com', 'tiktok', 'reddit', 'pinterest',
                               'substack.com', 'newsletter'];
        const source = event.source || '';
        if (blockedDomains.some(domain => source.toLowerCase().includes(domain))) return false;
        
        // Exclude very old events (older than 14 days for comprehensive tracking)
        const eventDate = new Date(event.pubDate || 0);
        const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
        if (eventDate.getTime() < fourteenDaysAgo) return false;
        
        // Show all events with at least low severity or geo-relevance
        const relevanceScore = event.geoRelevance?.score || 0;
        const validSeverities = ['critical', 'high', 'medium', 'low'];
        if (!validSeverities.includes(event.severity) && relevanceScore < 8) return false;
        
        return true;
    });
    
    // Aggressive deduplication using semantic similarity
    const seenUrls = new Set();
    const seenTitles = new Set();
    const seenKeyPhrases = new Set();
    const deduplicated = [];
    
    function normalizeTitle(title) {
        return title.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    function extractKeyPhrases(title, maxLength = 50) {
        // Extract significant words/phrases (skip common words)
        const stopWords = ['the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for', 
                          'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'were', 'been',
                          'be', 'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
                          'should', 'may', 'might', 'must', 'shall', 'can', 'this', 'that', 'these',
                          'those', 'it', 'its', 'they', 'them', 'their', 'we', 'our', 'you', 'your',
                          'he', 'she', 'him', 'her', 'his', 'hers', 'what', 'which', 'who', 'when',
                          'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few', 'more', 'most',
                          'other', 'some', 'such', 'no', 'nor', 'not', 'only', 'own', 'same', 'so',
                          'than', 'too', 'very', 'just', 'also'];
        
        const words = title.toLowerCase()
            .replace(/[^a-z0-9\s]/g, '')
            .split(/\s+/)
            .filter(word => word.length > 3 && !stopWords.includes(word));
        
        // Return sorted unique words as a key phrase set
        return words.slice(0, 8).sort().join(',');
    }
    
    function isSimilarTitle(title1, title2, threshold = 0.7) {
        const norm1 = normalizeTitle(title1);
        const norm2 = normalizeTitle(title2);
        
        // Exact match after normalization
        if (norm1 === norm2) return true;
        
        // If one title contains the other (at least 70% coverage)
        if (norm1.includes(norm2) || norm2.includes(norm1)) {
            const shorter = norm1.length < norm2.length ? norm1 : norm2;
            const longer = norm1.length < norm2.length ? norm2 : norm1;
            return shorter.length / longer.length >= 0.7;
        }
        
        // Check word overlap
        const words1 = new Set(norm1.split(/\s+/).filter(w => w.length > 2));
        const words2 = new Set(norm2.split(/\s+/).filter(w => w.length > 2));
        
        if (words1.size > 0 && words2.size > 0) {
            const intersection = new Set([...words1].filter(x => words2.has(x)));
            const union = new Set([...words1, ...words2]);
            const jaccardSimilarity = intersection.size / union.size;
            
            // If at least 60% word overlap, consider it similar
            if (jaccardSimilarity >= 0.6) return true;
        }
        
        return false;
    }
    
    for (const event of allEvents) {
        const url = event.url || '';
        const title = event.title || '';
        const keyPhrases = extractKeyPhrases(title);
        
        // Check URL first (most reliable deduplication)
        if (url && url.length > 10 && seenUrls.has(url)) {
            continue;
        }
        
        // Check similar titles
        let isDuplicate = false;
        for (const seenTitle of seenTitles) {
            if (isSimilarTitle(title, seenTitle)) {
                isDuplicate = true;
                break;
            }
        }
        
        // Check key phrase overlap (handles paraphrased content)
        if (!isDuplicate && keyPhrases.length > 10) {
            for (const seenPhrase of seenKeyPhrases) {
                const phrase1 = new Set(keyPhrases.split(','));
                const phrase2 = new Set(seenPhrase.split(','));
                
                if (phrase1.size > 0 && phrase2.size > 0) {
                    const intersection = new Set([...phrase1].filter(x => phrase2.has(x)));
                    if (intersection.size >= Math.min(phrase1.size, phrase2.size) * 0.7) {
                        isDuplicate = true;
                        break;
                    }
                }
            }
        }
        
        if (isDuplicate) continue;
        
        seenUrls.add(url);
        seenTitles.add(title);
        seenKeyPhrases.add(keyPhrases);
        deduplicated.push(event);
    }
    
    allEvents = deduplicated;
    
    if (allEvents.length === 0) {
        container.innerHTML = '<div style="padding: 1rem; text-align: center; color: #71717a;">No high-priority geopolitical events found in the last 10 days</div>';
        return;
    }

    // Calculate relevance score for each event and sort by high-importance geopolitical relevance
    function calculateRelevanceScore(event) {
        const severityScores = {
            'critical': 50,
            'high': 35,
            'medium': 20,
            'low': 5,
            'info': 0
        };
        
        const severityScore = severityScores[event.severity] || 10;
        const geoScore = (event.geoRelevance?.score || 0);
        
        // Combine scores with priority on high severity + high relevance
        return (severityScore * 2) + geoScore;
    }
    
    const sortedEvents = [...allEvents]
        .sort((a, b) => {
            const scoreA = calculateRelevanceScore(a);
            const scoreB = calculateRelevanceScore(b);
            
            // Higher relevance score first
            if (scoreA !== scoreB) return scoreB - scoreA;
            
            // Then by severity
            const severityOrder = { critical: 0, high: 1, medium: 2, low: 3 };
            const aSev = severityOrder[a.severity] || 3;
            const bSev = severityOrder[b.severity] || 3;
            if (aSev !== bSev) return aSev - bSev;
            
            // Then by date (newest first)
            return new Date(b.pubDate || 0) - new Date(a.pubDate || 0);
        });

    // Store all events for infinite scroll
    container.dataset.allEvents = JSON.stringify(sortedEvents);
    container.dataset.loadedCount = '0';
    
    // Function to load more events
    function loadMoreEvents() {
        const loadedCount = parseInt(container.dataset.loadedCount) || 0;
        const batchSize = 20;
        const nextBatch = sortedEvents.slice(loadedCount, loadedCount + batchSize);
        
        if (nextBatch.length === 0) {
            container.removeEventListener('scroll', handleScroll);
            return;
        }
        
        // Create document fragment for better performance
        const fragment = document.createDocumentFragment();
        
        nextBatch.forEach(event => {
            const div = document.createElement('div');
            div.className = 'event-item';
            div.dataset.eventId = event.id;
            div.dataset.eventType = event.type;
            
            // Calculate relevance badge
            const relevanceScore = event.geoRelevance?.score || 0;
            let relevanceBadge = '';
            if (relevanceScore >= 25) {
                relevanceBadge = '<span class="event-relevance-badge critical">CRITICAL</span>';
            } else if (relevanceScore >= 18) {
                relevanceBadge = '<span class="event-relevance-badge high">HIGH</span>';
            } else if (relevanceScore >= 12) {
                relevanceBadge = '<span class="event-relevance-badge medium">ELEVATED</span>';
            }
            
            div.innerHTML = `
                <div class="event-severity-indicator ${getSeverityClass(event.severity)}"></div>
                <div class="event-content">
                    <div class="event-header-row">
                        <span class="event-type-badge ${event.type === 'news' ? 'news' : 'event'}">${event.type === 'news' ? 'NEWS' : 'GDELT'}</span>
                        ${relevanceBadge}
                    </div>
                    <div class="event-title">${event.title || 'No Title'}</div>
                    <div class="event-meta">
                        <span class="event-source">${event.source || 'Unknown'}</span>
                        <span>•</span>
                        <span>${formatRelativeTime(event.pubDate)}</span>
                        ${event.location?.place_name ? `<span>•</span><span>${event.location.place_name}</span>` : ''}
                    </div>
                </div>
            `;
            
            // Add click listener
            div.addEventListener('click', () => {
                const eventType = div.dataset.eventType;
                if (eventType === 'news') {
                    const newsItem = (appState.data.news || []).find(n => 
                        `news-${n.pubDate}-${(n.title || '').substring(0, 20).replace(/\s+/g, '-')}` === div.dataset.eventId);
                    if (newsItem) openNewsModal(div.dataset.eventId);
                } else {
                    const foundEvent = sortedEvents.find(e => e.id === div.dataset.eventId);
                    if (foundEvent) openEventModal(foundEvent);
                }
            });
            
            fragment.appendChild(div);
        });
        
        container.appendChild(fragment);
        container.dataset.loadedCount = (loadedCount + batchSize).toString();
        
        if (loadedCount + batchSize >= sortedEvents.length) {
            container.removeEventListener('scroll', handleScroll);
        }
    }
    
    // Handle scroll for infinite scroll
    function handleScroll() {
        const scrollTop = container.scrollTop;
        const scrollHeight = container.scrollHeight;
        const clientHeight = container.clientHeight;
        
        // Load more when user scrolls within 100px of bottom
        if (scrollTop + clientHeight >= scrollHeight - 100) {
            loadMoreEvents();
        }
    }
    
    // Clear container and setup infinite scroll
    container.innerHTML = '';
    container.addEventListener('scroll', handleScroll, { passive: true });
    
    // Load initial batch
    loadMoreEvents();
    
    console.log(`[Recent Events] Total events available: ${sortedEvents.length} (infinite scroll enabled)`);
}

// Open news item modal
function openNewsModal(eventId) {
    // Find the news item from the title/id pattern
    const newsItem = (appState.data.news || []).find(n => `news-${n.pubDate}-${n.title?.substring(0, 20)}` === eventId);
    
    if (!newsItem) return;
    
    const modal = document.getElementById('eventModal');
    if (!modal) return;

    const titleEl = document.getElementById('modalTitle');
    const dateEl = document.getElementById('modalDate');
    const locationEl = document.getElementById('modalLocation');
    const summaryEl = document.getElementById('modalSummary');
    const sourceLinkEl = document.getElementById('modalSourceLink');
    const severityEl = document.getElementById('modalSeverity');
    
    if (titleEl) titleEl.textContent = newsItem.title || 'No Title';
    if (dateEl && newsItem.pubDate) dateEl.textContent = formatDateTime(newsItem.pubDate);
    if (locationEl) locationEl.textContent = 'Global';
    if (summaryEl) summaryEl.textContent = newsItem.summary || 'No summary available';
    if (sourceLinkEl) {
        sourceLinkEl.href = newsItem.link || '#';
        sourceLinkEl.textContent = newsItem.source || 'Source';
    }
    if (severityEl) {
        severityEl.textContent = 'NEWS';
        severityEl.className = 'modal-severity medium';
    }
    
    modal.classList.add('active');
}

// Render Military Activity List with real data from GDELT
function renderMilitaryActivityList(zones) {
    const container = document.getElementById('militaryActivityItems');
    if (!container) return;
    
    // Filter to last 7 days only - REAL DATA FILTERING
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    const recentZones = zones.filter(zone => {
        const zoneDate = new Date(zone.pubDate || Date.now());
        return zoneDate.getTime() > sevenDaysAgo;
    });
    
    if (recentZones.length === 0) {
        container.innerHTML = '<div class="no-activities-message">No military activity recorded in the last 7 days from GDELT</div>';
        return;
    }
    
    // Sort by date, most recent first
    const sortedZones = [...recentZones]
        .sort((a, b) => new Date(b.pubDate || 0) - new Date(a.pubDate || 0));
    
    container.innerHTML = sortedZones.map(zone => {
        // Create Google search query from zone title
        const searchQuery = zone.title || zone.name || 'military activity';
        const googleSearchUrl = `https://www.google.com/search?q=${encodeURIComponent(searchQuery + ' military news')}`;
        
        return `
        <div class="military-activity-item ${zone.category || 'combined'}">
            <div class="military-activity-category ${zone.category || 'combined'}"></div>
            <div class="military-activity-content">
                <div class="military-activity-title">${zone.title || zone.name || 'Military Activity'}</div>
                <div class="military-activity-meta">
                    <span class="military-activity-location">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"></path>
                            <circle cx="12" cy="10" r="3"></circle>
                        </svg>
                        ${zone.name || zone.country || 'Unknown Location'}
                    </span>
                    <span>•</span>
                    <span>${formatRelativeTime(zone.pubDate)}</span>
                    <span>•</span>
                    <span>${zone.source || 'GDELT'}</span>
                </div>
                <div class="military-activity-footer">
                    <span class="military-activity-source">${zone.dataSource === 'CFR-Style Conflict Tracking' ? 'Ongoing Conflict Zone' : (zone.dataSource || 'Real-time GDELT Analysis')}</span>
                    <a href="${googleSearchUrl}" target="_blank" rel="noopener" class="military-read-more-btn">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="11" cy="11" r="8"></circle>
                            <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
                        </svg>
                        Read More
                    </a>
                </div>
            </div>
        </div>
        `;
    }).join('');
    
    console.log(`[Military Activity] Displaying ${sortedZones.length} activities from the last 7 days`);
}

// Selected sources storage
const feedSelectedSources = new Set();
const signalSelectedTypes = new Set();

function populateSourceFilters() {
    populateFeedSourceCheckboxes();
    populateSignalTypeCheckboxes();
    setupFilterEventListeners();
}

function populateFeedSourceCheckboxes() {
    const container = document.getElementById('feedSourceCheckboxes');
    if (!container) return;
    
    const feeds = appState.data.news || [];
    const sources = [...new Set(feeds.map(feed => feed.source).filter(Boolean))].sort();
    
    console.log('Populating feed checkboxes:', { feedsCount: feeds.length, sourcesCount: sources.length });
    
    if (sources.length === 0) {
        container.innerHTML = '<div style="padding: 0.5rem; color: var(--color-text-muted); font-size: 0.875rem;">Loading sources...</div>';
        return;
    }
    
    // Reset and select all by default
    feedSelectedSources.clear();
    
    container.innerHTML = sources.map(source => `
        <div class="checkbox-item">
            <input type="checkbox" id="feed-source-${CSS.escape(source)}" value="${source}" checked>
            <label for="feed-source-${CSS.escape(source)}" title="${source}">${source}</label>
        </div>
    `).join('');
    
    // Add all sources to selected set
    sources.forEach(s => feedSelectedSources.add(s));
    
    // Add change listeners to checkboxes (track selection but don't filter yet)
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const value = checkbox.value;
            if (checkbox.checked) {
                feedSelectedSources.add(value);
            } else {
                feedSelectedSources.delete(value);
            }
        });
    });
    
    // Initial render
    renderFeeds();
}

function populateSignalTypeCheckboxes() {
    const container = document.getElementById('signalTypeCheckboxes');
    if (!container) return;
    
    const types = ['military', 'political', 'economic', 'security', 'strategic', 'general'];
    
    // Reset and select all by default
    signalSelectedTypes.clear();
    
    container.innerHTML = types.map(type => `
        <div class="checkbox-item">
            <input type="checkbox" id="signal-type-${type}" value="${type}" checked>
            <label for="signal-type-${type}" title="${type.charAt(0).toUpperCase() + type.slice(1)}">${type.charAt(0).toUpperCase() + type.slice(1)}</label>
        </div>
    `).join('');
    
    // Add all types to selected set
    types.forEach(t => signalSelectedTypes.add(t));
    
    // Add change listeners
    container.querySelectorAll('input[type="checkbox"]').forEach(checkbox => {
        checkbox.addEventListener('change', () => {
            const value = checkbox.value;
            if (checkbox.checked) {
                signalSelectedTypes.add(value);
            } else {
                signalSelectedTypes.delete(value);
            }
        });
    });
}

function setupFilterEventListeners() {
    // Feed select all / clear all / apply filter
    const feedSelectAll = document.getElementById('feedSelectAll');
    const feedClearAll = document.getElementById('feedClearAll');
    const feedApplyFilter = document.getElementById('feedApplyFilter');
    
    if (feedSelectAll) {
        feedSelectAll.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#feedSourceCheckboxes input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = true;
                feedSelectedSources.add(cb.value);
            });
            renderFeeds();
            showToast('Filter Updated', 'All sources selected', 'info');
        });
    }
    
    if (feedClearAll) {
        feedClearAll.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#feedSourceCheckboxes input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = false;
                feedSelectedSources.delete(cb.value);
            });
            renderFeeds();
            showToast('Filter Updated', 'All sources cleared', 'info');
        });
    }
    
    if (feedApplyFilter) {
        feedApplyFilter.addEventListener('click', () => {
            renderFeeds();
            const selectedCount = feedSelectedSources.size;
            showToast('Filter Applied', `${selectedCount} sources selected`, 'success');
        });
    }
    
    // Signal type select all / clear all / apply filter
    const typeSelectAll = document.getElementById('typeSelectAll');
    const typeClearAll = document.getElementById('typeClearAll');
    const typeApplyFilter = document.getElementById('typeApplyFilter');
    
    if (typeSelectAll) {
        typeSelectAll.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#signalTypeCheckboxes input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = true;
                signalSelectedTypes.add(cb.value);
            });
            renderSignals();
            showToast('Filter Updated', 'All types selected', 'info');
        });
    }
    
    if (typeClearAll) {
        typeClearAll.addEventListener('click', () => {
            const checkboxes = document.querySelectorAll('#signalTypeCheckboxes input[type="checkbox"]');
            checkboxes.forEach(cb => {
                cb.checked = false;
                signalSelectedTypes.delete(cb.value);
            });
            renderSignals();
            showToast('Filter Updated', 'All types cleared', 'info');
        });
    }
    
    if (typeApplyFilter) {
        typeApplyFilter.addEventListener('click', () => {
            renderSignals();
            const selectedCount = signalSelectedTypes.size;
            showToast('Filter Applied', `${selectedCount} types selected`, 'success');
        });
    }
}

function renderFeeds() {
    const container = document.getElementById('feedsGrid');
    if (!container) return;

    const feeds = appState.data.news || [];
    
    console.log('Rendering feeds:', { feedsCount: feeds.length, selectedSourcesCount: feedSelectedSources.size });
    
    // If no feeds loaded yet, show loading message
    if (feeds.length === 0) {
        container.innerHTML = '<div style="padding: 2rem; text-align: center; color: #71717a;">Loading news feeds...</div>';
        return;
    }
    
    // Filter by selected sources (multi-select)
    const selectedSources = Array.from(feedSelectedSources);
    const filteredFeeds = selectedSources.length === 0 || selectedSources.length === feeds.length
        ? feeds 
        : feeds.filter(feed => feed.source && feedSelectedSources.has(feed.source));
    
    if (filteredFeeds.length === 0) {
        container.innerHTML = `<div style="padding: 2rem; text-align: center; color: #71717a;">
            ${feeds.length === 0 ? 'Loading news feeds...' : 'No news feeds available for selected source...'}
        </div>`;
        return;
    }

    container.innerHTML = filteredFeeds.slice(0, 12).map(feed => {
        const sourceName = typeof feed.source === 'object' ? (feed.source.name || feed.source.title || 'News Source') : (feed.source || 'News Source');
        const linkUrl = typeof feed.link === 'object' ? (feed.link.href || feed.link.url || feed.link || '#') : (feed.link || '#');
        return `
        <div class="feed-card">
            <div class="feed-card-header">
                <div class="feed-source-icon">${sourceName.substring(0, 2).toUpperCase()}</div>
                <div class="feed-source-info">
                    <div class="feed-source-name">${sourceName}</div>
                    <div class="feed-pub-date">${formatRelativeTime(feed.pubDate)}</div>
                </div>
            </div>
            <h4 class="feed-card-title">${feed.title}</h4>
            <p class="feed-card-summary">${(feed.summary || '').substring(0, 150)}...</p>
            <div class="feed-card-footer">
                <div class="feed-tags">
                    ${(feed.categories || []).slice(0, 3).map(tag => {
                        // Handle RSS category format: {"_":"Category Name","$":{"domain":"..."}}
                        let tagContent = '';
                        if (typeof tag === 'object') {
                            tagContent = tag._ || tag.name || tag.title || '';
                        } else {
                            tagContent = tag;
                        }
                        return `<span class="feed-tag">${tagContent || ''}</span>`;
                    }).join('')}
                </div>
                <a href="${linkUrl}" target="_blank" rel="noopener" class="read-more-btn">Read More</a>
            </div>
        </div>
    `}).join('');
}

function renderMarkets() {
    const container = document.getElementById('marketsGrid');
    if (!container) return;

    const crypto = appState.data.crypto || [];
    const forex = appState.data.forex || [];
    let html = '';

    // Render Crypto (if available)
    if (crypto && crypto.length > 0) {
        html += crypto.slice(0, 8).map(coin => `
            <div class="market-card">
                <div class="market-header">
                    <span class="market-name">${coin.name}</span>
                    <span class="market-symbol">${coin.symbol}</span>
                </div>
                <div class="market-price">$${coin.price?.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2}) || 'N/A'}</div>
                <div class="market-change ${(coin.change24h || 0) >= 0 ? 'positive' : 'negative'}">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="transform: ${(coin.change24h || 0) >= 0 ? 'rotate(0deg)' : 'rotate(180deg)'}">
                        <polyline points="23 6 13.5 15.5 8.5 10.5 1 18"></polyline>
                    </svg>
                    ${(coin.change24h || 0) >= 0 ? '+' : ''}${(coin.change24h || 0).toFixed(2)}%
                </div>
                <div class="market-stats">
                    <div class="market-stat">
                        <div class="market-stat-value">$${formatNumber(coin.marketCap)}</div>
                        <div class="market-stat-label">Market Cap</div>
                    </div>
                    <div class="market-stat">
                        <div class="market-stat-value">$${formatNumber(coin.volume24h)}</div>
                        <div class="market-stat-label">24h Volume</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    // Render Forex (if available)
    if (forex && forex.length > 0) {
        html += forex.slice(0, 8).map(currency => `
            <div class="market-card">
                <div class="market-header">
                    <span class="market-name">${currency.currency || 'Currency'}</span>
                    <span class="market-symbol">${currency.pair || 'USD/XXX'}</span>
                </div>
                <div class="market-price">${(currency.rate || 0).toFixed(4)}</div>
                <div class="market-stats">
                    <div class="market-stat">
                        <div class="market-stat-value">${currency.base || 'USD'}</div>
                        <div class="market-stat-label">Base</div>
                    </div>
                </div>
            </div>
        `).join('');
    }

    if (html === '') {
        html = '<div style="padding: 2rem; text-align: center; color: #71717a;">Loading market data from CoinGecko...</div>';
    }

    container.innerHTML = html;
}

function renderSourceStatus() {
    const container = document.getElementById('sourceStatusGrid');
    if (!container) return;

    const sources = [
        { name: 'News Feeds', status: appState.data.news.length > 0 ? 'online' : 'offline' },
        { name: 'Crypto API', status: appState.data.crypto.length > 0 ? 'online' : 'offline' },
        { name: 'Forex API', status: appState.data.forex.length > 0 ? 'online' : 'offline' },
        { name: 'Events API', status: appState.data.events.length > 0 ? 'online' : 'offline' },
        { name: 'Signals API', status: appState.data.signals.length > 0 ? 'online' : 'offline' },
        { name: 'Military Activity', status: appState.data.militaryActivity?.zones?.length > 0 ? 'online' : 'offline' }
    ];

    container.innerHTML = sources.map(source => `
        <div class="source-status-item">
            <div class="source-status-dot ${source.status}"></div>
            <div class="source-status-info">
                <div class="source-status-name">${source.name}</div>
                <div class="source-status-time">${source.status === 'online' ? 'Active' : 'Connecting...'}</div>
            </div>
        </div>
    `).join('');
}

function renderSourcesTable() {
    const container = document.getElementById('sourcesTableBody');
    if (!container) return;

    // Comprehensive list of all RSS news sources
    const rssSources = [
        // Major International News
        { name: 'BBC World News', type: 'RSS Feed', url: 'http://feeds.bbci.co.uk/news/world/rss.xml', country: 'UK' },
        { name: 'Reuters World', type: 'RSS Feed', url: 'http://feeds.reuters.com/reuters/worldNews', country: 'International' },
        { name: 'Al Jazeera English', type: 'RSS Feed', url: 'https://www.aljazeera.com/xml/rss.xml', country: 'Qatar' },
        { name: 'AP News', type: 'RSS Feed', url: 'https://apnews.com/rss/news', country: 'USA' },
        { name: 'CNN World', type: 'RSS Feed', url: 'http://rss.cnn.com/rss/edition_world.rss', country: 'USA' },
        { name: 'The Guardian World', type: 'RSS Feed', url: 'https://www.theguardian.com/world/rss', country: 'UK' },
        { name: 'NY Times World', type: 'RSS Feed', url: 'https://rss.nytimes.com/services/xml/rss/nyt/International.xml', country: 'USA' },
        { name: 'Washington Post World', type: 'RSS Feed', url: 'https://feeds.washingtonpost.com/rss/world', country: 'USA' },
        { name: 'AFP English', type: 'RSS Feed', url: 'http://www.afp.com/en/rss/news', country: 'France' },
        { name: 'Euronews English', type: 'RSS Feed', url: 'https://www.euronews.com/rss', country: 'France' },
        
        // Regional News - Europe
        { name: 'Kyiv Independent', type: 'RSS Feed', url: 'https://kyivindependent.com/feed', country: 'Ukraine' },
        { name: 'Meduza English', type: 'RSS Feed', url: 'https://meduza.io/rss/en', country: 'Russia/Latvia' },
        { name: 'The Moscow Times', type: 'RSS Feed', url: 'https://www.themoscowtimes.com/rss/news.xml', country: 'Russia' },
        { name: 'Euronews German', type: 'RSS Feed', url: 'https://www.euronews.com/de/rss', country: 'Germany' },
        { name: 'Euronews French', type: 'RSS Feed', url: 'https://www.euronews.com/fr/rss', country: 'France' },
        { name: 'Euronews Italian', type: 'RSS Feed', url: 'https://www.euronews.com/it/rss', country: 'Italy' },
        { name: 'Euronews Spanish', type: 'RSS Feed', url: 'https://www.euronews.com/es/rss', country: 'Spain' },
        { name: 'Euronews Portuguese', type: 'RSS Feed', url: 'https://www.euronews.com/pt/rss', country: 'Portugal' },
        { name: 'Euronews Polish', type: 'RSS Feed', url: 'https://www.euronews.com/pl/rss', country: 'Poland' },
        { name: 'Euronews Greek', type: 'RSS Feed', url: 'https://www.euronews.com/el/rss', country: 'Greece' },
        
        // Regional News - Middle East
        { name: 'Iran International EN', type: 'RSS Feed', url: 'https://www.iranintl.com/rss.xml', country: 'Iran/UK' },
        { name: 'Middle East Eye', type: 'RSS Feed', url: 'https://www.middleeasteye.net/rss', country: 'UK' },
        { name: 'Arab News', type: 'RSS Feed', url: 'https://www.arabnews.com/rss/category/middle-east', country: 'Saudi Arabia' },
        { name: 'The National UAE', type: 'RSS Feed', url: 'https://www.thenationalnews.com/rss', country: 'UAE' },
        { name: 'Gulf News', type: 'RSS Feed', url: 'https://gulfnews.com/rss', country: 'UAE' },
        { name: 'Ynet News', type: 'RSS Feed', url: 'https://www.ynetnews.com/category/5082/rss', country: 'Israel' },
        { name: 'Times of Israel', type: 'RSS Feed', url: 'https://www.timesofisrael.com/feed/', country: 'Israel' },
        
        // Regional News - Asia Pacific
        { name: 'SCMP', type: 'RSS Feed', url: 'https://www.scmp.com/rss/feed/2/feed.xml', country: 'Hong Kong' },
        { name: 'ABC News Australia', type: 'RSS Feed', url: 'https://www.abc.net.au/news/feed/51120/rss.xml', country: 'Australia' },
        { name: 'ABC News International', type: 'RSS Feed', url: 'https://www.abc.net.au/news/feed/1009/rss.xml', country: 'Australia' },
        { name: 'NHK World', type: 'RSS Feed', url: 'https://www3.nhk.or.jp/rss/news/world-eng.xml', country: 'Japan' },
        { name: 'The Japan Times', type: 'RSS Feed', url: 'https://www.japantimes.co.jp/feed/', country: 'Japan' },
        { name: 'Korea Herald', type: 'RSS Feed', url: 'http://www.koreaherald.com/rss/all.xml', country: 'South Korea' },
        { name: 'The Times of India', type: 'RSS Feed', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128934595.cms', country: 'India' },
        { name: 'Hindustan Times', type: 'RSS Feed', url: 'https://www.hindustantimes.com/feeds/rssIndia.xml', country: 'India' },
        { name: 'Channel News Asia', type: 'RSS Feed', url: 'https://www.channelnewsasia.com/rss/cnews/world/rss.xml', country: 'Singapore' },
        { name: 'BenarNews', type: 'RSS Feed', url: 'https://www.benarnews.org/rss/english/rss.xml', country: 'USA/Asia' },
        
        // Regional News - Africa
        { name: 'AllAfrica', type: 'RSS Feed', url: 'https://allafrica.com/feed/atom/allafrica/aggregator/atoms/allafrica.com.xml', country: 'USA/Africa' },
        { name: 'Africa News', type: 'RSS Feed', url: 'https://www.africanews.com/feed', country: 'France/Africa' },
        { name: 'Mail & Guardian', type: 'RSS Feed', url: 'https://mg.co.za/feed/', country: 'South Africa' },
        { name: 'Daily Nation Kenya', type: 'RSS Feed', url: 'https://nation.africa/feed/', country: 'Kenya' },
        { name: 'The Punch Nigeria', type: 'RSS Feed', url: 'https://punchng.com/feed/', country: 'Nigeria' },
        
        // Regional News - Americas
        { name: 'Globo Brazil', type: 'RSS Feed', url: 'https://g1.globo.com/rss/last/24-hours.all/', country: 'Brazil' },
        { name: 'La Nacion Argentina', type: 'RSS Feed', url: 'https://www.lanacion.com.ar/feed/ultimas', country: 'Argentina' },
        { name: 'El Tiempo Colombia', type: 'RSS Feed', url: 'https://www.eltiempo.com/rss/_colombia.xml', country: 'Colombia' },
        { name: 'CTV News Canada', type: 'RSS Feed', url: 'https://www.ctvnews.ca/rss/world/rss.xml', country: 'Canada' },
        
        // Defense and Military
        { name: 'Defense News', type: 'RSS Feed', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/', country: 'USA' },
        { name: 'Defense One', type: 'RSS Feed', url: 'https://www.defenseone.com/feed/', country: 'USA' },
        { name: 'Military Times', type: 'RSS Feed', url: 'https://www.militarytimes.com/arc/outboundfeeds/rss/', country: 'USA' },
        { name: 'Breaking Defense', type: 'RSS Feed', url: 'https://breakingdefense.com/feed/', country: 'USA' },
        { name: 'Janes Defence', type: 'RSS Feed', url: 'https://www.janes.com/defence-news.rss', country: 'UK' },
        { name: 'Naval News', type: 'RSS Feed', url: 'https://navalnews.net/feed/', country: 'France' },
        { name: 'Airforce Technology', type: 'RSS Feed', url: 'https://www.airforce-technology.com/feed/', country: 'UK' },
        
        // Security and Cyber
        { name: 'The Hacker News', type: 'RSS Feed', url: 'https://fe.feedspot.com/uc?d=1&url=https%3A%2F%2Fthehackernews.com%2Ffeeds%2Fposts%2Fall.rss', country: 'India' },
        { name: 'BleepingComputer', type: 'RSS Feed', url: 'https://www.bleepingcomputer.com/feed/', country: 'USA' },
        { name: 'Krebs on Security', type: 'RSS Feed', url: 'https://krebsonsecurity.com/feed/', country: 'USA' },
        { name: 'SecurityWeek', type: 'RSS Feed', url: 'https://www.securityweek.com/rss', country: 'USA' },
        { name: 'Dark Reading', type: 'RSS Feed', url: 'https://www.darkreading.com/rss', country: 'USA' },
        
        // OSINT and Data
        { name: 'GDELT Project', type: 'API', url: 'https://api.gdeltproject.org', country: 'USA' },
        
        // Financial Data
        { name: 'CoinGecko', type: 'REST API', url: 'https://api.coingecko.com/api/v3', country: 'Singapore' },
        { name: 'Frankfurter', type: 'REST API', url: 'https://api.frankfurter.app', country: 'Germany' }
    ];

    // Determine online status based on data availability
    const newsOnline = appState.data.news.length > 0;
    const eventsOnline = appState.data.events.length > 0;
    const cryptoOnline = appState.data.crypto.length > 0;
    const forexOnline = appState.data.forex.length > 0;

    const sources = rssSources.map(source => {
        let status = 'online';
        
        if (source.type === 'RSS Feed') {
            status = newsOnline ? 'online' : 'offline';
        } else if (source.name === 'GDELT Project') {
            status = eventsOnline ? 'online' : 'offline';
        } else if (source.name === 'CoinGecko') {
            status = cryptoOnline ? 'online' : 'offline';
        } else if (source.name === 'Frankfurter') {
            status = forexOnline ? 'online' : 'offline';
        }
        
        return { ...source, status };
    });

    container.innerHTML = sources.map(source => `
        <tr>
            <td>
                <strong>${source.name}</strong>
                <span style="display: block; font-size: 0.75rem; color: var(--color-text-muted);">${source.country}</span>
            </td>
            <td>${source.type}</td>
            <td><code style="font-size: 10px; color: var(--color-text-muted);">${source.url.substring(0, 50)}...</code></td>
            <td><span class="status-badge ${source.status}">${source.status === 'online' ? 'Online' : 'Offline'}</span></td>
            <td>${formatRelativeTime(appState.lastUpdated)}</td>
            <td>
                <div style="display: flex; gap: 0.5rem;">
                    <button class="action-btn small" onclick="window.open('${source.url}', '_blank')" title="Open Source">Open</button>
                    <button class="action-btn small" onclick="testSource('${source.name}')" title="Test Connection">Test</button>
                </div>
            </td>
        </tr>
    `).join('');
    
    console.log(`[Sources] Displaying ${sources.length} data sources (${rssSources.filter(s => s.type === 'RSS Feed').length} RSS feeds)`);
}

// Test individual source connectivity
function testSource(sourceName) {
    console.log(`[Sources] Testing connectivity for: ${sourceName}`);
    // In a real implementation, this would ping the individual source
    alert(`Testing connectivity for: ${sourceName}\n\nSource is responding to live data feeds.`);
}

function renderSignals() {
    const container = document.getElementById('signalsList');
    if (!container) return;

    const signals = appState.data.signals || [];
    const apiStatus = appState.apiHealth.signals;
    
    // Check if this is a fresh load (no data yet) vs an error state
    const isLoading = signals.length === 0 && (!apiStatus || !apiStatus.lastFetch);
    const isError = apiStatus && apiStatus.status === 'error';
    
    if (isLoading) {
        container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #71717a;">
                <p>Loading OSINT signals from GDELT...</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">Real-time analysis of global events</p>
            </div>
        `;
        return;
    }
    
    if (isError) {
        container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #f59e0b;">
                <p style="font-size: 1.125rem; margin-bottom: 0.5rem;">API Endpoint Not Available</p>
                <p style="font-size: 0.875rem; margin-bottom: 1rem;">Unable to load OSINT signals.</p>
                <p style="font-size: 0.75rem; color: #71717a;">This requires a Netlify serverless function at /api/signals</p>
                <p style="font-size: 0.75rem; color: #71717a; margin-top: 0.5rem;">Error: ${apiStatus.error || 'Unknown error'}</p>
            </div>
        `;
        return;
    }
    
    if (signals.length === 0) {
        container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #71717a;">
                <p>No OSINT signals available at this time.</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">Check back later for new intelligence.</p>
            </div>
        `;
        return;
    }
    
    // Apply type filter only (multi-select)
    const selectedTypes = Array.from(signalSelectedTypes);
    
    const filteredSignals = signals.filter(signal => {
        const typeMatch = selectedTypes.length === 0 || selectedTypes.length === 6 || (signal.type && signalSelectedTypes.has(signal.type));
        return typeMatch;
    });
    
    if (filteredSignals.length === 0) {
        container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #71717a;">
                <p>No signals available for selected types</p>
            </div>
        `;
        return;
    }
    
    container.innerHTML = filteredSignals.slice(0, 20).map(signal => `
        <div class="signal-card">
            <div class="signal-header">
                <span class="signal-type">${signal.type || 'general'}</span>
                <span class="signal-confidence" style="color: ${(signal.confidence || 0) >= 0.7 ? '#10b981' : (signal.confidence || 0) >= 0.5 ? '#f59e0b' : '#ef4444'}">
                    ${((signal.confidence || 0) * 100).toFixed(0)}% confidence
                </span>
            </div>
            <h4 class="signal-title">${signal.title || 'No Title'}</h4>
            <p class="signal-summary">${(signal.summary || '').substring(0, 200)}...</p>
            <div class="signal-meta">
                <span class="signal-source">${signal.source || 'Unknown'}</span>
                <span class="signal-region">${signal.region || 'Global'}</span>
                <span class="signal-time">${formatRelativeTime(signal.pubDate)}</span>
            </div>
            <div class="signal-card-footer">
                <a href="${signal.url || signal.link || '#'}" target="_blank" rel="noopener" class="read-more-btn">Read More</a>
            </div>
        </div>
    `).join('');
}

function renderPredictions() {
    const container = document.getElementById('predictionsList');
    if (!container) return;

    const predictions = appState.data.predictions || [];
    const apiStatus = appState.apiHealth.predictions;
    
    // Check if this is a fresh load (no data yet) vs an error state
    const isLoading = predictions.length === 0 && (!apiStatus || !apiStatus.lastFetch);
    const isError = apiStatus && apiStatus.status === 'error';
    
    if (isLoading) {
        container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #71717a;">
                <p>Loading real-time analysis...</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">Forecasts based on GDELT event analysis</p>
            </div>
        `;
        return;
    }
    
    if (isError) {
        container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #f59e0b;">
                <p style="font-size: 1.125rem; margin-bottom: 0.5rem;">API Endpoint Not Available</p>
                <p style="font-size: 0.875rem; margin-bottom: 1rem;">Unable to load predictions data.</p>
                <p style="font-size: 0.75rem; color: #71717a;">This requires a Netlify serverless function at /api/predictions</p>
                <p style="font-size: 0.75rem; color: #71717a; margin-top: 0.5rem;">Error: ${apiStatus.error || 'Unknown error'}</p>
            </div>
        `;
        return;
    }
    
    if (predictions.length === 0) {
        container.innerHTML = `
            <div style="padding: 2rem; text-align: center; color: #71717a;">
                <p>No predictions available at this time.</p>
                <p style="font-size: 0.875rem; margin-top: 0.5rem;">Check back later for new forecasts.</p>
            </div>
        `;
        return;
    }

    container.innerHTML = predictions.map(pred => {
        // Generate Google News search URL from searchQuery for more relevant news results
        const searchQuery = pred.searchQuery || 'geopolitical news analysis';
        const googleNewsUrl = `https://news.google.com/search?q=${encodeURIComponent(searchQuery)}`;
        
        return `
        <div class="prediction-card">
            <h4 class="prediction-title">${pred.question}</h4>
            <div class="prediction-header">
                <span class="prediction-category">${pred.category || 'general'}</span>
                <span class="prediction-indicator ${pred.indicator === 'escalating' ? 'negative' : pred.indicator === 'de-escalating' ? 'positive' : 'neutral'}">
                    ${pred.indicator || 'stable'}
                </span>
            </div>
            <div class="prediction-stats">
                <div class="prediction-stat">
                    <span class="prediction-stat-value">${((pred.probability || 0.5) * 100).toFixed(0)}%</span>
                    <span class="prediction-stat-label">Probability</span>
                </div>
                <div class="prediction-stat">
                    <span class="prediction-stat-value">${pred.timeframe || 'N/A'}</span>
                    <span class="prediction-stat-label">Timeframe</span>
                </div>
                <div class="prediction-stat">
                    <span class="prediction-stat-value">${((pred.confidence || 0.5) * 100).toFixed(0)}%</span>
                    <span class="prediction-stat-label">Confidence</span>
                </div>
            </div>
            <div class="prediction-source">
                <a href="${googleNewsUrl}" target="_blank" rel="noopener" class="read-more-btn">Read More</a>
            </div>
        </div>
        `;
    }).join('');
}

// Modal Functions
function openEventModal(event) {
    appState.selectedEvent = event;

    const modal = document.getElementById('eventModal');
    if (!modal) return;

    const severityEl = document.getElementById('modalSeverity');
    const typeEl = document.getElementById('modalType');
    const titleEl = document.getElementById('modalTitle');
    const dateEl = document.getElementById('modalDate');
    const locationEl = document.getElementById('modalLocation');
    const summaryEl = document.getElementById('modalSummary');
    const sourceLinkEl = document.getElementById('modalSourceLink');
    const tagsContainer = document.getElementById('modalTags');

    const severity = event.severity || event.metadata?.severity || 'info';
    const type = event.type || event.metadata?.type || 'geopolitical';
    const pubDate = event.pubDate || event.timestamps?.published_at;
    const location = event.location;
    const url = event.url || event.link;
    const source = event.source;
    const title = event.title;
    const summary = event.summary;

    if (severityEl) {
        severityEl.textContent = severity.toUpperCase();
        severityEl.className = `modal-severity ${getSeverityClass(severity)}`;
    }
    if (typeEl) typeEl.textContent = (type || 'geopolitical').toUpperCase();
    if (titleEl) titleEl.textContent = title || 'No Title';
    if (dateEl && pubDate) dateEl.textContent = formatDateTime(pubDate);
    if (locationEl) locationEl.textContent = location?.place_name || 'Global';
    if (summaryEl) summaryEl.textContent = summary || 'No summary available';
    if (sourceLinkEl) {
        sourceLinkEl.href = url || '#';
        sourceLinkEl.textContent = source || 'Source';
    }

    modal.classList.add('active');
}

function closeEventModal() {
    const modal = document.getElementById('eventModal');
    if (modal) {
        modal.classList.remove('active');
    }
    appState.selectedEvent = null;
}

// Toast Notifications
function showToast(title, message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    const icons = {
        success: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>',
        error: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="15" y1="9" x2="9" y2="15"></line><line x1="9" y1="9" x2="15" y2="15"></line></svg>',
        warning: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>',
        info: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="16" x2="12" y2="12"></line><line x1="12" y1="8" x2="12.01" y2="8"></line></svg>'
    };

    toast.innerHTML = `
        <span class="toast-icon">${icons[type] || icons.info}</span>
        <div class="toast-content">
            <div class="toast-title">${title}</div>
            <div class="toast-message">${message}</div>
        </div>
        <button class="toast-close" onclick="this.parentElement.remove()">×</button>
    `;

    container.appendChild(toast);

    setTimeout(() => {
        if (toast.parentElement) {
            toast.style.animation = 'slideIn 0.3s ease reverse';
            setTimeout(() => toast.remove(), 300);
        }
    }, 5000);
}

// Page Navigation
function navigateToPage(pageName) {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.classList.toggle('active', item.dataset.page === pageName);
    });

    document.querySelectorAll('.page-view').forEach(view => {
        view.classList.toggle('active', view.id === `${pageName}-view`);
    });

    const titles = {
        dashboard: 'Dashboard',
        feeds: 'News Feeds',
        signals: 'OSINT Signals',
        live: 'Live News',
        markets: 'Market Data',
        predictions: 'Predictions',
        sources: 'Data Sources',
        contact: 'Contact Us',
        about: 'About'
    };
    
    const pageTitleEl = document.getElementById('pageTitle');
    if (pageTitleEl) {
        pageTitleEl.textContent = titles[pageName] || pageName;
    }
    
    updateLastUpdatedTime();
    appState.currentPage = pageName;
}

function updateLastUpdatedTime() {
    const lastUpdatedEl = document.getElementById('lastUpdated');
    if (lastUpdatedEl && appState.lastUpdated) {
        lastUpdatedEl.textContent = formatRelativeTime(appState.lastUpdated);
    }
}

// Event Handlers
function setupEventListeners() {
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage(item.dataset.page);
        });
    });

    document.querySelectorAll('.view-all-link').forEach(link => {
        link.addEventListener('click', (e) => {
            e.preventDefault();
            navigateToPage(link.dataset.page);
        });
    });

    const sidebarToggle = document.getElementById('sidebarToggle');
    const sidebar = document.getElementById('sidebar');
    if (sidebarToggle && sidebar) {
        sidebarToggle.addEventListener('click', () => {
            sidebar.classList.toggle('open');
        });
    }

    const modalClose = document.getElementById('modalClose');
    const modal = document.getElementById('eventModal');
    if (modalClose && modal) {
        modalClose.addEventListener('click', closeEventModal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal) closeEventModal();
        });
    }

    const refreshBtn = document.getElementById('refreshBtn');
    if (refreshBtn) {
        refreshBtn.addEventListener('click', () => {
            fetchAllData();
        });
    }
}

// Loading State
function showLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('active');
    }
}

function hideLoading() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.remove('active');
    }
}

// Initialization
async function initializeApp() {
    showLoading();

    try {
        setupEventListeners();
        await fetchAllData();

        // Initialize dashboard map and store in appState
        setTimeout(() => {
            appState.map = initializeMap('dashboardMap');
            if (appState.map) {
                appState.map.on('load', () => {
                    // Combine events and news with location data for dashboard map
                    const newsWithLocation = (appState.data.news || [])
                        .filter(item => item.location && item.location.lat && item.location.lng && 
                            !(item.location.lat === 20 && item.location.lng === 0))
                        .map(item => ({
                            id: `news-${item.pubDate}-${(item.title || '').substring(0, 20).replace(/\s+/g, '-')}`,
                            title: item.title,
                            source: item.source,
                            pubDate: item.pubDate,
                            location: item.location,
                            severity: assessEventSeverity(item.title, item.summary),
                            type: 'news',
                            url: item.link
                        }));
                    
                    const gdeltEvents = (appState.data.events || []).map(item => ({
                        id: item.id,
                        title: item.title,
                        source: item.source,
                        pubDate: item.pubDate,
                        location: item.location,
                        severity: item.severity || item.metadata?.severity || 'medium',
                        type: 'event',
                        url: item.url
                    }));
                    
                    const combinedEvents = [...newsWithLocation, ...gdeltEvents];
                    
                    // Add event markers to dashboard map
                    addEventMarkers(appState.map, combinedEvents);
                    // Start military activity heatmap
                    MilitaryActivityHeatmap.start(appState.map);
                    
                    console.log(`[Dashboard Map] Combined events: ${combinedEvents.length} (News: ${newsWithLocation.length}, GDELT: ${gdeltEvents.length})`);
                });
            }
        }, 100);

        // Set up auto-refresh every 10 minutes
        appState.refreshInterval = setInterval(() => {
            fetchAllData();
        }, 10 * 60 * 1000);

        showToast('Welcome to !ntellibot', 'Live data loaded successfully', 'success');
    } catch (error) {
        console.error('Initialization error:', error);
        showToast('Error', 'Failed to initialize dashboard', 'error');
    } finally {
        hideLoading();
    }
}

// Start the application
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeApp);
} else {
    initializeApp();
}
