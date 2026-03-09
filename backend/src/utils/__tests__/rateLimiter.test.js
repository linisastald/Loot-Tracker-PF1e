const { RateLimiter } = require('../rateLimiter');

describe('RateLimiter', () => {
  describe('constructor', () => {
    it('should use default values', () => {
      const limiter = new RateLimiter();
      expect(limiter.maxRequests).toBe(45);
      expect(limiter.windowMs).toBe(1000);
    });

    it('should accept custom values', () => {
      const limiter = new RateLimiter(10, 5000);
      expect(limiter.maxRequests).toBe(10);
      expect(limiter.windowMs).toBe(5000);
    });
  });

  describe('acquire', () => {
    it('should allow requests under the limit', async () => {
      const limiter = new RateLimiter(5, 1000);

      // Should not throw or hang
      await limiter.acquire();
      await limiter.acquire();
      await limiter.acquire();

      expect(limiter.requests.length).toBe(3);
    });

    it('should track request timestamps', async () => {
      const limiter = new RateLimiter(10, 1000);

      await limiter.acquire();

      expect(limiter.requests.length).toBe(1);
      expect(typeof limiter.requests[0]).toBe('number');
    });

    it('should clean up expired requests', async () => {
      const limiter = new RateLimiter(10, 50); // 50ms window

      await limiter.acquire();
      await limiter.acquire();

      // Wait for window to expire
      await new Promise(resolve => setTimeout(resolve, 60));

      await limiter.acquire();

      // Old requests should be cleaned up
      expect(limiter.requests.length).toBe(1);
    });
  });

  describe('wrap', () => {
    it('should create rate-limited version of function', async () => {
      const limiter = new RateLimiter(10, 1000);
      const fn = jest.fn().mockResolvedValue('result');
      const wrapped = limiter.wrap(fn);

      const result = await wrapped('arg1', 'arg2');

      expect(fn).toHaveBeenCalledWith('arg1', 'arg2');
      expect(result).toBe('result');
    });

    it('should pass through errors', async () => {
      const limiter = new RateLimiter(10, 1000);
      const fn = jest.fn().mockRejectedValue(new Error('API Error'));
      const wrapped = limiter.wrap(fn);

      await expect(wrapped()).rejects.toThrow('API Error');
    });
  });

  describe('memory safety', () => {
    it('should limit tracked requests array size', async () => {
      const limiter = new RateLimiter(2000, 60000); // High limit, long window
      limiter.MAX_TRACKED_REQUESTS = 100;

      // Simulate many requests by directly pushing timestamps
      for (let i = 0; i < 200; i++) {
        limiter.requests.push(Date.now());
      }

      // Next acquire should trim the array
      await limiter.acquire();

      expect(limiter.requests.length).toBeLessThanOrEqual(limiter.MAX_TRACKED_REQUESTS + 1);
    });
  });
});
