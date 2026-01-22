const Parser = require('rss-parser');

// OPTIMIZED: Tier 2 - Remaining 16 reliable feeds (second half)
const TIER2_FEEDS = [
    { name: 'The Times of India', url: 'https://timesofindia.indiatimes.com/rssfeeds/-2128934595.cms' },
    { name: 'Hindustan Times', url: 'https://www.hindustantimes.com/feeds/rssIndia.xml' },
    { name: 'Channel News Asia', url: 'https://www.channelnewsasia.com/rss/cnews/world/rss.xml' },
    { name: 'SCMP', url: 'https://www.scmp.com/rss/feed/2/feed.xml' },
    { name: 'Times of Israel', url: 'https://www.timesofisrael.com/feed/' },
    { name: 'Arab News', url: 'https://www.arabnews.com/rss/category/middle-east' },
    { name: 'Defense News', url: 'https://www.defensenews.com/arc/outboundfeeds/rss/' },
    { name: 'Defense One', url: 'https://www.defenseone.com/feed/' },
    { name: 'Military Times', url: 'https://www.militarytimes.com/arc/outboundfeeds/rss/' },
    { name: 'The Hacker News', url: 'https://feeds.feedburner.com/TheHackersNews' },
    { name: 'BleepingComputer', url: 'https://www.bleepingcomputer.com/feed/' },
    { name: 'Krebs on Security', url: 'https://krebsonsecurity.com/feed/' },
    { name: 'SecurityWeek', url: 'https://www.securityweek.com/rss' },
    { name: 'Dark Reading', url: 'https://www.darkreading.com/rss' },
    { name: 'TechCrunch', url: 'https://techcrunch.com/feed/' },
    { name: 'Wired', url: 'https://www.wired.com/feed/rss' }
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
        
        console.log(`[Tier2] ${feed.name}: ${articles.length} articles in ${Date.now() - startTime}ms`);
        return { success: true, articles, feedName: feed.name, duration: Date.now() - startTime };
    } catch (err) {
        console.log(`[Tier2] FAILED ${feed.name}: ${err.message.substring(0, 40)}`);
        return { success: false, articles: [], feedName: feed.name, error: err.message };
    }
}

exports.handler = async (event, context) => {
    const startTime = Date.now();
    const tierKey = 'news-tier2';
    
    console.log(`[Tier2] Starting (${TIER2_FEEDS.length} feeds)`);
    
    // Check cache first
    const cached = getCached(tierKey);
    if (cached) {
        console.log(`[Tier2] Returning cached data (${cached.articles.length} articles)`);
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
        
        for (let i = 0; i < TIER2_FEEDS.length; i++) {
            if (Date.now() - startTime > overallTimeout) {
                console.log(`[Tier2] Timeout reached at feed ${i + 1}`);
                break;
            }
            
            if (i > 0) await delay(80);
            
            const result = await fetchFeed(TIER2_FEEDS[i], i);
            if (result.success && result.articles.length > 0) {
                allArticles.push(...result.articles);
                successCount++;
            }
        }

        console.log(`[Tier2] Complete: ${successCount}/${TIER2_FEEDS.length} feeds, ${allArticles.length} articles in ${Date.now() - startTime}ms`);
        
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
            stats: { successCount, failedCount: TIER2_FEEDS.length - successCount, fetchTimeMs: Date.now() - startTime },
            tier: 2
        };
        
        setCache(tierKey, result);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
            body: JSON.stringify(result)
        };
    } catch (error) {
        console.error(`[Tier2] ERROR:`, error.message);
        return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: error.message }) };
    }
};
