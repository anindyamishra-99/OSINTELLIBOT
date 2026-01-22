const Parser = require('rss-parser');

const parser = new Parser({
    timeout: 8000,
    headers: {
        'User-Agent': 'intellibot-osint/1.0'
    }
});

// Cache for rate limiting
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

exports.handler = async (event, context) => {
    const startTime = Date.now();
    
    try {
        // Check cache first
        const cached = getCached('news');
        if (cached) {
            return {
                statusCode: 200,
                headers: { 
                    'Content-Type': 'application/json', 
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=300'
                },
                body: JSON.stringify(cached)
            };
        }

        // Most reliable feeds only (avoid timeout)
        const reliableFeeds = [
            { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
            { name: 'Reuters World', url: 'https://feeds.reuters.com/reuters/worldNews' },
            { name: 'Al Jazeera English', url: 'https://www.aljazeera.com/xml/rss.xml' },
            { name: 'AP News', url: 'https://apnews.com/rss/news' },
            { name: 'CNN World', url: 'https://rss.cnn.com/rss/cnn_world.rss' },
            { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss' },
            { name: 'NY Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' }
        ];

        async function fetchSingleFeed(feed) {
            try {
                const feedData = await parser.parseURL(feed.url);
                return feedData.items.slice(0, 5).map(item => ({
                    title: item.title,
                    summary: item.contentSnippet || item.content || '',
                    source: feed.name,
                    pubDate: item.isoDate || item.pubDate,
                    link: item.link,
                    categories: item.categories || []
                }));
            } catch (err) {
                console.log(`[News] Failed to fetch ${feed.name}: ${err.message}`);
                return [];
            }
        }

        // Fetch feeds with individual timeouts
        const newsPromises = reliableFeeds.map((feed, index) => 
            new Promise((resolve) => {
                const timeout = setTimeout(() => {
                    resolve([]);
                }, 7000);
                
                fetchSingleFeed(feed).then(results => {
                    clearTimeout(timeout);
                    resolve(results);
                }).catch(() => {
                    clearTimeout(timeout);
                    resolve([]);
                });
            })
        );

        const results = await Promise.all(newsPromises);
        let allNews = results.flat();

        // Fallback: fetch a few more if we got few results
        if (allNews.length < 15) {
            const fallbackFeeds = [
                { name: 'Washington Post', url: 'https://feeds.washingtonpost.com/rss/world' },
                { name: 'Kyiv Independent', url: 'https://kyivindependent.com/rss' },
                { name: 'Meduza English', url: 'https://meduza.io/rss/en' }
            ];
            
            const fallbackPromises = fallbackFeeds.map(feed => fetchSingleFeed(feed));
            const fallbackResults = await Promise.all(fallbackPromises);
            allNews = [...allNews, ...fallbackResults.flat()];
        }

        // Sort by date
        allNews.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        
        // Content filtering
        const unwantedPatterns = [
            /\.edu$/, '/feed', 'university', 'college', 'academic', 'research',
            'seduction', 'dating', 'romance', 'relationship advice', 'horoscope',
            'astrology', 'lottery', 'prize winner', 'clickbait', 'viral trend',
            'blogspot', 'wordpress.com', 'medium.com', 'substack.com'
        ];
        
        const nonLatinStart = /^[^\u0041-\u005A\u0061-\u007A\u00C0-\u00FF]/;
        
        allNews = allNews.filter(item => {
            const source = (item.source || '').toLowerCase();
            const title = item.title || '';
            const link = (item.link || '').toLowerCase();
            
            if (unwantedPatterns.some(p => {
                if (typeof p === 'string') return source.includes(p) || link.includes(p);
                return p.test(source) || p.test(link);
            })) return false;
            
            if (nonLatinStart.test(title.trim())) return false;
            return true;
        });
        
        const newsData = {
            news: allNews.slice(0, 40),
            lastUpdated: new Date().toISOString(),
            sources: [...new Set(allNews.map(n => n.source))].filter(Boolean),
            fetchTime: Date.now() - startTime
        };
        
        setCache('news', newsData);
        
        return {
            statusCode: 200,
            headers: { 
                'Content-Type': 'application/json', 
                'Access-Control-Allow-Origin': '*',
                'Cache-Control': 'public, max-age=300'
            },
            body: JSON.stringify(newsData)
        };
    } catch (error) {
        console.error('[News API] Error:', error.message);
        
        // Return cached data on error if available
        const cached = getCached('news');
        if (cached) {
            return {
                statusCode: 200,
                headers: { 
                    'Content-Type': 'application/json', 
                    'Access-Control-Allow-Origin': '*',
                    'X-Cached': 'true'
                },
                body: JSON.stringify(cached)
            };
        }
        
        return {
            statusCode: 503,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ 
                error: 'News service temporarily unavailable',
                message: 'RSS feeds are being fetched. Please refresh in a moment.',
                news: [],
                sources: []
            })
        };
    }
};
