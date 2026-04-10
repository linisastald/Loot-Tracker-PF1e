import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getUserRole,
  isDM,
  isPlayer,
  isAdmin,
  getStoredUser,
  setStoredUser,
  clearStoredUser,
  hasPermission,
  type StoredUser,
} from '../auth';

describe('auth utilities', () => {
  // Save original localStorage and console.error
  const originalConsoleError = console.error;

  beforeEach(() => {
    localStorage.clear();
    console.error = vi.fn();
  });

  afterEach(() => {
    console.error = originalConsoleError;
  });

  // --------------- getUserRole ---------------
  describe('getUserRole', () => {
    it('returns the role from a valid stored user', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'tester', role: 'DM' }));
      expect(getUserRole()).toBe('DM');
    });

    it('returns null when no user is stored', () => {
      expect(getUserRole()).toBeNull();
    });

    it('returns null when stored JSON is invalid', () => {
      localStorage.setItem('user', '{bad json');
      expect(getUserRole()).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });

    it('returns null when user object has no role property', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'tester' }));
      expect(getUserRole()).toBeNull();
    });

    it('returns null when role is an empty string (falsy)', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'tester', role: '' }));
      expect(getUserRole()).toBeNull();
    });
  });

  // --------------- isDM ---------------
  describe('isDM', () => {
    it('returns true when user role is DM', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'dm', role: 'DM' }));
      expect(isDM()).toBe(true);
    });

    it('returns false when user role is Player', () => {
      localStorage.setItem('user', JSON.stringify({ id: 2, username: 'player', role: 'Player' }));
      expect(isDM()).toBe(false);
    });

    it('returns false when user role is Admin', () => {
      localStorage.setItem('user', JSON.stringify({ id: 3, username: 'admin', role: 'Admin' }));
      expect(isDM()).toBe(false);
    });

    it('returns false when no user is stored', () => {
      expect(isDM()).toBe(false);
    });
  });

  // --------------- isPlayer ---------------
  describe('isPlayer', () => {
    it('returns true when user role is Player', () => {
      localStorage.setItem('user', JSON.stringify({ id: 2, username: 'player', role: 'Player' }));
      expect(isPlayer()).toBe(true);
    });

    it('returns false when user role is DM', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'dm', role: 'DM' }));
      expect(isPlayer()).toBe(false);
    });

    it('returns false when no user is stored', () => {
      expect(isPlayer()).toBe(false);
    });
  });

  // --------------- isAdmin ---------------
  describe('isAdmin', () => {
    it('returns true when user role is Admin', () => {
      localStorage.setItem('user', JSON.stringify({ id: 3, username: 'admin', role: 'Admin' }));
      expect(isAdmin()).toBe(true);
    });

    it('returns false when user role is DM', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'dm', role: 'DM' }));
      expect(isAdmin()).toBe(false);
    });

    it('returns false when no user is stored', () => {
      expect(isAdmin()).toBe(false);
    });
  });

  // --------------- getStoredUser ---------------
  describe('getStoredUser', () => {
    it('returns the parsed user object when valid', () => {
      const user: StoredUser = { id: 5, username: 'hero', role: 'Player', activeCharacterId: 42 };
      localStorage.setItem('user', JSON.stringify(user));

      const result = getStoredUser();
      expect(result).toEqual(user);
    });

    it('returns null when no user is stored', () => {
      expect(getStoredUser()).toBeNull();
    });

    it('returns null and logs error when JSON is invalid', () => {
      localStorage.setItem('user', 'not-json');
      expect(getStoredUser()).toBeNull();
      expect(console.error).toHaveBeenCalled();
    });

    it('preserves optional fields like email and activeCharacterId', () => {
      const user: StoredUser = { id: 1, username: 'full', role: 'Admin', activeCharacterId: 7, email: 'a@b.com' };
      localStorage.setItem('user', JSON.stringify(user));

      const result = getStoredUser();
      expect(result?.email).toBe('a@b.com');
      expect(result?.activeCharacterId).toBe(7);
    });
  });

  // --------------- setStoredUser ---------------
  describe('setStoredUser', () => {
    it('stores the user as JSON in localStorage', () => {
      const user: StoredUser = { id: 10, username: 'store-me', role: 'DM' };
      setStoredUser(user);

      const stored = localStorage.getItem('user');
      expect(stored).not.toBeNull();
      expect(JSON.parse(stored!)).toEqual(user);
    });

    it('overwrites a previously stored user', () => {
      const user1: StoredUser = { id: 1, username: 'first', role: 'Player' };
      const user2: StoredUser = { id: 2, username: 'second', role: 'DM' };

      setStoredUser(user1);
      setStoredUser(user2);

      const result = getStoredUser();
      expect(result).toEqual(user2);
    });
  });

  // --------------- clearStoredUser ---------------
  describe('clearStoredUser', () => {
    it('removes the user from localStorage', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'bye', role: 'Player' }));
      clearStoredUser();
      expect(localStorage.getItem('user')).toBeNull();
    });

    it('does not throw when no user is stored', () => {
      expect(() => clearStoredUser()).not.toThrow();
    });
  });

  // --------------- hasPermission ---------------
  describe('hasPermission', () => {
    it('Admin has permission for all roles', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'admin', role: 'Admin' }));
      expect(hasPermission('Player')).toBe(true);
      expect(hasPermission('DM')).toBe(true);
      expect(hasPermission('Admin')).toBe(true);
    });

    it('DM has permission for Player and DM, but not Admin', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'dm', role: 'DM' }));
      expect(hasPermission('Player')).toBe(true);
      expect(hasPermission('DM')).toBe(true);
      expect(hasPermission('Admin')).toBe(false);
    });

    it('Player only has permission for Player role', () => {
      localStorage.setItem('user', JSON.stringify({ id: 1, username: 'player', role: 'Player' }));
      expect(hasPermission('Player')).toBe(true);
      expect(hasPermission('DM')).toBe(false);
      expect(hasPermission('Admin')).toBe(false);
    });

    it('returns false when no user is stored', () => {
      expect(hasPermission('Player')).toBe(false);
    });

    it('returns false when user data is corrupted', () => {
      localStorage.setItem('user', 'garbage');
      expect(hasPermission('Player')).toBe(false);
    });
  });
});
