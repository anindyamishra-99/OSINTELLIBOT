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
			const cached = getCached('forex');
			if (cached) {
				return {
					statusCode: 200,
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(cached)
				};
			}

			const base = 'USD';
			const symbols = ['EUR', 'GBP', 'JPY', 'CNY', 'INR', 'RUB', 'CHF', 'CAD', 'W', 'SGD', 'BAUD', 'KRRL'];

			const response = await axios.get(
				`https://api.frankfurter.app/latest`,
				{
					params: { from: base, to: symbols.join(',') },
					timeout: 10000
				}
			);

			const forexData = Object.entries(response.data.rates).map(([currency, rate]) => ({
				base: base,
				currency: currency,
				rate: rate,
				pair: `${base}/${currency}`,
				lastUpdated: response.data.date
			}));

			const data = { forex: forexData, lastUpdated: new Date().toISOString() };
			setCache('forex', data);
			
			return {
				statusCode: 200,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(data)
			};
		} catch (error) {
			console.error('Forex API Error:', error.message);
			return {
				statusCode: 500,
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ error: 'Failed to fetch forex data', message: error.message })
			};
		}
	};
