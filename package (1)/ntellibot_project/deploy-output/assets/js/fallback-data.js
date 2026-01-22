/**
 * !ntellibot Fallback Data
 * 
 * OSINT INTEGRITY POLICY:
 * No fake data - Only real data from verified sources is displayed.
 * When APIs are unavailable, empty states are shown rather than fabricated data.
 * 
 * Real data sources:
 * - Crypto: CoinGecko API (free, open)
 * - Forex: Frankfurter API (free, open)  
 * - News: RSS feeds from verified international sources
 * - Events: GDELT Project (free, open)
 * - Signals: ACLED, GDELT, ReliefWeb (live APIs)
 * - Military Activity: Live news analysis + GDELT event clustering
 */
window.FallbackData = {
    news: [],
    crypto: [],
    forex: [],
    events: [],
    signals: [],  // Live data only - no fallback signals
    predictions: []  // Live data only - no fallback predictions
};
