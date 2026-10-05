import { describe, it, expect, beforeEach } from 'vitest';
import { isDM } from '../auth';

describe('isDM (cached-user render hint)', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('is true when the cached user has the DM role', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'tester', role: 'DM' }));
    expect(isDM()).toBe(true);
  });

  it('is false for a Player', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'tester', role: 'Player' }));
    expect(isDM()).toBe(false);
  });

  it('is false when nothing is cached', () => {
    expect(isDM()).toBe(false);
  });

  it('is false when the cached JSON is invalid', () => {
    localStorage.setItem('user', '{bad json');
    expect(isDM()).toBe(false);
  });

  it('is false when the cached value is JSON null', () => {
    localStorage.setItem('user', 'null');
    expect(isDM()).toBe(false);
  });

  it('is false when the cached user has no role', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'tester' }));
    expect(isDM()).toBe(false);
  });

  it('does not treat the unused Admin role as DM', () => {
    localStorage.setItem('user', JSON.stringify({ id: 1, username: 'tester', role: 'Admin' }));
    expect(isDM()).toBe(false);
  });
});
