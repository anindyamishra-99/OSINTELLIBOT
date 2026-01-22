const axios = require('axios');

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
        const cached = getCached('crypto');
        if (cached) {
            return {
                statusCode: 200,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(cached)
            };
        }

        const response = await axios.get(
            'https://api.coingecko.com/api/v3/coins/markets',
            {
                params: {
                    vs_currency: 'usd',
                    order: 'market_cap_desc',
                    per_page: 20,
                    page: 1,
                    sparkline: false,
                    price_change_percentage: '24h'
                },
                timeout: 10000
            }
        );

        const cryptoData = response.data.map(coin => ({
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

        const data = { crypto: cryptoData, lastUpdated: new Date().toISOString() };
        setCache('crypto', data);
        
        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        };
    } catch (error) {
        console.error('Crypto API Error:', error.message);
        return {
            statusCode: 500,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ error: 'Failed to fetch crypto data', message: error.message })
        };
    }
};
