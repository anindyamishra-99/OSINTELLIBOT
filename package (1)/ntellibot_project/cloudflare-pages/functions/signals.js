/**
 * Signals API - Cloudflare Worker
 * Fetches OSINT signals from GDELT and other sources
 */

// Cache for response caching
const cache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes

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

function categorizeSignal(title, source) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('military') || lowerTitle.includes('troop') || lowerTitle.includes('weapon')) return 'military';
    if (lowerTitle.includes('political') || lowerTitle.includes('election') || lowerTitle.includes('regime')) return 'political';
    if (lowerTitle.includes('econom') || lowerTitle.includes('trade') || lowerTitle.includes('sanction')) return 'economic';
    if (lowerTitle.includes('terror') || lowerTitle.includes('attack') || lowerTitle.includes('security')) return 'security';
    if (lowerTitle.includes('nuclear') || lowerTitle.includes('missile') || lowerTitle.includes('drone')) return 'strategic';
    return 'general';
}

function estimateConfidence(source) {
    const highConfidence = ['gdelt', 'reuters', 'ap', 'bbc', 'un', 'state.gov'];
    const mediumConfidence = ['crisisgroup', 'chatham', 'ecfr', 'al jazeera'];

    const lowerSource = source.toLowerCase();
    for (const src of highConfidence) {
        if (lowerSource.includes(src)) return 0.9;
    }
    for (const src of mediumConfidence) {
        if (lowerSource.includes(src)) return 0.7;
    }
    return 0.5;
}

function extractRegion(title) {
    const regions = {
        'Middle East': ['iran', 'israel', 'gaza', 'lebanon', 'syria', 'iraq', 'yemen'],
        'Europe': ['europe', 'ukraine', 'russia', 'poland', 'germany', 'france', 'uk'],
        'Asia': ['china', 'korea', 'japan', 'india', 'pakistan', 'taiwan'],
        'Americas': ['usa', 'america', 'canada', 'mexico', 'brazil', 'argentina']
    };

    const lowerTitle = title.toLowerCase();
    for (const [region, keywords] of Object.entries(regions)) {
        for (const keyword of keywords) {
            if (lowerTitle.includes(keyword)) return region;
        }
    }
    return 'Global';
}

async function fetchGDELTSignals(query, maxRecords = 20) {
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
            id: `sig-${Date.now()}-g-${query.substring(0, 3)}-${index}`,
            title: article.title || 'No Title',
            summary: article.summary || '',
            source: article.domain || 'Unknown',
            url: article.url,
            type: categorizeSignal(article.title || '', article.domain || ''),
            confidence: estimateConfidence(article.domain || ''),
            pubDate: article.published || new Date().toISOString(),
            region: extractRegion(article.title || ''),
            verified: false,
            tags: query.split(' '),
            dataSource: 'GDELT'
        }));
    } catch (error) {
        console.log(`GDELT signals query failed: ${query}`);
        return [];
    }
}

async function fetchSignals() {
    const cached = getCached('signals');
    if (cached) {
        return cached;
    }

    const gdeltQueries = [
        'military conflict violence',
        'political unrest protest',
        'nuclear missile threat',
        'terrorist attack',
        'diplomatic tension'
    ];

    const promises = gdeltQueries.map(query => fetchGDELTSignals(query, 20));
    const results = await Promise.allSettled(promises);

    let allSignals = [];
    let sourcesUsed = new Set();

    for (const result of results) {
        if (result.status === 'fulfilled' && Array.isArray(result.value)) {
            allSignals = allSignals.concat(result.value);
            result.value.forEach(s => sourcesUsed.add(s.dataSource));
        }
    }

    // If no signals, try alternate queries
    if (sourcesUsed.size === 0 || allSignals.length === 0) {
        const alternateQueries = [
            'government instability',
            'border conflict',
            'cyber attack',
            'energy crisis',
            'refugee displacement'
        ];

        const altPromises = alternateQueries.map(query => fetchGDELTSignals(query, 15));
        const altResults = await Promise.allSettled(altPromises);

        for (const result of altResults) {
            if (result.status === 'fulfilled' && Array.isArray(result.value)) {
                allSignals = allSignals.concat(result.value);
            }
        }
    }

    // Remove duplicates
    const uniqueSignals = allSignals.filter((signal, index, self) =>
        index === self.findIndex((s) => s.title === signal.title)
    );

    // Filter unwanted patterns
    const unwantedPatterns = [
        /\.edu$/i,
        'university',
        'college',
        'academic',
        'research',
        'harvard',
        'stanford',
        'mit.edu',
        'yale',
        'princeton'
    ];

    const filteredSignals = uniqueSignals.filter(item => {
        const source = item.source || '';
        const title = item.title || '';
        return !unwantedPatterns.some(pattern => {
            if (typeof pattern === 'string') {
                return source.toLowerCase().includes(pattern.toLowerCase()) ||
                       title.toLowerCase().includes(pattern.toLowerCase());
            }
            return pattern.test(source) || pattern.test(title);
        });
    });

    const sortedSignals = filteredSignals
        .sort((a, b) => b.confidence - a.confidence)
        .slice(0, 50);

    const result = {
        signals: sortedSignals,
        lastUpdated: new Date().toISOString(),
        totalCount: sortedSignals.length,
        dataSource: sortedSignals.length > 0 ? 'GDELT Multi-Source' : 'No Data',
        sourcesUsed: sortedSignals.length > 0 ? [...sourcesUsed] : [],
        disclaimer: sortedSignals.length > 0
            ? 'Live OSINT data aggregated from multiple sources including GDELT - requires independent verification'
            : 'No real-time data available at this time'
    };

    setCache('signals', result);
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
        const data = await fetchSignals();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: corsHeaders
        });
    } catch (error) {
        console.error('Signals API Error:', error.message);
        return new Response(JSON.stringify({
            signals: [],
            lastUpdated: new Date().toISOString(),
            dataSource: 'Error',
            error: error.message
        }), {
            status: 200,
            headers: corsHeaders
        });
    }
}

export const config = {
    path: '/api/signals'
};
