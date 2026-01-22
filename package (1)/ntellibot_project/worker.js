/**
 * !ntellibot OSINT Dashboard - Cloudflare Worker
 * All data is fetched live from public APIs - no static/synthetic data
 */

import cryptoHandler from './functions/api/crypto.js';
import forexHandler from './functions/api/forex.js';
import eventsHandler from './functions/api/events.js';
import signalsHandler from './functions/api/signals.js';
import predictionsHandler from './functions/api/predictions.js';
import newsTier1Handler from './functions/api/news-tier1.js';
import newsTier2Handler from './functions/api/news-tier2.js';

// Static file cache
const STATIC_FILES = {
  '/index.html': null, // Will be loaded on demand
};

async function loadStaticFile(path) {
  // In a real deployment, you'd use KV storage for assets
  // For now, we'll return a redirect to the static site
  return null;
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const path = url.pathname;

    // API Route handling
    if (path === '/api/crypto') {
      return cryptoHandler.default(request, env, ctx);
    }
    if (path === '/api/forex') {
      return forexHandler.default(request, env, ctx);
    }
    if (path === '/api/events') {
      return eventsHandler.default(request, env, ctx);
    }
    if (path === '/api/signals') {
      return signalsHandler.default(request, env, ctx);
    }
    if (path === '/api/predictions') {
      return predictionsHandler.default(request, env, ctx);
    }
    if (path === '/api/news-tier1') {
      return newsTier1Handler.default(request, env, ctx);
    }
    if (path === '/api/news-tier2') {
      return newsTier2Handler.default(request, env, ctx);
    }

    // Return 404 for unknown API routes
    if (path.startsWith('/api/')) {
      return new Response(JSON.stringify({ error: 'Not found' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Return a message indicating this is the API server
    return new Response(JSON.stringify({
      message: '!ntellibot OSINT Dashboard API Server',
      endpoints: [
        '/api/crypto',
        '/api/forex',
        '/api/events',
        '/api/signals',
        '/api/predictions',
        '/api/news-tier1',
        '/api/news-tier2'
      ]
    }), {
      headers: { 'Content-Type': 'application/json' }
    });
  }
};
