const Parser = require('rss-parser');

const parser = new Parser({
    timeout: 15000,
    headers: {
        'User-Agent': 'intellibot-osint/1.0'
    }
});

// Cache for rate limiting
const cache = new Map();
const CACHE_DURATION = 10 * 60 * 1000; // 10 minutes (increased to reduce API calls)

// Request tracking to prevent rate limiting
const requestLog = [];
const MAX_REQUESTS_PER_MINUTE = 30;
const MIN_REQUEST_DELAY = 1000; // 1 second between requests

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

// Rate limiting check
function checkRateLimit() {
    const now = Date.now();
    const oneMinuteAgo = now - 60000;
    
    // Clean old entries
    while (requestLog.length > 0 && requestLog[0] < oneMinuteAgo) {
        requestLog.shift();
    }
    
    // Check if we're rate limited
    if (requestLog.length >= MAX_REQUESTS_PER_MINUTE) {
        const waitTime = requestLog[0] + 60000 - now;
        if (waitTime > 0) {
            console.log(`[News] Rate limited, waiting ${Math.ceil(waitTime/1000)}s`);
            return waitTime;
        }
    }
    return 0;
}

// Record a request
function recordRequest() {
    requestLog.push(Date.now());
}

// Delay helper
function delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

// Method 1: Direct RSS parser (primary)
async function fetchWithRSSParser(feed) {
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
        throw new Error(`RSS Parser failed: ${err.message}`);
    }
}

// Method 2: rss2json API (fallback)
async function fetchWithRSS2JSON(feed) {
    try {
        const response = await fetch(`https://api.rss2json.com/v1/api.json?rss_url=${encodeURIComponent(feed.url)}`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const data = await response.json();
        if (data.status !== 'ok') throw new Error('RSS2JSON error');
        return data.items.slice(0, 5).map(item => ({
            title: item.title,
            summary: item.description || item.content || '',
            source: feed.name,
            pubDate: item.pubDate,
            link: item.link,
            categories: item.categories || []
        }));
    } catch (err) {
        throw new Error(`RSS2JSON failed: ${err.message}`);
    }
}

// Method 3: Direct fetch with node (alternative)
async function fetchWithDirectFetch(feed) {
    try {
        const response = await fetch(feed.url, {
            headers: {
                'User-Agent': 'intellibot-osint/1.0',
                'Accept': 'application/rss+xml, application/xml, text/xml, */*'
            }
        });
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const text = await response.text();
        const feedData = await parser.parseString(text);
        return feedData.items.slice(0, 5).map(item => ({
            title: item.title,
            summary: item.contentSnippet || item.content || '',
            source: feed.name,
            pubDate: item.isoDate || item.pubDate,
            link: item.link,
            categories: item.categories || []
        }));
    } catch (err) {
        throw new Error(`Direct fetch failed: ${err.message}`);
    }
}

// Unified fetch with multiple fallbacks
async function fetchFeedWithFallbacks(feed) {
    // Rate limiting check
    const waitTime = checkRateLimit();
    if (waitTime > 0) {
        await delay(waitTime);
    }
    
    recordRequest();
    
    // Try primary method: RSS Parser
    try {
        return await fetchWithRSSParser(feed);
    } catch (err1) {
        // Try fallback 1: RSS2JSON API
        try {
            await delay(500); // Small delay before fallback
            return await fetchWithRSS2JSON(feed);
        } catch (err2) {
            // Try fallback 2: Direct fetch
            try {
                await delay(500);
                return await fetchWithDirectFetch(feed);
            } catch (err3) {
                return [];
            }
        }
    }
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
                    'Cache-Control': 'public, max-age=600'
                },
                body: JSON.stringify(cached)
            };
        }

        // All RSS feeds
        const rssFeeds = [
            // Major International News (English)
            { name: 'BBC World', url: 'https://feeds.bbci.co.uk/news/world/rss.xml' },
            { name: 'Reuters World', url: 'https://feeds.reuters.com/reuters/worldNews' },
            { name: 'Al Jazeera English', url: 'https://www.aljazeera.com/xml/rss.xml' },
            { name: 'AP News', url: 'https://apnews.com/rss/news' },
            { name: 'CNN World', url: 'https://rss.cnn.com/rss/cnn_world.rss' },
            { name: 'The Guardian World', url: 'https://www.theguardian.com/world/rss' },
            { name: 'NY Times', url: 'https://rss.nytimes.com/services/xml/rss/nyt/World.xml' },
            { name: 'Washington Post', url: 'https://feeds.washingtonpost.com/rss/world' },
            
            // Iran News (English)
            { name: 'Iran International EN', url: 'https://www.iranintl.com/rss/news/iran' },
            { name: 'Iran Wire EN', url: 'https://iranwire.com/rss' },
            { name: 'Tehran Times', url: 'https://www.tehrantimes.com/rss' },
            
            // Ukraine News (English)
            { name: 'Kyiv Independent', url: 'https://kyivindependent.com/rss' },
            { name: 'Ukraine Pravda EN', url: 'https://www.pravda.com.ua/rss' },
            
            // Russia News (English)
            { name: 'Meduza English', url: 'https://meduza.io/rss/en' },
            { name: 'Moscow Times EN', url: 'https://www.themoscowtimes.com/rss/news' },
            
            // China News (English)
            { name: 'SCMP', url: 'https://www.scmp.com/rss/feed/2/news.xml' },
            { name: 'China Daily', url: 'https://www.chinadaily.com.cn/rss//world.rss' },
            
            // Latin America (English)
            { name: 'Latin America Report', url: 'https://latinamericareport.org/feed' },
            
            // Middle East (English)
            { name: 'Syria Direct EN', url: 'https://syriadirect.org/feed' },
            { name: 'Iraq News EN', url: 'https://www.iraqnews.com/rss' },
            
            // Africa (English)
            { name: 'AllAfrica', url: 'https://allafrica.com/rss/world' },
            { name: 'Somalia News EN', url: 'https://www.hiiraan.com/rss' },
            
            // Asia (English)
            { name: 'Pakistan Dawn EN', url: 'https://www.dawn.com/rss/news' },
            { name: 'India Express EN', url: 'https://indianexpress.com/rss/' },
            { name: 'Taiwan News EN', url: 'https://www.taiwannews.com.tw/feed' },
            { name: 'Thailand Post EN', url: 'https://www.bangkokpost.com/rss/news' },
            { name: 'North Korea News EN', url: 'https://www.nknews.org/feed' },
            
            // UN and International Organizations (True OSINT - English)
            { name: 'UN News', url: 'https://news.un.org/en/rss-feeds' },
            { name: 'US State Dept', url: 'https://www.state.gov/rss-feeds' },
            { name: 'WHO News', url: 'https://www.who.int/rss/en' },
            
            // Think Tanks and Analysis (English)
            { name: 'Crisis Group', url: 'https://www.crisisgroup.org/rss-0' },
            { name: 'Chatham House', url: 'https://www.chathamhouse.org/rss-feeds' },
            { name: 'ECFR', url: 'https://ecfr.eu/feeds/' },
            { name: 'Carnegie Endowment', url: 'https://carnegieendowment.org/rss' },
            { name: 'Brookings Institution', url: 'https://www.brookings.edu/feed' },
            
            // Global Voices (English)
            { name: 'Global Voices', url: 'https://globalvoices.org/feeds/' }
        ];

        // Fetch feeds with rate limiting
        const results = [];
        for (const feed of rssFeeds) {
            try {
                const articles = await fetchFeedWithFallbacks(feed);
                results.push(...articles);
            } catch (err) {
                console.log(`[News] Failed to fetch ${feed.name}: ${err.message}`);
            }
            // Small delay between feeds to prevent rate limiting
            await delay(200);
        }

        let allNews = results;

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
            news: allNews.slice(0, 50),
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
                'Cache-Control': 'public, max-age=600'
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
                message: 'All RSS fetch methods failed. Please refresh in a moment.',
                news: [],
                sources: []
            })
        };
    }
};
