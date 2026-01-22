const axios = require('axios');
const Parser = require('rss-parser');

const parser = new Parser({
    timeout: 10000,
    headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; intellibot/1.0)'
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
    try {
        const cached = getCached('news');
        if (cached) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
                body: JSON.stringify(cached)
            };
        }

        const rssFeeds = [
            { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
            { name: 'Reuters World', url: 'https://feeds.reuters.com/reuters/worldNews' },
            { name: 'Al Jazeera', url: 'https://www.aljazeera.com/xml/rss.xml' },
            { name: 'AP News', url: 'https://apnews.com/rss/news' }
        ];

        const newsPromises = rssFeeds.map(async (feed) => {
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
            } catch (error) {
                console.error(`Error fetching ${feed.name}:`, error.message);
                return [];
            }
        });

        const results = await Promise.allSettled(newsPromises);
        const allNews = results
            .filter(result => result.status === 'fulfilled')
            .flatMap(result => result.value)
            .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
        
        const newsData = {
            news: allNews.slice(0, 20),
            lastUpdated: new Date().toISOString(),
            sources: rssFeeds.map(f => f.name)
        };
        
        setCache('news', newsData);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(newsData)
        };
    } catch (error) {
        console.error('News API Error:', error);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify({ error: 'Failed to fetch news', message: error.message })
        };
    }
};
