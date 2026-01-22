/**
 * News Tier 1 API - Cloudflare Worker
 * Fetches RSS feeds from top 16 most reliable international news sources
 */

// Tier 1 RSS Feeds - Top 16 most reliable international sources
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

// Simple RSS parser that works in Cloudflare Workers
function parseRSS(xmlText) {
    const items = [];
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>/gi;
    let match;

    while ((match = itemRegex.exec(xmlText)) !== null) {
        const itemXml = match[1];

        const titleMatch = /<title[^>]*>([^<]*)<\/title>/i.exec(itemXml);
        const linkMatch = /<link[^>]*>([^<]*)<\/link>/i.exec(itemXml);
        const descMatch = /<description[^>]*>([^<]*)<\/description>/i.exec(itemXml);
        const contentMatch = /<content:encoded[^>]*>([^<]*)<\/content:encoded>/i.exec(itemXml);
        const pubDateMatch = /<pubDate[^>]*>([^<]*)<\/pubDate>/i.exec(itemXml);
        const guidMatch = /<guid[^>]*>([^<]*)<\/guid>/i.exec(itemXml);

        // Extract categories from <category> tags
        const categoryRegex = /<category[^>]*>([^<]*)<\/category>/gi;
        const categories = [];
        let catMatch;
        while ((catMatch = categoryRegex.exec(itemXml)) !== null) {
            categories.push(catMatch[1].trim());
        }

        const title = safeExtract(titleMatch ? titleMatch[1] : '');
        const link = safeExtract(linkMatch ? linkMatch[1] : guidMatch ? guidMatch[1] : '');
        const contentSnippet = safeExtract(descMatch ? descMatch[1] : contentMatch ? contentMatch[1] : '');

        // Clean up HTML from content
        const summary = contentSnippet
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .trim()
            .substring(0, 500);

        if (title) {
            items.push({
                title: title.trim(),
                summary: summary,
                source: '',
                pubDate: pubDateMatch ? pubDateMatch[1].trim() : '',
                link: link.trim(),
                categories: categories
            });
        }
    }

    return items;
}

async function fetchFeed(feed) {
    const startTime = Date.now();
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch(feed.url, {
            method: 'GET',
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            },
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }

        const xmlText = await response.text();
        const items = parseRSS(xmlText);

        const articles = items.slice(0, 5).map(item => ({
            title: item.title,
            summary: item.summary,
            source: feed.name,
            pubDate: item.pubDate,
            link: item.link,
            categories: item.categories
        }));

        console.log(`[Tier1] ${feed.name}: ${articles.length} articles in ${Date.now() - startTime}ms`);
        return { success: true, articles, feedName: feed.name, duration: Date.now() - startTime };
    } catch (err) {
        console.log(`[Tier1] FAILED ${feed.name}: ${err.message.substring(0, 40)}`);
        return { success: false, articles: [], feedName: feed.name, error: err.message };
    }
}

const UNWANTED_PATTERNS = [
    'university', 'college', 'academic', 'research',
    'seduction', 'dating', 'romance', 'relationship advice', 'horoscope',
    'astrology', 'lottery', 'prize winner', 'clickbait', 'viral trend',
    'blogspot', 'wordpress.com', 'medium.com', 'substack.com',
    'youtube.com', 'youtu.be', 'facebook.com', 'twitter.com',
    'instagram.com', 'tiktok', 'reddit', 'pinterest'
];

const NON_LATIN_START = /^[^\u0041-\u005A\u0061-\u007A\u00C0-\u00FF]/;

async function fetchNewsTier1() {
    const cached = getCached('news-tier1');
    if (cached) {
        console.log(`[Tier1] Returning cached data (${cached.articles?.length || 0} articles)`);
        return { ...cached, cached: true };
    }

    const startTime = Date.now();
    console.log(`[Tier1] Starting (${TIER1_FEEDS.length} feeds)`);

    let allArticles = [];
    let successCount = 0;
    const overallTimeout = 25000; // 25 second overall timeout

    for (let i = 0; i < TIER1_FEEDS.length; i++) {
        if (Date.now() - startTime > overallTimeout) {
            console.log(`[Tier1] Timeout reached at feed ${i + 1}`);
            break;
        }

        if (i > 0) await delay(50);

        const result = await fetchFeed(TIER1_FEEDS[i]);
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

        if (UNWANTED_PATTERNS.some(p => source.includes(p) || link.includes(p))) return false;
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
        tier: 1,
        lastUpdated: new Date().toISOString()
    };

    setCache('news-tier1', result);
    return result;
}

export default async function handler(request, env, ctx) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache'
    };

    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const data = await fetchNewsTier1();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: corsHeaders
        });
    } catch (error) {
        console.error(`[Tier1] ERROR:`, error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

export const config = {
    path: '/api/news-tier1'
};
