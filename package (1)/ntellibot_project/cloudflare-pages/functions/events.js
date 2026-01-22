/**
 * Events API - Cloudflare Worker
 * Fetches geopolitical events from multiple OSINT sources
 */

// Cache for response caching
const cache = new Map();
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

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

    if (lowerTitle.includes('war') || lowerTitle.includes('battle') || lowerTitle.includes('combat') ||
        lowerTitle.includes('clash') || lowerTitle.includes('fighting') || lowerTitle.includes('offensive') ||
        lowerTitle.includes('invasion') || lowerTitle.includes('counter-offensive')) {
        return 'armed-conflict';
    }

    if (lowerTitle.includes('terror') || lowerTitle.includes('attack') || lowerTitle.includes('bombing') ||
        lowerTitle.includes('explosion') || lowerTitle.includes('suicide') || lowerTitle.includes('militant')) {
        return 'terrorism';
    }

    if (lowerTitle.includes('coup') || lowerTitle.includes('revolution') || lowerTitle.includes('protest') ||
        lowerTitle.includes('unrest') || lowerTitle.includes('demonstration') || lowerTitle.includes('political crisis')) {
        return 'political-instability';
    }

    if (lowerTitle.includes('tension') || lowerTitle.includes('sanction') || lowerTitle.includes('diplomat') ||
        lowerTitle.includes('summit') || lowerTitle.includes('negotiation') || lowerTitle.includes('treaty')) {
        return 'diplomatic-tensions';
    }

    if (lowerTitle.includes('humanitarian') || lowerTitle.includes('refugee') || lowerTitle.includes('displacement') ||
        lowerTitle.includes('famine') || lowerTitle.includes('aid') || lowerTitle.includes('genocide')) {
        return 'humanitarian';
    }

    if (lowerTitle.includes('cyber') || lowerTitle.includes('hack') || lowerTitle.includes('disinformation')) {
        return 'cyber-warfare';
    }

    if (lowerTitle.includes('maritime') || lowerTitle.includes('naval') || lowerTitle.includes('border')) {
        return 'maritime-security';
    }

    if (lowerTitle.includes('health') || lowerTitle.includes('virus') || lowerTitle.includes('pandemic')) {
        return 'health-emergency';
    }

    if (lowerTitle.includes('climate') || lowerTitle.includes('environment') || lowerTitle.includes('disaster')) {
        return 'environmental';
    }

    if (lowerTitle.includes('econom') || lowerTitle.includes('trade war') || lowerTitle.includes('tariff') ||
        lowerTitle.includes('sanctions') || lowerTitle.includes('embargo')) {
        return 'economic';
    }

    return 'geopolitical';
}

function estimateSeverity(title) {
    const lowerTitle = title.toLowerCase();

    const criticalKeywords = [
        'critical', 'crisis', 'massacre', 'genocide', 'ethnic cleansing',
        'major disaster', 'famine', 'refugee crisis', 'humanitarian catastrophe',
        'full-scale war', 'world war', 'nuclear', 'biological weapon', 'chemical weapon',
        'tens killed', 'hundreds killed', 'mass casualties', 'civilians killed',
        'ukraine war', 'gaza', 'israel-hamas', 'russia ukraine', 'israel iran'
    ];

    const highKeywords = [
        'attack', 'death', 'killed', 'murder', 'shooting', 'assassination',
        'bomb', 'explosion', 'terror', 'hostage', 'kidnap',
        'suicide', 'militant', 'clash', 'fighting', 'battle', 'air strike',
        'coup', 'revolution', 'insurrection', 'riot', 'violent protest',
        'sanctions', 'expulsion', 'escalat', 'military operation',
        'sudan', 'mali', 'nigeria', 'myanmar', 'afghanistan', 'ethiopia',
        'israel', 'palestine', 'lebanon', 'syria', 'iraq', 'yemen',
        'ukraine', 'russia', 'poland', 'baltic', 'crimea',
        'china', 'taiwan', 'indo-pacific', 'south china sea',
        'north korea', 'pakistan', 'india', 'kashmir',
        'dozens killed', 'casualties', 'injured'
    ];

    const mediumKeywords = [
        'tension', 'threat', 'warning', 'alert',
        'protest', 'demonstration', 'rally', 'march',
        'election', 'vote', 'ballot', 'polling',
        'diplomat', 'diplomatic', 'summit', 'negotiation',
        'treaty', 'agreement', 'deal', 'pact',
        'border', 'coast', 'maritime',
        'sanction', 'tariff', 'trade dispute',
        'cyber', 'hack', 'disinformation',
        'humanitarian', 'aid', 'refugee', 'displaced',
        'trial', 'court', 'arrest', 'detention', 'prisoner',
        'political', 'government', 'minister', 'president', 'parliament',
        'regional', 'international', 'global',
        'iran', 'israel', 'saudi', 'uae', 'gulf',
        'somalia', 'kenya', 'ethiopia', 'eritrea', 'horn of africa',
        'congo', 'drc', 'central african', 'cameroon'
    ];

    if (criticalKeywords.some(keyword => lowerTitle.includes(keyword))) {
        return 'critical';
    }

    if (highKeywords.some(keyword => lowerTitle.includes(keyword))) {
        return 'high';
    }

    if (mediumKeywords.some(keyword => lowerTitle.includes(keyword))) {
        return 'medium';
    }

    return 'low';
}

function extractLocation(title) {
    const locations = {
        'Indiana': { lat: 40.2672, lng: -86.1349, country: 'US', place_name: 'Indiana, United States' },
        'California': { lat: 36.7783, lng: -119.4179, country: 'US', place_name: 'California, United States' },
        'Texas': { lat: 31.9686, lng: -99.9018, country: 'US', place_name: 'Texas, United States' },
        'Florida': { lat: 27.6648, lng: -81.5158, country: 'US', place_name: 'Florida, United States' },
        'New York': { lat: 40.7128, lng: -74.0060, country: 'US', place_name: 'New York, United States' },
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
        'United States': { lat: 37.0902, lng: -95.7129, country: 'US', place_name: 'United States' },
        'USA': { lat: 37.0902, lng: -95.7129, country: 'US', place_name: 'United States' },
        'America': { lat: 37.0902, lng: -95.7129, country: 'US', place_name: 'United States' },
        'Washington': { lat: 38.9072, lng: -77.0369, country: 'US', place_name: 'Washington D.C.' },
        'Colombia': { lat: 4.5709, lng: -74.2973, country: 'CO', place_name: 'Colombia' },
        'Brazil': { lat: -14.2350, lng: -51.9253, country: 'BR', place_name: 'Brazil' },
        'Mexico': { lat: 23.6345, lng: -102.5528, country: 'MX', place_name: 'Mexico' },
        'Canada': { lat: 56.1304, lng: -106.3468, country: 'CA', place_name: 'Canada' },
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
        'Vietnam': { lat: 14.0583, lng: 108.2772, country: 'VN', place_name: 'Vietnam' },
        'Myanmar': { lat: 21.9140, lng: 95.9560, country: 'MM', place_name: 'Myanmar' },
        'Afghanistan': { lat: 33.9391, lng: 67.7100, country: 'AF', place_name: 'Afghanistan' },
        'Somalia': { lat: 5.1521, lng: 46.1996, country: 'SO', place_name: 'Somalia' },
        'Sudan': { lat: 12.8628, lng: 7.9573, country: 'SD', place_name: 'Sudan' },
        'Ethiopia': { lat: 9.1450, lng: 40.4897, country: 'ET', place_name: 'Ethiopia' },
        'Nigeria': { lat: 9.0820, lng: 8.6753, country: 'NG', place_name: 'Nigeria' },
        'Kenya': { lat: -0.0236, lng: 37.9062, country: 'KE', place_name: 'Kenya' },
        'South Africa': { lat: -30.5595, lng: 22.9375, country: 'ZA', place_name: 'South Africa' },
        'Egypt': { lat: 26.8206, lng: 30.8025, country: 'EG', place_name: 'Egypt' },
        'Libya': { lat: 26.3351, lng: 17.2283, country: 'LY', place_name: 'Libya' },
        'DRC': { lat: -4.0383, lng: 21.7587, country: 'CD', place_name: 'Democratic Republic of Congo' },
        'Mali': { lat: 17.5707, lng: -3.9962, country: 'ML', place_name: 'Mali' }
    };

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

    for (const [name, coords] of Object.entries(locations)) {
        const escapedName = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const pattern = new RegExp(`\\b${escapedName}\\b`, 'i');
        if (pattern.test(title)) {
            return { ...coords, place_name: coords.place_name || name };
        }
    }

    return { lat: 20, lng: 0, country: 'XX', place_name: 'Global' };
}

async function fetchGDELTEvents(query, maxRecords = 50) {
    try {
        const response = await fetch(
            `https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=${maxRecords}&format=json`,
            {
                method: 'GET',
                headers: {
                    'Accept': 'application/json',
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
                }
            }
        );

        if (!response.ok) {
            throw new Error(`GDELT API error: ${response.status}`);
        }

        const data = await response.json();

        if (!data.articles) {
            return [];
        }

        return data.articles.map((article, index) => ({
            id: `evt-${Date.now()}-gdelt-${index}`,
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
    } catch (error) {
        console.log('GDELT query failed:', error.message);
        return [];
    }
}

async function fetchEvents() {
    const cached = getCached('events');
    if (cached) {
        return cached;
    }

    const eventPromises = [
        // Query 1: Major Conflicts
        fetchGDELTEvents('conflict war attack invasion offensive Ukraine Gaza Sudan Ethiopia Myanmar Yemen Syria Iraq sourcelang:english', 50),
        // Query 2: Political Tensions
        fetchGDELTEvents('tension crisis summit negotiation sanctions election protest coup political instability sourcelang:english', 50),
        // Query 3: Terrorism
        fetchGDELTEvents('terrorism terrorist attack bombing militant insurgency extremist ISIS Al-Qaeda Hamas Hezbollah sourcelang:english', 40),
        // Query 4: Humanitarian
        fetchGDELTEvents('humanitarian crisis refugee displacement famine aid genocide atrocity sourcelang:english', 30),
        // Query 5: Regional Powers
        fetchGDELTEvents('China Taiwan South China Sea Iran Israel Russia NATO India Pakistan North Korea sourcelang:english', 40)
    ];

    const results = await Promise.allSettled(eventPromises);

    let allEvents = [];
    for (const result of results) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            allEvents = allEvents.concat(result.value);
        }
    }

    // Sort by date (most recent first)
    allEvents.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

    const result = {
        events: allEvents.slice(0, 50),
        lastUpdated: new Date().toISOString(),
        totalCount: allEvents.length,
        dataSource: allEvents.length > 0 ? 'GDELT Multi-Source' : 'No Data Available',
        sourcesUsed: allEvents.length > 0 ? [...new Set(allEvents.map(e => e.dataSource))] : []
    };

    setCache('events', result);
    return result;
}

export default async function handler(request, env, ctx) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const data = await fetchEvents();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: corsHeaders
        });
    } catch (error) {
        console.error('Events API Error:', error.message);
        return new Response(JSON.stringify({
            events: [],
            lastUpdated: new Date().toISOString(),
            totalCount: 0,
            dataSource: 'Error',
            error: error.message
        }), {
            status: 200,
            headers: corsHeaders
        });
    }
}

export const config = {
    path: '/api/events'
};
