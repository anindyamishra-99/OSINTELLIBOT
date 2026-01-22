/**
 * Forex API - Cloudflare Worker
 * Fetches forex exchange rates from Frankfurter API
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

async function fetchForexData() {
    const cached = getCached('forex');
    if (cached) {
        return cached;
    }

    const symbols = ['EUR', 'GBP', 'JPY', 'CNY', 'INR', 'RUB', 'CHF', 'CAD', 'AUD', 'SGD', 'KRW', 'BRL'];
    const base = 'USD';

    const response = await fetch(
        `https://api.frankfurter.app/latest?from=${base}&to=${symbols.join(',')}`,
        {
            method: 'GET',
            headers: {
                'Accept': 'application/json',
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            }
        }
    );

    if (!response.ok) {
        throw new Error(`Frankfurter API error: ${response.status}`);
    }

    const data = await response.json();

    const forexData = Object.entries(data.rates).map(([currency, rate]) => ({
        base: base,
        currency: currency,
        rate: rate,
        pair: `${base}/${currency}`,
        lastUpdated: data.date
    }));

    const result = { forex: forexData, lastUpdated: new Date().toISOString() };
    setCache('forex', result);

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
        const data = await fetchForexData();
        return new Response(JSON.stringify(data), {
            status: 200,
            headers: corsHeaders
        });
    } catch (error) {
        console.error('Forex API Error:', error.message);
        return new Response(JSON.stringify({
            error: 'Failed to fetch forex data',
            message: error.message
        }), {
            status: 500,
            headers: corsHeaders
        });
    }
}

// Export route configuration for Cloudflare Pages
export const config = {
    path: '/api/forex'
};
