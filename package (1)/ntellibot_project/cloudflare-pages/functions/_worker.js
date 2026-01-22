/**
 * Cloudflare Pages Worker Router
 * Routes API requests to appropriate function handlers
 * Serves static assets for all other requests
 */

// Import individual API handlers
import crypto from './crypto.js';
import forex from './forex.js';
import events from './events.js';
import signals from './signals.js';
import predictions from './predictions.js';
import newsTier1 from './news-tier1.js';
import newsTier2 from './news-tier2.js';

// API route mappings
const API_ROUTES = {
    '/api/crypto': crypto,
    '/api/forex': forex,
    '/api/events': events,
    '/api/signals': signals,
    '/api/predictions': predictions,
    '/api/news-tier1': newsTier1,
    '/api/news-tier2': newsTier2
};

// Rate limiting storage (in-memory, reset on worker restart)
const rateLimitMap = new Map();
const RATE_LIMIT_MAX = 100; // requests per minute
const RATE_LIMIT_WINDOW = 60000; // 1 minute

function getRateLimitKey(ip, path) {
    return `${ip}:${path}`;
}

function checkRateLimit(ip, path) {
    const key = getRateLimitKey(ip, path);
    const now = Date.now();

    const entry = rateLimitMap.get(key);
    if (!entry) {
        rateLimitMap.set(key, { count: 1, windowStart: now });
        return true;
    }

    // Reset window if expired
    if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
        rateLimitMap.set(key, { count: 1, windowStart: now });
        return true;
    }

    // Check limit
    if (entry.count >= RATE_LIMIT_MAX) {
        return false;
    }

    entry.count++;
    return true;
}

function getClientIP(request) {
    return request.headers.get('CF-Connecting-IP') || 'unknown';
}

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const path = url.pathname;
        const method = request.method;
        const clientIP = getClientIP(request);

        // Handle CORS preflight requests
        if (method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type',
                    'Access-Control-Max-Age': '86400'
                }
            });
        }

        // API route handling
        if (path.startsWith('/api/')) {
            // Check rate limit
            if (!checkRateLimit(clientIP, path)) {
                return new Response(JSON.stringify({
                    error: 'Rate limit exceeded',
                    message: 'Too many requests. Please try again later.'
                }), {
                    status: 429,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Retry-After': '60'
                    }
                });
            }

            // Route to appropriate handler
            const handler = API_ROUTES[path];
            if (handler) {
                try {
                    return await handler.fetch(request, env, ctx);
                } catch (error) {
                    console.error(`Error handling ${path}:`, error);
                    return new Response(JSON.stringify({
                        error: 'Internal Server Error',
                        message: error.message
                    }), {
                        status: 500,
                        headers: {
                            'Content-Type': 'application/json',
                            'Access-Control-Allow-Origin': '*'
                        }
                    });
                }
            }

            // Unknown API route
            return new Response(JSON.stringify({
                error: 'Not Found',
                message: `Unknown API endpoint: ${path}`
            }), {
                status: 404,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                }
            });
        }

        // For non-API requests, return 404 (static files are served by Cloudflare Pages)
        return new Response(JSON.stringify({
            error: 'Not Found',
            message: 'This endpoint is for API only'
        }), {
            status: 404,
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': '*'
            }
        });
    }
};

// Export config for Cloudflare Pages
export const config = {
    path: '/api/*'
};
