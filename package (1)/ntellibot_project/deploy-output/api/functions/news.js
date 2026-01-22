/**
 * DEPRECATED: This endpoint is no longer active
 *
 * The frontend now calls /api/news-tier1 and /api/news-tier2 directly
 * in parallel for better reliability and performance.
 *
 * This file returns 410 Gone to indicate deprecation.
 */

exports.handler = async (event, context) => {
    return {
        statusCode: 410,
        headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*'
        },
        body: JSON.stringify({
            error: 'Deprecated',
            message: 'This endpoint has been replaced. Please use /api/news-tier1 and /api/news-tier2 directly.',
            alternatives: [
                {
                    endpoint: '/api/news-tier1',
                    description: 'RSS feeds 1-16 (international news sources)'
                },
                {
                    endpoint: '/api/news-tier2',
                    description: 'RSS feeds 17-32 (tech, defense, and regional sources)'
                }
            ],
            documentation: 'The frontend now aggregates these endpoints in parallel for better performance.'
        })
    };
};
