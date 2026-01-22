/**
 * News Tier 2 API - Cloudflare Worker
 * Fetches RSS feeds from 16 regional and specialty sources
 */

// Tier 2 RSS Feeds - Regional and specialty sources
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

        console.log(`[Tier2] ${feed.name}: ${articles.length} articles in ${Date.now() - startTime}ms`);
        return { success: true, articles, feedName: feed.name, duration: Date.now() - startTime };
    } catch (err) {
        console.log(`[Tier2] FAILED ${feed.name}: ${err.message.substring(0, 40)}`);
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

async function fetchNewsTier2() {
    const cached = getCached('news-tier2');
    if (cached) {
        console.log(`[Tier2] Returning cached data (${cached.articles?.length || 0} articles)`);
        return { ...cached, cached: true };
    }

    const startTime = Date.now();
    console.log(`[Tier2] Starting (${TIER2_FEEDS.length} feeds)`);

    let allArticles = [];
    let successCount = 0;
    const overallTimeout = 25000; // 25 second overall timeout

    for (let i = 0; i < TIER2_FEEDS.length; i++) {
        if (Date.now() - startTime > overallTimeout) {
            console.log(`[Tier2] Timeout reached at feed ${i + 1}`);
            break;
        }

        if (i > 0) await delay(50);

        const result = await fetchFeed(TIER2_FEEDS[i]);
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
        stats: { successCount, failedCount: TIER2_FEEDS.length - successCount, fetchTimeMs: Date.now() - startTime },
        tier: 2,
        lastUpdated: new Date().toISOString()
    };

    setCache('news-tier2', result);
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
        const data = await fetchNewsTier2();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: corsHeaders
        });
    } catch (error) {
        console.error(`[Tier2] ERROR:`, error.message);
        return new Response(JSON.stringify({ error: error.message }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

export const config = {
    path: '/api/news-tier2'
};
