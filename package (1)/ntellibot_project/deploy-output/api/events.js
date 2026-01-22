const axios = require('axios');

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
    if (lowerTitle.includes('health') || lowerTitle.includes('virus') || lowerTitle.includes('pandemic')) return 'health';
    if (lowerTitle.includes('military') || lowerTitle.includes('attack') || lowerTitle.includes('war')) return 'conflict';
    if (lowerTitle.includes('econom') || lowerTitle.includes('trade') || lowerTitle.includes('market')) return 'market';
    if (lowerTitle.includes('political') || lowerTitle.includes('election') || lowerTitle.includes('government')) return 'geopolitical';
    return 'geopolitical';
}

function estimateSeverity(title) {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('critical') || lowerTitle.includes('emergency') || lowerTitle.includes('crisis')) return 'critical';
    if (lowerTitle.includes('attack') || lowerTitle.includes('death') || lowerTitle.includes('disaster')) return 'high';
    if (lowerTitle.includes('tension') || lowerTitle.includes('conflict') || lowerTitle.includes('threat')) return 'medium';
    return 'low';
}

function extractLocation(title) {
    const locations = {
        'United States': { lat: 37.0902, lng: -95.7129, country: 'US' },
        'China': { lat: 35.8617, lng: 104.1954, country: 'CN' },
        'Russia': { lat: 61.5240, lng: 105.3188, country: 'RU' },
        'Ukraine': { lat: 48.3794, lng: 31.1656, country: 'UA' },
        'Europe': { lat: 54.5260, lng: 15.2551, country: 'EU' },
        'Middle East': { lat: 29.3117, lng: 47.4818, country: 'ME' },
        'Asia': { lat: 34.0479, lng: 100.6197, country: 'AS' }
    };

    for (const [name, coords] of Object.entries(locations)) {
        if (title.includes(name)) {
            return { ...coords, place_name: name };
        }
    }
    return { lat: 20, lng: 0, country: 'XX', place_name: 'Global' };
}

function generateFallbackEvents() {
    const now = Date.now();
    return [
        {
            id: 'evt-001',
            title: 'Global Markets React to Economic Indicators',
            summary: 'Major stock exchanges show mixed signals as investors digest new economic data releases.',
            url: '#',
            source: 'Financial News',
            pubDate: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
            type: 'market',
            severity: 'medium',
            location: { lat: 40.7128, lng: -74.0060, country: 'US', place_name: 'New York' }
        },
        {
            id: 'evt-002',
            title: 'International Climate Summit Continues Negotiations',
            summary: 'World leaders discuss new climate action commitments and carbon reduction targets.',
            url: '#',
            source: 'Environment News',
            pubDate: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
            type: 'geopolitical',
            severity: 'medium',
            location: { lat: 52.5200, lng: 13.4050, country: 'DE', place_name: 'Berlin' }
        },
        {
            id: 'evt-003',
            title: 'Technology Sector Reports Strong Quarterly Earnings',
            summary: 'Major tech companies exceed analyst expectations with robust revenue growth.',
            url: '#',
            source: 'Tech News',
            pubDate: new Date(now - 6 * 60 * 60 * 1000).toISOString(),
            type: 'market',
            severity: 'low',
            location: { lat: 37.3861, lng: -122.0839, country: 'US', place_name: 'Silicon Valley' }
        },
        {
            id: 'evt-004',
            title: 'Diplomatic Talks Advance Trade Negotiations',
            summary: 'Senior officials from multiple countries meet to discuss potential trade agreement framework.',
            url: '#',
            source: 'Diplomatic News',
            pubDate: new Date(now - 8 * 60 * 60 * 1000).toISOString(),
            type: 'geopolitical',
            severity: 'medium',
            location: { lat: 38.9072, lng: -77.0369, country: 'US', place_name: 'Washington D.C.' }
        },
        {
            id: 'evt-005',
            title: 'Health Organizations Monitor Disease Prevention Progress',
            summary: 'Global health authorities report on ongoing disease prevention and vaccination campaigns.',
            url: '#',
            source: 'Health News',
            pubDate: new Date(now - 10 * 60 * 60 * 1000).toISOString(),
            type: 'health',
            severity: 'medium',
            location: { lat: 46.2044, lng: 6.1432, country: 'CH', place_name: 'Geneva' }
        },
        {
            id: 'evt-006',
            title: 'Energy Markets Adjust to Supply Changes',
            summary: 'Oil and gas markets respond to new production estimates and demand forecasts.',
            url: '#',
            source: 'Energy News',
            pubDate: new Date(now - 12 * 60 * 60 * 1000).toISOString(),
            type: 'market',
            severity: 'low',
            location: { lat: 25.2048, lng: 55.2708, country: 'AE', place_name: 'Dubai' }
        }
    ];
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
        
        try {
            const response = await axios.get(
                'https://api.gdeltproject.org/api/v2/doc/doc',
                {
                    params: {
                        query: 'transcript sourcelang:english',
                        mode: 'artlist',
                        maxrecords: 50,
                        format: 'json'
                    },
                    timeout: 15000
                }
            );

            if (response.data && response.data.articles) {
                events = response.data.articles.map((article, index) => ({
                    id: `evt-${index}`,
                    title: article.title || 'No Title',
                    summary: article.socialimage || article.summary || '',
                    url: article.url,
                    source: article.domain || 'Unknown',
                    pubDate: article.published || new Date().toISOString(),
                    type: categorizeEvent(article.title || ''),
                    severity: estimateSeverity(article.title || ''),
                    location: extractLocation(article.title || '')
                }));
            }
        } catch (apiError) {
            console.log('GDELT API unavailable, using fallback events');
        }

        if (events.length === 0) {
            events = generateFallbackEvents();
        }

        const data = { events: events.slice(0, 30), lastUpdated: new Date().toISOString() };
        setCache('events', data);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Events API Error:', error.message);
        const fallbackData = { 
            events: generateFallbackEvents(), 
            lastUpdated: new Date().toISOString() 
        };
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(fallbackData)
        };
    }
};
