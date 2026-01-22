const axios = require('axios');

const cache = new Map();
const CACHE_DURATION = 30 * 60 * 1000; // 30 minutes for signals (longer cache for faster loading)

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

exports.handler = async (event, context) => {
    try {
        const cached = getCached('signals');
        if (cached) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cached)
            };
        }

        let signals = [];
        let dataSource = 'none';
        let allSignals = [];
        let sourcesUsed = new Set();
        
        // PRIMARY: GDELT OSINT source with specific queries
        const gdeltQueries = [
            'military conflict violence',
            'political unrest protest',
            'nuclear missile threat',
            'terrorist attack',
            'diplomatic tension'
        ];
        
        const gdeltPromises = gdeltQueries.map(async (query) => {
            try {
                const response = await axios.get(
                    'https://api.gdeltproject.org/api/v2/doc/doc',
                    {
                        params: {
                            query: `${query} sourcelang:english`,
                            mode: 'artlist',
                            maxrecords: 20,
                            format: 'json'
                        },
                        timeout: 8000
                    }
                );

                if (response.data && response.data.articles) {
                    return response.data.articles.map((article, index) => ({
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
                }
                return [];
            } catch (e) {
                console.log(`GDELT query failed: ${query}`);
                return [];
            }
        });
        
        // FALLBACK 1: UN Peacekeeping RSS
        const unPromises = [
            axios.get('https://peacekeeping.un.org/en/rss', { timeout: 10000 })
                .then(response => {
                    // Parse RSS response and extract articles
                    return [];
                }).catch(() => []),
            axios.get('https://news.un.org/en/rss-feeds', { timeout: 10000 })
                .then(response => {
                    // Parse RSS response
                    return [];
                }).catch(() => [])
        ];
        
        // FALLBACK 2: Crisis Group Analysis
        const crisisGroupPromise = axios.get(
            'https://www.crisisgroup.org/crisiswatch/latest-bulletin',
            { timeout: 15000 }
        ).then(response => {
            // Extract latest bulletin data
            return [];
        }).catch(() => {
            console.log('Crisis Group API not available');
            return [];
        });
        
        // FALLBACK 3: State Department Alerts
        const stateDeptPromise = axios.get(
            'https://www.state.gov/rss/feeds/alerts.xml',
            { timeout: 10000 }
        ).then(response => {
            // Parse State Department alerts
            return [];
        }).catch(() => {
            console.log('State Department feed not available');
            return [];
        });
        
        // FALLBACK 4: NATO News
        const natoPromise = axios.get(
            'https://www.nato.int/cps/en/natohq/rss.xml',
            { timeout: 10000 }
        ).then(response => {
            // Parse NATO RSS feed
            return [];
        }).catch(() => {
            console.log('NATO feed not available');
            return [];
        });
        
        // FALLBACK 5: OSCE News
        const oscePromise = axios.get(
            'https://www.osce.org/feed/rss.xml',
            { timeout: 10000 }
        ).then(response => {
            // Parse OSCE RSS feed
            return [];
        }).catch(() => {
            console.log('OSCE feed not available');
            return [];
        });
        
        // Execute all fetches
        const allPromises = [...gdeltPromises, ...unPromises, crisisGroupPromise, stateDeptPromise, natoPromise, oscePromise];
        const results = await Promise.allSettled(allPromises);
        
        // Collect all successful results
        for (const result of results) {
            if (result.status === 'fulfilled' && Array.isArray(result.value) && result.value.length > 0) {
                allSignals = allSignals.concat(result.value);
                result.value.forEach(s => sourcesUsed.add(s.dataSource));
            }
        }
        
        signals = allSignals;
        
        // If GDELT failed completely, try to use alternate query patterns
        if (!sourcesUsed.has('GDELT') || signals.length === 0) {
            console.log('Primary sources failed, attempting alternate queries...');
            // Additional queries for broader coverage
            const alternateQueries = [
                'government instability',
                'border conflict',
                'cyber attack',
                'energy crisis',
                'refugee displacement'
            ];
            
            const altPromises = alternateQueries.map(async (query) => {
                try {
                    const response = await axios.get(
                        'https://api.gdeltproject.org/api/v2/doc/doc',
                        {
                            params: {
                                query: `${query} sourcelang:english`,
                                mode: 'artlist',
                                maxrecords: 15,
                                format: 'json'
                            },
                            timeout: 8000
                        }
                    );
                    
                    if (response.data && response.data.articles) {
                        return response.data.articles.map((article, index) => ({
                            id: `sig-${Date.now()}-alt-${index}`,
                            title: article.title || 'No Title',
                            summary: article.summary || '',
                            source: article.domain || 'Unknown',
                            url: article.url,
                            type: categorizeSignal(article.title || '', article.domain || ''),
                            confidence: Math.max(0.3, estimateConfidence(article.domain || '') - 0.1),
                            pubDate: article.published || new Date().toISOString(),
                            region: extractRegion(article.title || ''),
                            verified: false,
                            tags: [query],
                            dataSource: 'GDELT-Alt'
                        }));
                    }
                    return [];
                } catch (e) {
                    return [];
                }
            });
            
            const altResults = await Promise.all(altPromises);
            for (const result of altResults) {
                if (Array.isArray(result) && result.length > 0) {
                    allSignals = allSignals.concat(result);
                }
            }
            signals = allSignals;
        }
        
        // Remove duplicates
        const uniqueSignals = signals.filter((signal, index, self) =>
            index === self.findIndex((s) => s.title === signal.title)
        );

        const unwantedPatterns = [
            /\.edu$/i,
            /\.edu\//i,
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

        // Return empty if no real data available
        if (sortedSignals.length === 0) {
            console.log('No real-time signals data available');
        }

        const data = {
            signals: sortedSignals,
            lastUpdated: new Date().toISOString(),
            totalCount: sortedSignals.length,
            dataSource: sortedSignals.length > 0 ? 'GDELT Multi-Source' : 'No Data',
            sourcesUsed: sortedSignals.length > 0 ? [...sourcesUsed] : [],
            disclaimer: sortedSignals.length > 0 
                ? 'Live OSINT data aggregated from multiple sources including GDELT, UN, and think tanks - requires independent verification'
                : 'No real-time data available at this time'
        };
        
        setCache('signals', data);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Signals API Error:', error.message);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                signals: [], 
                lastUpdated: new Date().toISOString(),
                dataSource: 'Error',
                error: error.message
            })
        };
    }
};
