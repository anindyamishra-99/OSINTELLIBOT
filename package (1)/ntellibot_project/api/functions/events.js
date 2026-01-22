const axios = require('axios');

const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000;

function getCached(key) {
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_DURATION) {
        return cached.data;
    }
    return null;
}

function setCache(key, data) {
    cache.set(key, { timestamp: Date.now(), data });
}

function categorizeEvent(title) {
    const lowerTitle = title.toLowerCase();
    
    // Armed Conflict & Violence
    if (lowerTitle.includes('war') || lowerTitle.includes('battle') || lowerTitle.includes('combat') || 
        lowerTitle.includes('clash') || lowerTitle.includes('fighting') || lowerTitle.includes('offensive') ||
        lowerTitle.includes('invasion') || lowerTitle.includes('counter-offensive') || lowerTitle.includes('drone strike') ||
        lowerTitle.includes('air strike') || lowerTitle.includes('bombardment') || lowerTitle.includes('artillery')) {
        return 'armed-conflict';
    }
    
    // Terrorism & Insurgency
    if (lowerTitle.includes('terror') || lowerTitle.includes('attack') || lowerTitle.includes('bombing') || 
        lowerTitle.includes('explosion') || lowerTitle.includes('suicide') || lowerTitle.includes('militant') ||
        lowerTitle.includes('insurgency') || lowerTitle.includes('extremist') || lowerTitle.includes('isis') || 
        lowerTitle.includes('al qaeda') || lowerTitle.includes('hamas') || lowerTitle.includes('hezbollah')) {
        return 'terrorism';
    }
    
    // Political Instability & Crisis
    if (lowerTitle.includes('coup') || lowerTitle.includes('revolution') || lowerTitle.includes('insurrection') ||
        lowerTitle.includes('protest') || lowerTitle.includes('unrest') || lowerTitle.includes('demonstration') ||
        lowerTitle.includes('political crisis') || lowerTitle.includes('government collapse') || lowerTitle.includes('regime') ||
        lowerTitle.includes('election') || lowerTitle.includes('vote') || lowerTitle.includes('parliament') ||
        lowerTitle.includes('opposition') || lowerTitle.includes('dissident')) {
        return 'political-instability';
    }
    
    // Diplomatic Tensions
    if (lowerTitle.includes('tension') || lowerTitle.includes('sanction') || lowerTitle.includes('diplomat') ||
        lowerTitle.includes('expulsion') || lowerTitle.includes('summit') || lowerTitle.includes('negotiation') ||
        lowerTitle.includes('treaty') || lowerTitle.includes('agreement') || lowerTitle.includes('deal') ||
        lowerTitle.includes('breaking') || lowerTitle.includes('crisis') || lowerTitle.includes('escalation')) {
        return 'diplomatic-tensions';
    }
    
    // Humanitarian & Refugee
    if (lowerTitle.includes('humanitarian') || lowerTitle.includes('refugee') || lowerTitle.includes('displacement') ||
        lowerTitle.includes('famine') || lowerTitle.includes('crisis') || lowerTitle.includes('aid') ||
        lowerTitle.includes('starvation') || lowerTitle.includes('genocide') || lowerTitle.includes('atrocity') ||
        lowerTitle.includes('ethnic cleansing') || lowerTitle.includes('massacre')) {
        return 'humanitarian';
    }
    
    // Cyber & Information Warfare
    if (lowerTitle.includes('cyber') || lowerTitle.includes('hack') || lowerTitle.includes('disinformation') ||
        lowerTitle.includes('propaganda') || lowerTitle.includes('misinformation') || lowerTitle.includes('cyberattack')) {
        return 'cyber-warfare';
    }
    
    // Maritime & Border Security
    if (lowerTitle.includes('maritime') || lowerTitle.includes('naval') || lowerTitle.includes('border') ||
        lowerTitle.includes('coast guard') || lowerTitle.includes('shipping') || lowerTitle.includes('piracy') ||
        lowerTitle.includes('straits') || lowerTitle.includes('exclusive economic zone')) {
        return 'maritime-security';
    }
    
    // Health Emergencies
    if (lowerTitle.includes('health') || lowerTitle.includes('virus') || lowerTitle.includes('pandemic') || 
        lowerTitle.includes('disease') || lowerTitle.includes('outbreak') || lowerTitle.includes('covid') ||
        lowerTitle.includes('flu') || lowerTitle.includes('infection') || lowerTitle.includes('epidemic')) {
        return 'health-emergency';
    }
    
    // Environmental & Natural Disasters
    if (lowerTitle.includes('climate') || lowerTitle.includes('environment') || lowerTitle.includes('disaster') || 
        lowerTitle.includes('flood') || lowerTitle.includes('earthquake') || lowerTitle.includes('hurricane') ||
        lowerTitle.includes('storm') || lowerTitle.includes('wildfire') || lowerTitle.includes('drought')) {
        return 'environmental';
    }
    
    // Economic & Trade Disputes
    if (lowerTitle.includes('econom') || lowerTitle.includes('trade war') || lowerTitle.includes('tariff') || 
        lowerTitle.includes('sanctions') || lowerTitle.includes('embargo') || lowerTitle.includes('market') || 
        lowerTitle.includes('inflation') || lowerTitle.includes('recession') || lowerTitle.includes('financial')) {
        return 'economic';
    }
    
    return 'geopolitical';
}

function estimateSeverity(title) {
    const lowerTitle = title.toLowerCase();
    
    // CRITICAL: Major conflicts, mass casualties, genocide indicators
    const criticalKeywords = [
        'critical', 'emergency', 'crisis', 'massacre', 'genocide', 'ethnic cleansing',
        'apocalypse', 'catastroph', 'holocaust', 'atrocity', 'war crime', 'crimes against humanity',
        'major disaster', 'famine', 'starvation', 'refugee crisis', 'humanitarian catastrophe',
        'full-scale war', 'world war', 'nuclear', 'biological weapon', 'chemical weapon',
        'tens killed', 'hundreds killed', 'mass casualties', 'civilians killed',
        'ukraine war', 'gaza', 'israel-hamas', 'russia ukraine', 'israel iran',
        'taiwan', 'south china sea', 'tensions', 'conflict', 'invasion', 'offensive'
    ];
    
    // HIGH: Significant violence, attacks, political crises
    const highKeywords = [
        'attack', 'death', 'killed', 'murder', 'shooting', 'assassination', 'assassinat',
        'bomb', 'explosion', 'explosive', 'terror', 'hostage', 'kidnap',
        'suicide', 'militant', 'clash', 'fighting', 'battle', 'air strike',
        'coup', 'revolution', 'insurrection', 'riot', 'violent protest',
        'sanctions', 'expulsion', 'breaking', 'escalat',
        'military operation', 'counter-terrorism', 'counterinsurgency',
        'sudan', 'mali', 'nigeria', 'myanmar', 'afghanistan', 'ethiopia',
        'israel', 'palestine', 'lebanon', 'syria', 'iraq', 'yemen',
        'ukraine', 'russia', 'poland', 'baltic', 'crimea',
        'china', 'taiwan', 'indo-pacific', 'south china sea',
        'north korea', 'pakistan', 'india', 'kashmir',
        'colombia', 'mexico', 'haiti', 'venezuela',
        'dozens killed', 'casualties', 'injured'
    ];
    
    // MEDIUM: Political developments, tensions, disputes, moderate events
    const mediumKeywords = [
        'tension', 'tensions', 'threat', 'warning', 'alert',
        'protest', 'demonstration', 'rally', 'march',
        'election', 'vote', 'ballot', 'polling',
        'diplomat', 'diplomatic', 'summit', 'negotiation',
        'treaty', 'agreement', 'deal', 'pact',
        'border', 'frontier', 'coast', 'maritime',
        'sanction', 'tariff', 'trade dispute',
        'cyber', 'hack', 'disinformation',
        'humanitarian', 'aid', 'refugee', 'displaced',
        'trial', 'court', 'arrest', 'detention', 'prisoner',
        'political', 'government', 'minister', 'president', 'parliament',
        'rebel', 'insurgent', 'militia', 'armed group',
        'pipeline', 'energy', 'oil', 'gas', 'natural resource',
        'arms', 'weapons', 'military aid', 'security',
        'regional', 'international', 'global',
        'crisis', 'instability', 'volatile',
        'iran', 'israel', 'saudi', 'uae', 'gulf',
        'somalia', 'kenya', 'ethiopia', 'eritrea', 'horn of africa',
        'congo', 'drc', 'central african', 'cameroon',
        'armenia', 'azerbaijan', 'nagorno-karabakh',
        'thailand', 'myanmar', 'cambodia', 'southeast asia',
        'peru', 'ecuador', 'bolivia', 'latin america',
        'several killed', 'many dead', 'multiple dead'
    ];
    
    // Check for CRITICAL first
    if (criticalKeywords.some(keyword => lowerTitle.includes(keyword))) {
        return 'critical';
    }
    
    // Check for HIGH severity
    if (highKeywords.some(keyword => lowerTitle.includes(keyword))) {
        return 'high';
    }
    
    // Check for MEDIUM severity
    if (mediumKeywords.some(keyword => lowerTitle.includes(keyword))) {
        return 'medium';
    }
    
    // Default to low for routine geopolitical news
    return 'low';
}

function extractLocation(title) {
    const locations = {
        // US States - Must come BEFORE countries to avoid partial matching issues
        'Indiana': { lat: 40.2672, lng: -86.1349, country: 'US', place_name: 'Indiana, United States' },
        'California': { lat: 36.7783, lng: -119.4179, country: 'US', place_name: 'California, United States' },
        'Texas': { lat: 31.9686, lng: -99.9018, country: 'US', place_name: 'Texas, United States' },
        'Florida': { lat: 27.6648, lng: -81.5158, country: 'US', place_name: 'Florida, United States' },
        'New York': { lat: 40.7128, lng: -74.0060, country: 'US', place_name: 'New York, United States' },
        
        // Iran and Middle East
        'Iran': { lat: 32.4279, lng: 53.6880, country: 'IR', place_name: 'Iran' },
        'Tehran': { lat: 35.6892, lng: 51.3890, country: 'IR', place_name: 'Tehran, Iran' },
        'Israel': { lat: 31.0461, lng: 34.8516, country: 'IL', place_name: 'Israel' },
        'Gaza': { lat: 31.3547, lng: 34.3108, country: 'PS', place_name: 'Gaza' },
        'Lebanon': { lat: 33.8547, lng: 35.8623, country: 'LB', place_name: 'Lebanon' },
        'Beirut': { lat: 33.8886, lng: 35.4955, country: 'LB', place_name: 'Beirut, Lebanon' },
        'Syria': { lat: 34.8021, lng: 38.9968, country: 'SY', place_name: 'Syria' },
        'Damascus': { lat: 33.5138, lng: 36.2765, country: 'SY', place_name: 'Damascus, Syria' },
        'Iraq': { lat: 33.3152, lng: 44.3661, country: 'IQ', place_name: 'Iraq' },
        'Baghdad': { lat: 33.3152, lng: 44.3661, country: 'IQ', place_name: 'Baghdad, Iraq' },
        'Yemen': { lat: 15.5527, lng: 48.5164, country: 'YE', place_name: 'Yemen' },
        'Jordan': { lat: 30.5852, lng: 36.2384, country: 'JO', place_name: 'Jordan' },
        'Saudi': { lat: 23.8859, lng: 45.0792, country: 'SA', place_name: 'Saudi Arabia' },
        'UAE': { lat: 23.4241, lng: 53.8478, country: 'AE', place_name: 'UAE' },
        'Qatar': { lat: 25.3548, lng: 51.1839, country: 'QA', place_name: 'Qatar' },
        'Kuwait': { lat: 29.3117, lng: 47.4818, country: 'KW', place_name: 'Kuwait' },
        
        // Americas
        'United States': { lat: 37.0902, lng: -95.7129, country: 'US', place_name: 'United States' },
        'USA': { lat: 37.0902, lng: -95.7129, country: 'US', place_name: 'United States' },
        'America': { lat: 37.0902, lng: -95.7129, country: 'US', place_name: 'United States' },
        'Washington': { lat: 38.9072, lng: -77.0369, country: 'US', place_name: 'Washington D.C.' },
        'Los Angeles': { lat: 34.0522, lng: -118.2437, country: 'US', place_name: 'Los Angeles' },
        'Colombia': { lat: 4.5709, lng: -74.2973, country: 'CO', place_name: 'Colombia' },
        'Brazil': { lat: -14.2350, lng: -51.9253, country: 'BR', place_name: 'Brazil' },
        'Mexico': { lat: 23.6345, lng: -102.5528, country: 'MX', place_name: 'Mexico' },
        'Canada': { lat: 56.1304, lng: -106.3468, country: 'CA', place_name: 'Canada' },
        
        // Europe
        'Russia': { lat: 61.5240, lng: 105.3188, country: 'RU', place_name: 'Russia' },
        'Moscow': { lat: 55.7558, lng: 37.6173, country: 'RU', place_name: 'Moscow, Russia' },
        'Ukraine': { lat: 48.3794, lng: 31.1656, country: 'UA', place_name: 'Ukraine' },
        'Kiev': { lat: 50.4501, lng: 30.5234, country: 'UA', place_name: 'Kyiv, Ukraine' },
        'Kyiv': { lat: 50.4501, lng: 30.5234, country: 'UA', place_name: 'Kyiv, Ukraine' },
        'Poland': { lat: 51.9194, lng: 19.1451, country: 'PL', place_name: 'Poland' },
        'Germany': { lat: 51.1657, lng: 10.4515, country: 'DE', place_name: 'Germany' },
        'France': { lat: 46.2276, lng: 2.2137, country: 'FR', place_name: 'France' },
        'UK': { lat: 55.3781, lng: -3.4360, country: 'GB', place_name: 'United Kingdom' },
        'Britain': { lat: 55.3781, lng: -3.4360, country: 'GB', place_name: 'United Kingdom' },
        'London': { lat: 51.5074, lng: -0.1278, country: 'GB', place_name: 'London, UK' },
        'Spain': { lat: 40.4637, lng: -3.7492, country: 'ES', place_name: 'Spain' },
        'Italy': { lat: 41.8719, lng: 12.5674, country: 'IT', place_name: 'Italy' },
        
        // Asia - India comes AFTER US states to avoid Indiana matching
        'China': { lat: 35.8617, lng: 104.1954, country: 'CN', place_name: 'China' },
        'Beijing': { lat: 39.9042, lng: 116.4074, country: 'CN', place_name: 'Beijing, China' },
        'Taiwan': { lat: 23.6978, lng: 120.9605, country: 'TW', place_name: 'Taiwan' },
        'North Korea': { lat: 40.3399, lng: 127.5101, country: 'KP', place_name: 'North Korea' },
        'South Korea': { lat: 35.9078, lng: 127.7669, country: 'KR', place_name: 'South Korea' },
        'Seoul': { lat: 37.5665, lng: 126.9780, country: 'KR', place_name: 'Seoul, South Korea' },
        'Japan': { lat: 36.2048, lng: 138.2529, country: 'JP', place_name: 'Japan' },
        'Tokyo': { lat: 35.6762, lng: 139.6503, country: 'JP', place_name: 'Tokyo, Japan' },
        'Pakistan': { lat: 30.3753, lng: 69.3451, country: 'PK', place_name: 'Pakistan' },
        'India': { lat: 20.5937, lng: 78.9629, country: 'IN', place_name: 'India' },
        'New Delhi': { lat: 28.6139, lng: 77.2090, country: 'IN', place_name: 'New Delhi, India' },
        'Thailand': { lat: 15.8700, lng: 100.9925, country: 'TH', place_name: 'Thailand' },
        'Bangkok': { lat: 13.7563, lng: 100.5018, country: 'TH', place_name: 'Bangkok, Thailand' },
        'Cambodia': { lat: 12.5657, lng: 104.9910, country: 'KH', place_name: 'Cambodia' },
        'Vietnam': { lat: 14.0583, lng: 108.2772, country: 'VN', place_name: 'Vietnam' },
        'Myanmar': { lat: 21.9140, lng: 95.9560, country: 'MM', place_name: 'Myanmar' },
        'Afghanistan': { lat: 33.9391, lng: 67.7100, country: 'AF', place_name: 'Afghanistan' },
        
        // Africa
        'Somalia': { lat: 5.1521, lng: 46.1996, country: 'SO', place_name: 'Somalia' },
        'Mogadishu': { lat: 2.0469, lng: 45.3182, country: 'SO', place_name: 'Mogadishu, Somalia' },
        'Sudan': { lat: 12.8628, lng: 7.9573, country: 'SD', place_name: 'Sudan' },
        'Ethiopia': { lat: 9.1450, lng: 40.4897, country: 'ET', place_name: 'Ethiopia' },
        'Nigeria': { lat: 9.0820, lng: 8.6753, country: 'NG', place_name: 'Nigeria' },
        'Kenya': { lat: -0.0236, lng: 37.9062, country: 'KE', place_name: 'Kenya' },
        'South Africa': { lat: -30.5595, lng: 22.9375, country: 'ZA', place_name: 'South Africa' },
        'Egypt': { lat: 26.8206, lng: 30.8025, country: 'EG', place_name: 'Egypt' },
        'Libya': { lat: 26.3351, lng: 17.2283, country: 'LY', place_name: 'Libya' },
        'Tunisia': { lat: 33.8869, lng: 9.5375, country: 'TN', place_name: 'Tunisia' },
        'Algeria': { lat: 28.0339, lng: 1.6596, country: 'DZ', place_name: 'Algeria' },
        'Morocco': { lat: 31.7917, lng: -7.0926, country: 'MA', place_name: 'Morocco' },
        'DRC': { lat: -4.0383, lng: 21.7587, country: 'CD', place_name: 'Democratic Republic of Congo' },
        'Mali': { lat: 17.5707, lng: -3.9962, country: 'ML', place_name: 'Mali' },
        'Niger': { lat: 17.6078, lng: 8.0817, country: 'NE', place_name: 'Niger' },
        'Burkina Faso': { lat: 12.2383, lng: -1.5616, country: 'BF', place_name: 'Burkina Faso' },
        'Chad': { lat: 15.4542, lng: 18.7322, country: 'TD', place_name: 'Chad' },
        'Mozambique': { lat: -18.7669, lng: 35.5295, country: 'MZ', place_name: 'Mozambique' }
    };

    const lowerTitle = title.toLowerCase();
    
    // Special handling for US states that contain "India" (e.g., Indiana)
    // Check these first with word boundaries
    const usStatePatterns = [
        { pattern: /\bindiana\b/i, name: 'Indiana' },
        { pattern: /\bcalifornia\b/i, name: 'California' },
        { pattern: /\btexas\b/i, name: 'Texas' },
        { pattern: /\bflorida\b/i, name: 'Florida' }
    ];
    
    for (const { pattern, name } of usStatePatterns) {
        if (pattern.test(title)) {
            return locations[name];
        }
    }
    
    // For other locations, use word boundary matching to avoid partial matches
    for (const [name, coords] of Object.entries(locations)) {
        // Create word boundary pattern
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`\\b${escapedName}\\b`, 'i');
        if (pattern.test(title)) {
            return { ...coords, place_name: coords.place_name || name };
        }
    }
    
    return { lat: 20, lng: 0, country: 'XX', place_name: 'Global' };
}

exports.handler = async (event, context) => {
    try {
        const cached = getCached('events');
        if (cached) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cached)
            };
        }

        let events = [];
        let dataSource = 'none';
        let allResults = [];
        
        const eventPromises = [];
        
        // PRIMARY SOURCE: GDELT API - Multiple queries for comprehensive coverage
        // Query 1: Major Conflicts and Violence
        eventPromises.push(
            axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
                params: {
                    query: 'conflict war attack invasion offensive Ukraine Gaza Sudan Ethiopia Myanmar Yemen Syria Iraq sourcelang:english',
                    mode: 'artlist',
                    maxrecords: 50,
                    format: 'json'
                },
                timeout: 15000
            }).then(response => {
                if (response.data && response.data.articles) {
                    return response.data.articles.map((article, index) => ({
                        id: `evt-${Date.now()}-gdelt1-${index}`,
                        title: article.title || 'No Title',
                        summary: article.summary || article.socialimage || '',
                        url: article.url,
                        source: article.domain || 'GDELT',
                        pubDate: article.published || new Date().toISOString(),
                        type: categorizeEvent(article.title || ''),
                        severity: estimateSeverity(article.title || ''),
                        location: extractLocation(article.title || ''),
                        dataSource: 'GDELT'
                    }));
                }
                return [];
            }).catch((err) => {
                console.log('GDELT Query 1 failed:', err.message);
                return [];
            })
        );
        
        // Query 2: Political Tensions and Crises
        eventPromises.push(
            axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
                params: {
                    query: 'tension crisis summit negotiation sanctions election protest coup political instability sourcelang:english',
                    mode: 'artlist',
                    maxrecords: 50,
                    format: 'json'
                },
                timeout: 15000
            }).then(response => {
                if (response.data && response.data.articles) {
                    return response.data.articles.map((article, index) => ({
                        id: `evt-${Date.now()}-gdelt2-${index}`,
                        title: article.title || 'No Title',
                        summary: article.summary || article.socialimage || '',
                        url: article.url,
                        source: article.domain || 'GDELT',
                        pubDate: article.published || new Date().toISOString(),
                        type: categorizeEvent(article.title || ''),
                        severity: estimateSeverity(article.title || ''),
                        location: extractLocation(article.title || ''),
                        dataSource: 'GDELT'
                    }));
                }
                return [];
            }).catch((err) => {
                console.log('GDELT Query 2 failed:', err.message);
                return [];
            })
        );
        
        // Query 3: Terrorism and Security
        eventPromises.push(
            axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
                params: {
                    query: 'terrorism terrorist attack bombing militant insurgency extremist ISIS Al-Qaeda Hamas Hezbollah sourcelang:english',
                    mode: 'artlist',
                    maxrecords: 40,
                    format: 'json'
                },
                timeout: 15000
            }).then(response => {
                if (response.data && response.data.articles) {
                    return response.data.articles.map((article, index) => ({
                        id: `evt-${Date.now()}-gdelt3-${index}`,
                        title: article.title || 'No Title',
                        summary: article.summary || article.socialimage || '',
                        url: article.url,
                        source: article.domain || 'GDELT',
                        pubDate: article.published || new Date().toISOString(),
                        type: categorizeEvent(article.title || ''),
                        severity: estimateSeverity(article.title || ''),
                        location: extractLocation(article.title || ''),
                        dataSource: 'GDELT'
                    }));
                }
                return [];
            }).catch((err) => {
                console.log('GDELT Query 3 failed:', err.message);
                return [];
            })
        );
        
        // Query 4: Humanitarian and Refugee Crisis
        eventPromises.push(
            axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
                params: {
                    query: 'humanitarian crisis refugee displacement famine aid genocide atrocity sourcelang:english',
                    mode: 'artlist',
                    maxrecords: 30,
                    format: 'json'
                },
                timeout: 15000
            }).then(response => {
                if (response.data && response.data.articles) {
                    return response.data.articles.map((article, index) => ({
                        id: `evt-${Date.now()}-gdelt4-${index}`,
                        title: article.title || 'No Title',
                        summary: article.summary || article.socialimage || '',
                        url: article.url,
                        source: article.domain || 'GDELT',
                        pubDate: article.published || new Date().toISOString(),
                        type: categorizeEvent(article.title || ''),
                        severity: estimateSeverity(article.title || ''),
                        location: extractLocation(article.title || ''),
                        dataSource: 'GDELT'
                    }));
                }
                return [];
            }).catch((err) => {
                console.log('GDELT Query 4 failed:', err.message);
                return [];
            })
        );
        
        // Query 5: Regional Powers and Strategic Issues
        eventPromises.push(
            axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
                params: {
                    query: 'China Taiwan South China Sea Iran Israel Russia NATO India Pakistan North Korea sourcelang:english',
                    mode: 'artlist',
                    maxrecords: 40,
                    format: 'json'
                },
                timeout: 15000
            }).then(response => {
                if (response.data && response.data.articles) {
                    return response.data.articles.map((article, index) => ({
                        id: `evt-${Date.now()}-gdelt5-${index}`,
                        title: article.title || 'No Title',
                        summary: article.summary || article.socialimage || '',
                        url: article.url,
                        source: article.domain || 'GDELT',
                        pubDate: article.published || new Date().toISOString(),
                        type: categorizeEvent(article.title || ''),
                        severity: estimateSeverity(article.title || ''),
                        location: extractLocation(article.title || ''),
                        dataSource: 'GDELT'
                    }));
                }
                return [];
            }).catch((err) => {
                console.log('GDELT Query 5 failed:', err.message);
                return [];
            })
        );
        
        // FALLBACK 1: ACLED (Armed Conflict Location & Event Data)
        // Real-time conflict tracking data
        eventPromises.push(
            axios.get('https://api.acleddata.com/acled/read', {
                params: {
                    key: process.env.ACLED_API_KEY || '',
                    format: 'json',
                    limit: 50
                },
                timeout: 15000
            }).then(response => {
                // ACLED requires an API key, so this will likely fail without it
                // But we try anyway as some endpoints may be open
                if (response.data && response.data.data) {
                    return response.data.data.map((event, index) => ({
                        id: `evt-${Date.now()}-acled-${index}`,
                        title: event.event_type || 'ACLED Event',
                        summary: event.sub_event_type || '',
                        url: `https://acleddata.com/event/${event.event_id || ''}`,
                        source: 'ACLED',
                        pubDate: event.event_date || new Date().toISOString(),
                        type: categorizeEvent(event.event_type || ''),
                        severity: estimateSeverity(event.event_type || ''),
                        location: {
                            lat: event.latitude || 20,
                            lng: event.longitude || 0,
                            country: event.country_code || 'XX',
                            place_name: event.location || 'Unknown'
                        },
                        dataSource: 'ACLED'
                    }));
                }
                return [];
            }).catch(() => {
                console.log('ACLED API not available (requires API key)');
                return [];
            })
        );
        
        // FALLBACK 2: ReliefWeb Humanitarian Events
        eventPromises.push(
            axios.get('https://api.reliefweb.int/v1/events', {
                params: {
                    appname: 'ntellibot',
                    limit: 50,
                    profile: 'full'
                },
                timeout: 15000
            }).then(response => {
                if (response.data && response.data.data) {
                    return response.data.data.map((item, index) => ({
                        id: `evt-${Date.now()}-rw-${index}`,
                        title: item.fields.name || 'ReliefWeb Event',
                        summary: item.fields.description || '',
                        url: `https://reliefweb.int${item.fields.url_alias || ''}`,
                        source: 'ReliefWeb',
                        pubDate: item.fields.date.created || new Date().toISOString(),
                        type: categorizeEvent(item.fields.name || ''),
                        severity: estimateSeverity(item.fields.name || ''),
                        location: extractLocation(item.fields.name || ''),
                        dataSource: 'ReliefWeb'
                    }));
                }
                return [];
            }).catch(() => {
                console.log('ReliefWeb API not available');
                return [];
            })
        );
        
        // FALLBACK 3: Emergency Events Dataset (via GDELT 2.0)
        eventPromises.push(
            axios.get('https://api.gdeltproject.org/api/v2/doc/doc', {
                params: {
                    query: 'disaster emergency crisis earthquake flood hurricane fire sourcelang:english',
                    mode: 'artlist',
                    maxrecords: 30,
                    format: 'json'
                },
                timeout: 15000
            }).then(response => {
                if (response.data && response.data.articles) {
                    return response.data.articles.map((article, index) => ({
                        id: `evt-${Date.now()}-emg-${index}`,
                        title: article.title || 'Emergency Event',
                        summary: article.summary || '',
                        url: article.url,
                        source: article.domain || 'Emergency Events',
                        pubDate: article.published || new Date().toISOString(),
                        type: categorizeEvent(article.title || ''),
                        severity: 'high',
                        location: extractLocation(article.title || ''),
                        dataSource: 'GDELT-Emergency'
                    }));
                }
                return [];
            }).catch(() => {
                console.log('Emergency events query failed');
                return [];
            })
        );
        
        // FALLBACK 4: Wikipedia Current Events (always available)
        eventPromises.push(
            axios.get('https://en.wikipedia.org/api/rest_v1/feed/onthisday/events/now', {
                timeout: 10000
            }).then(response => {
                if (response.data && response.data.events) {
                    return response.data.events.slice(0, 20).map((event, index) => ({
                        id: `evt-${Date.now()}-wiki-${index}`,
                        title: event.text || 'Historical Event',
                        summary: event.description || '',
                        url: `https://en.wikipedia.org/wiki/Special:Redirect/event/${event.pages?.[0]?.id || ''}`,
                        source: 'Wikipedia',
                        pubDate: event.year ? new Date(event.year, event.month - 1, event.day).toISOString() : new Date().toISOString(),
                        type: categorizeEvent(event.text || ''),
                        severity: estimateSeverity(event.text || ''),
                        location: extractLocation(event.text || ''),
                        dataSource: 'Wikipedia'
                    }));
                }
                return [];
            }).catch(() => {
                console.log('Wikipedia API failed');
                return [];
            })
        );
        
        // FALLBACK 5: UN OCHA Humanitarian Coverage
        eventPromises.push(
            axios.get('https://api.hpc.tools/v1/public/situation-reports', {
                params: {
                    limit: 30
                },
                timeout: 15000
            }).then(response => {
                if (response.data && response.data.data) {
                    return response.data.data.map((report, index) => ({
                        id: `evt-${Date.now()}-ocha-${index}`,
                        title: report.title || 'UN OCHA Report',
                        summary: report.description || '',
                        url: report.webUrl || '',
                        source: 'UN OCHA',
                        pubDate: report.dateCreated || new Date().toISOString(),
                        type: 'humanitarian',
                        severity: 'high',
                        location: extractLocation(report.title || ''),
                        dataSource: 'UN OCHA'
                    }));
                }
                return [];
            }).catch(() => {
                console.log('UN OCHA API not available');
                return [];
            })
        );
        
        const results = await Promise.allSettled(eventPromises);
        
        // Collect all successful results
        for (const result of results) {
            if (result.status === 'fulfilled' && Array.isArray(result.value) && result.value.length > 0) {
                allResults = allResults.concat(result.value);
            }
        }
        
        // Use all results from all sources
        if (allResults.length > 0) {
            events = allResults;
            // Prioritize by source (GDELT first, then others)
            const sourcePriority = ['GDELT', 'ACLED', 'ReliefWeb', 'GDELT-Emergency', 'Wikipedia', 'UN OCHA'];
            events.sort((a, b) => {
                const prioA = sourcePriority.indexOf(a.dataSource);
                const prioB = sourcePriority.indexOf(b.dataSource);
                return (prioA === -1 ? 999 : prioA) - (prioB === -1 ? 999 : prioB);
            });
            dataSource = events[0]?.dataSource || 'Multiple Sources';
        }
        
        // Sort by date (most recent first)
        events.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        
        // Return empty array if no real data available
        if (events.length === 0) {
            console.log('No real-time event data available from any source');
        }

        const data = { 
            events: events.slice(0, 50), 
            lastUpdated: new Date().toISOString(),
            totalCount: events.length,
            dataSource: events.length > 0 ? dataSource : 'No Data Available',
            sourcesUsed: events.length > 0 ? [...new Set(events.map(e => e.dataSource))] : []
        };
        setCache('events', data);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Events API Error:', error.message);
        // Return empty on error - no fallback data
        const data = { 
            events: [], 
            lastUpdated: new Date().toISOString(),
            totalCount: 0,
            dataSource: 'Error',
            error: error.message
        };
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    }
};
