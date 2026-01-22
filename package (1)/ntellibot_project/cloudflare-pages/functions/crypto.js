/**
 * Crypto API - Cloudflare Worker
 * Fetches cryptocurrency data from CoinGecko
 */

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

async function fetchCryptoData() {
    const cached = getCached('crypto');
    if (cached) {
        return cached;
    }

    const response = await fetch(
        'https://api.coingecko.com/api/v3/coins/markets',
        {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }
    );

    if (!response.ok) {
        throw new Error(`CoinGecko API error: ${response.status}`);
    }

    const data = await response.json();

    const cryptoData = data.map(coin => ({
        id: coin.id,
        name: coin.name,
        symbol: coin.symbol.toUpperCase(),
        price: coin.current_price,
        change24h: coin.price_change_percentage_24h,
        marketCap: coin.market_cap,
        volume24h: coin.total_volume,
        rank: coin.market_cap_rank,
        lastUpdated: new Date().toISOString()
    }));

    const result = { crypto: cryptoData, lastUpdated: new Date().toISOString() };
    setCache('crypto', result);

    return result;
}

export default async function handler(request, env, ctx) {
    const corsHeaders = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json'
    };

    // Handle CORS preflight
    if (request.method === 'OPTIONS') {
        return new Response(null, { status: 204, headers: corsHeaders });
    }

    try {
        const data = await fetchCryptoData();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: corsHeaders
        });
    } catch (error) {
        console.error('Crypto API Error:', error.message);
        return new Response(JSON.stringify({
            error: 'Failed to fetch crypto data',
            message: error.message
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

// Export route configuration for Cloudflare Pages
export const config = {
    path: '/api/crypto'
};
