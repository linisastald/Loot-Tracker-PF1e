/**
 * Simple in-memory rate limiter for Discord API calls
 * Prevents hitting Discord's rate limits (50 requests/second per bot)
 */

class RateLimiter {
    constructor(maxRequests = 45, windowMs = 1000) {
        this.maxRequests = maxRequests; // Slightly below Discord's limit for safety
        this.windowMs = windowMs;
        this.requests = [];
        this.MAX_TRACKED_REQUESTS = 1000; // Prevent unbounded memory growth
    }

    /**
     * Check if a request can be made, or wait if rate limited
     * @returns {Promise<void>}
     */
    async acquire() {
        const now = Date.now();

        // Limit array size to prevent unbounded memory growth
        if (this.requests.length > this.MAX_TRACKED_REQUESTS) {
            this.requests = this.requests.slice(-this.MAX_TRACKED_REQUESTS);
        }

        // Remove requests outside the current window
        this.requests = this.requests.filter(time => now - time < this.windowMs);

        // If at limit, wait until oldest request expires
        if (this.requests.length >= this.maxRequests) {
            const oldestRequest = this.requests[0];
            const waitTime = this.windowMs - (now - oldestRequest);

            if (waitTime > 0) {
                await new Promise(resolve => setTimeout(resolve, waitTime));
                return this.acquire(); // Recursively try again
            }
        }

        // Record this request
        this.requests.push(now);
    }

    /**
     * Wrap an async function with rate limiting
     * @param {Function} fn - Async function to wrap
     * @returns {Function} - Rate-limited version of the function
     */
    wrap(fn) {
        return async (...args) => {
            await this.acquire();
            return fn(...args);
        };
    }
}

// Create a singleton rate limiter for Discord API
const discordRateLimiter = new RateLimiter(45, 1000); // 45 requests per second

module.exports = {
    RateLimiter,
    discordRateLimiter
};
