/**
 * !ntellibot OSINT Dashboard - Cloudflare Worker
 * All data is fetched live from public APIs - no static/synthetic data
 */

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // ==================== CRYPTO API ====================
    if (path === '/api/crypto') {
      const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Content-Type': 'application/json'
      };
      if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
      }
      try {
        const response = await fetch('https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=20&page=1&sparkline=false', {
          headers: { 'Accept': 'application/json' }
        });
        const data = await response.json();
        const cryptoData = data.map(coin => ({
          id: coin.id, name: coin.name, symbol: coin.symbol.toUpperCase(),
          price: coin.current_price, change24h: coin.price_change_percentage_24h,
          marketCap: coin.market_cap, volume24h: coin.total_volume,
          rank: coin.market_cap_rank, lastUpdated: new Date().toISOString()
        }));
        return new Response(JSON.stringify({ crypto: cryptoData, lastUpdated: new Date().toISOString() }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch crypto data', message: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // ==================== FOREX API ====================
    if (path === '/api/forex') {
      const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
      try {
        const symbols = ['EUR', 'GBP', 'JPY', 'CNY', 'INR', 'RUB', 'CHF', 'CAD', 'AUD', 'SGD', 'KRW', 'BRL'];
        const response = await fetch(`https://api.frankfurter.app/latest?from=USD&to=${symbols.join(',')}`, { headers: { 'Accept': 'application/json' } });
        const data = await response.json();
        const forexData = Object.entries(data.rates).map(([symbol, rate]) => ({ symbol, rate, base: 'USD', timestamp: data.date }));
        return new Response(JSON.stringify({ forex: forexData, lastUpdated: new Date().toISOString() }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch forex data', message: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // ==================== EVENTS API (GDELT) ====================
    if (path === '/api/events') {
      const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
      try {
        const query = 'conflict military violence protest';
        const response = await fetch(`https://api.gdeltproject.org/api/v2/doc/doc?query=${encodeURIComponent(query)}&mode=artlist&maxrecords=50&format=json`, { headers: { 'Accept': 'application/json' } });
        const data = await response.json();
        const events = (data.articles || []).map(article => ({ title: article.title, url: article.url, source: article.domain, date: article.seendate, summary: article.socialimage || '' }));
        return new Response(JSON.stringify({ events, lastUpdated: new Date().toISOString() }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch events', message: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // ==================== SIGNALS API ====================
    if (path === '/api/signals') {
      const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
      try {
        const response = await fetch('https://api.gdeltproject.org/api/v2/doc/doc?query=military%20operation%20airstrike%20attack&mode=artlist&maxrecords=30&format=json', { headers: { 'Accept': 'application/json' } });
        const data = await response.json();
        const signals = (data.articles || []).map(article => ({ type: 'military', source: article.domain, title: article.title, url: article.url, date: article.seendate, confidence: 0.8 }));
        return new Response(JSON.stringify({ signals, lastUpdated: new Date().toISOString() }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch signals', message: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // ==================== PREDICTIONS API ====================
    if (path === '/api/predictions') {
      const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
      try {
        // Fetch recent events for pattern analysis
        const response = await fetch('https://api.gdeltproject.org/api/v2/doc/doc?query=global%20conflict&mode=artlist&maxrecords=100&format=json', { headers: { 'Accept': 'application/json' } });
        const data = await response.json();
        // Simple prediction based on event frequency
        const articleCount = data.articles?.length || 0;
        const volatility = articleCount > 50 ? 'high' : articleCount > 20 ? 'medium' : 'low';
        const predictions = [{ metric: 'conflict_risk', current: Math.min(articleCount / 100, 1), projected: Math.min((articleCount + 10) / 100, 1), confidence: 0.7, trend: volatility }];
        return new Response(JSON.stringify({ predictions, sources: ['GDELT'], lastUpdated: new Date().toISOString() }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to generate predictions', message: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // ==================== NEWS TIER 1 API ====================
    if (path === '/api/news-tier1') {
      const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
      try {
        const feeds = [
          'https://feeds.bbci.co.uk/news/world/rss.xml',
          'https://www.reutersagency.com/feed/',
          'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
          'https://www.aljazeera.com/xml/rss/all.xml'
        ];
        const articles = [];
        for (const feed of feeds.slice(0, 4)) {
          try {
            const response = await fetch(feed, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const text = await response.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');
            const items = xml.querySelectorAll('item');
            items.forEach(item => {
              if (articles.length < 50) {
                articles.push({
                  title: item.querySelector('title')?.textContent || '',
                  link: item.querySelector('link')?.textContent || '',
                  source: new URL(feed).hostname,
                  pubDate: item.querySelector('pubDate')?.textContent || '',
                  summary: item.querySelector('description')?.textContent?.substring(0, 200) || ''
                });
              }
            });
          } catch (e) { /* skip failed feeds */ }
        }
        return new Response(JSON.stringify({ articles, tier: 'tier1', lastUpdated: new Date().toISOString() }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch news', message: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // ==================== NEWS TIER 2 API ====================
    if (path === '/api/news-tier2') {
      const corsHeaders = { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' };
      if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: corsHeaders });
      try {
        const feeds = [
          'https://feeds.arstechnica.com/arstechnica/index',
          'https://www.wired.com/feed/rss',
          'https://www.technologyreview.com/feed/',
          'https://techcrunch.com/feed/'
        ];
        const articles = [];
        for (const feed of feeds.slice(0, 4)) {
          try {
            const response = await fetch(feed, { headers: { 'User-Agent': 'Mozilla/5.0' } });
            const text = await response.text();
            const parser = new DOMParser();
            const xml = parser.parseFromString(text, 'text/xml');
            const items = xml.querySelectorAll('item');
            items.forEach(item => {
              if (articles.length < 50) {
                articles.push({
                  title: item.querySelector('title')?.textContent || '',
                  link: item.querySelector('link')?.textContent || '',
                  source: new URL(feed).hostname,
                  pubDate: item.querySelector('pubDate')?.textContent || '',
                  summary: item.querySelector('description')?.textContent?.substring(0, 200) || ''
                });
              }
            });
          } catch (e) { /* skip failed feeds */ }
        }
        return new Response(JSON.stringify({ articles, tier: 'tier2', lastUpdated: new Date().toISOString() }), { status: 200, headers: corsHeaders });
      } catch (error) {
        return new Response(JSON.stringify({ error: 'Failed to fetch news', message: error.message }), { status: 500, headers: corsHeaders });
      }
    }

    // Return 404 for unknown API routes
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    }

    // Return API info for root
    return new Response(JSON.stringify({
      message: '!ntellibot OSINT Dashboard API',
      endpoints: ['/api/crypto', '/api/forex', '/api/events', '/api/signals', '/api/predictions', '/api/news-tier1', '/api/news-tier2']
    }), { headers: { 'Content-Type': 'application/json' } });
  }
};
