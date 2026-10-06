const { RateLimiter, discordRateLimiter } = require('../rateLimiter');

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

    describe('with fake timers', () => {
      beforeEach(() => jest.useFakeTimers());
      afterEach(() => jest.useRealTimers());

      it('should clean up expired requests', async () => {
        const limiter = new RateLimiter(10, 50); // 50ms window

        await limiter.acquire();
        await limiter.acquire();

        jest.advanceTimersByTime(60);
        await limiter.acquire();

        // Old requests should be cleaned up
        expect(limiter.requests.length).toBe(1);
      });

      it('holds the request over the limit until the window has passed', async () => {
        const limiter = new RateLimiter(2, 1000);
        await limiter.acquire();
        await limiter.acquire();

        let resolved = false;
        const third = limiter.acquire().then(() => { resolved = true; });

        await jest.advanceTimersByTimeAsync(999);
        expect(resolved).toBe(false);

        await jest.advanceTimersByTimeAsync(1);
        await third;
        expect(resolved).toBe(true);
        // the two expired entries were dropped, only the new one remains
        expect(limiter.requests.length).toBe(1);
      });

      it('releases queued requests in waves, never more than maxRequests per window', async () => {
        const limiter = new RateLimiter(2, 1000);
        const grantedAt = [];
        const start = Date.now();
        const all = Array.from({ length: 5 }, () =>
          limiter.acquire().then(() => grantedAt.push(Date.now() - start)));

        await jest.advanceTimersByTimeAsync(5000);
        await Promise.all(all);

        expect(grantedAt).toHaveLength(5);
        for (const t of grantedAt) {
          const inWindow = grantedAt.filter(o => o >= t && o < t + 1000).length;
          expect(inWindow).toBeLessThanOrEqual(2);
        }
        expect(Math.max(...grantedAt)).toBeGreaterThanOrEqual(2000);
      });
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

  describe('exports', () => {
    it('exports the shared Discord limiter and no longer offers wrap()', () => {
      expect(discordRateLimiter).toBeInstanceOf(RateLimiter);
      expect(discordRateLimiter.maxRequests).toBe(45);
      expect(RateLimiter.prototype.wrap).toBeUndefined();
    });
  });
});
