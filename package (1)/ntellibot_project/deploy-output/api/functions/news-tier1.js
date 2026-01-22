const Parser = require('rss-parser');

// OPTIMIZED: Tier 1 - Top 16 most reliable feeds (first half)
const TIER1_FEEDS = [
    { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
    { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss' },
    { name: 'CNN World', url: 'https://rss.cnn.com/rss/cnn_world.rss' },
    { name: 'NY Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
    { name: 'Washington Post', url: 'https://feeds.washingtonpost.com/rss/world' },
    { name: 'The Week', url: 'https://www.theweek.co.uk/rss.xml' },
    { name: 'Euronews English', url: 'https://www.euronews.com/rss' },
    { name: 'Sky News', url: 'https://news.sky.com/rss' },
    { name: 'France 24', url: 'https://www.france24.com/en/rss' },
    { name: 'DW English', url: 'https://www.dw.com/rss/en.rss' },
    { name: 'TRT World', url: 'https://www.trtworld.com/rss' },
    { name: 'Irish Times', url: 'https://www.irishtimes.com/rss/news' },
    { name: 'ABC News Australia', url: 'https://www.abc.net.au/news/feed/51120/rss.xml' },
    { name: 'ABC News International', url: 'https://www.abc.net.au/news/feed/1009/rss.xml' },
    { name: 'NHK World', url: 'https://www3.nhk.or.jp/rss/news/world-eng.xml' },
    { name: 'The Japan Times', url: 'https://www.japantimes.co.jp/feed/' }
];

const parser = new Parser({
    timeout: 4000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
});

// Shared cache
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

function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function safeExtract(value, defaultValue = '') {
    if (value === null || value === undefined) return defaultValue;
    if (typeof value === 'string') return value;
    if (typeof value === 'object') {
        if (value._ !== undefined) return value._;
        if (value.name !== undefined) return value.name;
        if (value.title !== undefined) return value.title;
        return JSON.stringify(value);
    }
    return String(value);
}

function withTimeout(promise, timeoutMs, errorMsg) {
    return Promise.race([
        promise,
        new Promise((_, reject) => 
            setTimeout(() => reject(new Error(errorMsg)), timeoutMs)
        )
    ]);
}

const UNWANTED_PATTERNS = [
    /\.edu$/, '/feed', 'university', 'college', 'academic', 'research',
    'seduction', 'dating', 'romance', 'relationship advice', 'horoscope',
    'astrology', 'lottery', 'prize winner', 'clickbait', 'viral trend',
    'blogspot', 'wordpress.com', 'medium.com', 'substack.com',
    'youtube.com', 'youtu.be', 'facebook.com', 'twitter.com',
    'instagram.com', 'tiktok', 'reddit', 'pinterest'
];

const NON_LATIN_START = /^[^\u0041-\u005A\u0061-\u007A\u00C0-\u00FF]/;

async function fetchFeed(feed, feedIndex) {
    const startTime = Date.now();
    try {
        const feedData = await withTimeout(
            parser.parseURL(feed.url),
            4000,
            `Timeout (${feed.name})`
        );
        
        const articles = feedData.items.slice(0, 5).map(item => ({
            title: safeExtract(item.title),
            summary: safeExtract(item.contentSnippet || item.content || ''),
            source: feed.name,
            pubDate: item.isoDate || item.pubDate,
            link: item.link,
            categories: (item.categories || []).map(cat => safeExtract(cat))
        }));
        
        console.log(`[Tier1] ${feed.name}: ${articles.length} articles in ${Date.now() - startTime}ms`);
        return { success: true, articles, feedName: feed.name, duration: Date.now() - startTime };
    } catch (err) {
        console.log(`[Tier1] FAILED ${feed.name}: ${err.message.substring(0, 40)}`);
        return { success: false, articles: [], feedName: feed.name, error: err.message };
    }
}

exports.handler = async (event, context) => {
    const startTime = Date.now();
    const tierKey = 'news-tier1';
    
    console.log(`[Tier1] Starting (${TIER1_FEEDS.length} feeds)`);
    
    // Check cache first
    const cached = getCached(tierKey);
    if (cached) {
        console.log(`[Tier1] Returning cached data (${cached.articles.length} articles)`);
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*', 'X-Cached': 'true' },
            body: JSON.stringify(cached)
        };
    }

    try {
        let allArticles = [];
        let successCount = 0;
        const overallTimeout = 22000; // Leave 8s for aggregator
        
        for (let i = 0; i < TIER1_FEEDS.length; i++) {
            if (Date.now() - startTime > overallTimeout) {
                console.log(`[Tier1] Timeout reached at feed ${i + 1}`);
                break;
            }
            
            if (i > 0) await delay(80);
            
            const result = await fetchFeed(TIER1_FEEDS[i], i);
            if (result.success && result.articles.length > 0) {
                allArticles.push(...result.articles);
                successCount++;
            }
        }

        console.log(`[Tier1] Complete: ${successCount}/${TIER1_FEEDS.length} feeds, ${allArticles.length} articles in ${Date.now() - startTime}ms`);
        
        // Filter content
        allArticles = allArticles.filter(item => {
            const source = (item.source || '').toLowerCase();
            const title = item.title || '';
            const link = (item.link || '').toLowerCase();
            
            if (UNWANTED_PATTERNS.some(p => {
                if (typeof p === 'string') return source.includes(p) || link.includes(p);
                return p.test(source) || p.test(link);
            })) return false;
            
            if (NON_LATIN_START.test(title.trim())) return false;
            
            const articleDate = new Date(item.pubDate || 0);
            const fourteenDaysAgo = Date.now() - (14 * 24 * 60 * 60 * 1000);
            if (articleDate.getTime() < fourteenDaysAgo) return false;
            
            return true;
        });
        
        // Remove duplicates
        const seenTitles = new Set();
        const uniqueArticles = [];
        allArticles.forEach(item => {
            const titleKey = item.title.toLowerCase().trim();
            if (!seenTitles.has(titleKey)) {
                seenTitles.add(titleKey);
                uniqueArticles.push(item);
            }
        });

        const result = {
            articles: uniqueArticles,
            stats: { successCount, failedCount: TIER1_FEEDS.length - successCount, fetchTimeMs: Date.now() - startTime },
            tier: 1
        };
        
        setCache(tierKey, result);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error(`[Tier1] ERROR:`, error.message);
        return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.message }) };
    }
};
