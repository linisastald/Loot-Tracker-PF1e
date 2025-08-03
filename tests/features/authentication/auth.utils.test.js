/**
 * Tests for auth.js frontend utility - Token handling and user role management
 * Tests localStorage interaction and user authentication state management
 */

import { getUserRole, isDM } from '../../../frontend/src/utils/auth';

// Mock localStorage
const localStorageMock = (() => {
  let store = {};

  return {
    getItem: jest.fn((key) => store[key] || null),
    setItem: jest.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: jest.fn((key) => {
      delete store[key];
    }),
    clear: jest.fn(() => {
      store = {};
    })
  };
})();

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock
});

// Mock console.error to avoid noise in tests
const originalConsoleError = console.error;
beforeAll(() => {
  console.error = jest.fn();
});

afterAll(() => {
  console.error = originalConsoleError;
});

describe('Auth Utils', () => {
  beforeEach(() => {
    localStorageMock.clear();
    jest.clearAllMocks();
  });

  describe('getUserRole', () => {
    it('should return user role from localStorage', () => {
      const userData = {
        id: 1,
        username: 'testuser',
        role: 'Player',
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(userData));

      const role = getUserRole();

      expect(localStorageMock.getItem).toHaveBeenCalledWith('user');
      expect(role).toBe('Player');
    });

    it('should return DM role for DM users', () => {
      const dmUserData = {
        id: 1,
        username: 'dmuser',
        role: 'DM',
        email: 'dm@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(dmUserData));

      const role = getUserRole();

      expect(role).toBe('DM');
    });

    it('should return null when no user data in localStorage', () => {
      const role = getUserRole();

      expect(localStorageMock.getItem).toHaveBeenCalledWith('user');
      expect(role).toBeNull();
    });

    it('should handle invalid JSON in localStorage', () => {
      localStorageMock.setItem('user', 'invalid-json');

      const role = getUserRole();

      expect(console.error).toHaveBeenCalledWith('Invalid user data:', expect.any(SyntaxError));
      expect(role).toBeNull();
    });

    it('should handle empty string in localStorage', () => {
      localStorageMock.setItem('user', '');

      const role = getUserRole();

      expect(role).toBeNull();
    });

    it('should handle user data without role property', () => {
      const userDataWithoutRole = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com'
        // role property missing
      };
      
      localStorageMock.setItem('user', JSON.stringify(userDataWithoutRole));

      const role = getUserRole();

      expect(role).toBeUndefined();
    });

    it('should handle null user data in localStorage', () => {
      localStorageMock.setItem('user', 'null');

      const role = getUserRole();

      expect(role).toBeNull();
    });

    it('should handle user data with null role', () => {
      const userDataWithNullRole = {
        id: 1,
        username: 'testuser',
        role: null,
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(userDataWithNullRole));

      const role = getUserRole();

      expect(role).toBeNull();
    });

    it('should handle user data with empty role', () => {
      const userDataWithEmptyRole = {
        id: 1,
        username: 'testuser',
        role: '',
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(userDataWithEmptyRole));

      const role = getUserRole();

      expect(role).toBe('');
    });

    it('should handle malformed JSON with missing quotes', () => {
      localStorageMock.setItem('user', '{username: testuser, role: Player}');

      const role = getUserRole();

      expect(console.error).toHaveBeenCalledWith('Invalid user data:', expect.any(SyntaxError));
      expect(role).toBeNull();
    });

    it('should handle JSON with unexpected data types', () => {
      const unexpectedData = {
        id: 1,
        username: 'testuser',
        role: 12345, // Number instead of string
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(unexpectedData));

      const role = getUserRole();

      expect(role).toBe(12345);
    });

    it('should handle deeply nested user object', () => {
      const complexUserData = {
        user: {
          profile: {
            role: 'Player'
          }
        }
      };
      
      localStorageMock.setItem('user', JSON.stringify(complexUserData));

      const role = getUserRole();

      // Should return undefined since role is not at top level
      expect(role).toBeUndefined();
    });

    it('should handle user data as array', () => {
      const arrayUserData = [
        { role: 'Player' },
        { role: 'DM' }
      ];
      
      localStorageMock.setItem('user', JSON.stringify(arrayUserData));

      const role = getUserRole();

      // Array doesn't have role property at top level
      expect(role).toBeUndefined();
    });

    it('should handle very large user data objects', () => {
      const largeUserData = {
        id: 1,
        username: 'testuser',
        role: 'Player',
        email: 'test@example.com',
        metadata: {
          largeData: 'x'.repeat(10000)
        }
      };
      
      localStorageMock.setItem('user', JSON.stringify(largeUserData));

      const role = getUserRole();

      expect(role).toBe('Player');
    });
  });

  describe('isDM', () => {
    it('should return true for DM users', () => {
      const dmUserData = {
        id: 1,
        username: 'dmuser',
        role: 'DM',
        email: 'dm@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(dmUserData));

      const result = isDM();

      expect(result).toBe(true);
    });

    it('should return false for Player users', () => {
      const playerUserData = {
        id: 1,
        username: 'player',
        role: 'Player',
        email: 'player@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(playerUserData));

      const result = isDM();

      expect(result).toBe(false);
    });

    it('should return false when no user data exists', () => {
      const result = isDM();

      expect(result).toBe(false);
    });

    it('should return false for invalid user data', () => {
      localStorageMock.setItem('user', 'invalid-json');

      const result = isDM();

      expect(result).toBe(false);
    });

    it('should return false for user without role', () => {
      const userDataWithoutRole = {
        id: 1,
        username: 'testuser',
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(userDataWithoutRole));

      const result = isDM();

      expect(result).toBe(false);
    });

    it('should return false for user with null role', () => {
      const userDataWithNullRole = {
        id: 1,
        username: 'testuser',
        role: null,
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(userDataWithNullRole));

      const result = isDM();

      expect(result).toBe(false);
    });

    it('should return false for user with empty role', () => {
      const userDataWithEmptyRole = {
        id: 1,
        username: 'testuser',
        role: '',
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(userDataWithEmptyRole));

      const result = isDM();

      expect(result).toBe(false);
    });

    it('should handle case sensitivity of DM role', () => {
      const userDataWithLowerCaseDM = {
        id: 1,
        username: 'testuser',
        role: 'dm', // lowercase
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(userDataWithLowerCaseDM));

      const result = isDM();

      expect(result).toBe(false); // Should be false since 'dm' !== 'DM'
    });

    it('should handle role with extra whitespace', () => {
      const userDataWithWhitespace = {
        id: 1,
        username: 'testuser',
        role: ' DM ',
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(userDataWithWhitespace));

      const result = isDM();

      expect(result).toBe(false); // Should be false since ' DM ' !== 'DM'
    });

    it('should return false for unknown roles', () => {
      const userDataWithUnknownRole = {
        id: 1,
        username: 'testuser',
        role: 'Admin',
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(userDataWithUnknownRole));

      const result = isDM();

      expect(result).toBe(false);
    });

    it('should return false for numeric role values', () => {
      const userDataWithNumericRole = {
        id: 1,
        username: 'testuser',
        role: 1, // DM represented as number
        email: 'test@example.com'
      };
      
      localStorageMock.setItem('user', JSON.stringify(userDataWithNumericRole));

      const result = isDM();

      expect(result).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('should handle localStorage access errors', () => {
      // Mock localStorage.getItem to throw an error
      localStorageMock.getItem.mockImplementation(() => {
        throw new Error('localStorage access denied');
      });

      const role = getUserRole();

      expect(role).toBeNull();
    });

    it('should handle JSON.parse throwing non-SyntaxError', () => {
      // This is a bit tricky to test since JSON.parse typically only throws SyntaxError
      // But we can test the error handling path by mocking JSON.parse
      const originalJSONParse = JSON.parse;
      JSON.parse = jest.fn(() => {
        throw new Error('Unexpected error');
      });

      localStorageMock.setItem('user', '{"role": "Player"}');

      const role = getUserRole();

      expect(console.error).toHaveBeenCalledWith('Invalid user data:', expect.any(Error));
      expect(role).toBeNull();

      // Restore original JSON.parse
      JSON.parse = originalJSONParse;
    });

    it('should handle multiple calls with different data', () => {
      // First call - Player
      const playerData = { role: 'Player' };
      localStorageMock.setItem('user', JSON.stringify(playerData));
      expect(getUserRole()).toBe('Player');
      expect(isDM()).toBe(false);

      // Second call - DM
      const dmData = { role: 'DM' };
      localStorageMock.setItem('user', JSON.stringify(dmData));
      expect(getUserRole()).toBe('DM');
      expect(isDM()).toBe(true);

      // Third call - No data
      localStorageMock.removeItem('user');
      expect(getUserRole()).toBeNull();
      expect(isDM()).toBe(false);
    });

    it('should handle localStorage quota exceeded', () => {
      // Mock localStorage to simulate quota exceeded
      localStorageMock.getItem.mockImplementation(() => {
        const error = new Error('QuotaExceededError');
        error.name = 'QuotaExceededError';
        throw error;
      });

      const role = getUserRole();

      expect(role).toBeNull();
    });

    it('should handle concurrent access patterns', () => {
      const userData = { role: 'DM' };
      localStorageMock.setItem('user', JSON.stringify(userData));

      // Simulate multiple concurrent calls
      const results = Promise.all([
        Promise.resolve(getUserRole()),
        Promise.resolve(getUserRole()),
        Promise.resolve(isDM()),
        Promise.resolve(isDM())
      ]);

      return results.then(([role1, role2, isDM1, isDM2]) => {
        expect(role1).toBe('DM');
        expect(role2).toBe('DM');
        expect(isDM1).toBe(true);
        expect(isDM2).toBe(true);
      });
    });
  });

  describe('Security Considerations', () => {
    it('should not be affected by localStorage prototype pollution', () => {
      // Test that the functions don't use prototype methods unsafely
      localStorage.__proto__.getItem = () => '{"role": "Admin"}';

      const userData = { role: 'Player' };
      localStorageMock.setItem('user', JSON.stringify(userData));

      const role = getUserRole();

      // Should use the actual localStorage.getItem, not the polluted prototype
      expect(role).toBe('Player');

      // Clean up
      delete localStorage.__proto__.getItem;
    });

    it('should handle malicious JSON payloads safely', () => {
      const maliciousPayloads = [
        '{"role": "DM", "__proto__": {"isAdmin": true}}',
        '{"role": "Player", "constructor": {"prototype": {"admin": true}}}',
        '{"role": "DM"}\n<script>alert("xss")</script>',
        '{"role": "Player\\u0000DM"}', // null byte injection
        '{"role": "DM", "eval": "console.log(\\"hacked\\")"}',
      ];

      maliciousPayloads.forEach(payload => {
        localStorageMock.setItem('user', payload);
        
        const role = getUserRole();
        const dmStatus = isDM();

        // Should parse safely without executing malicious code
        expect(typeof role).toBe('string');
        expect(typeof dmStatus).toBe('boolean');
      });
    });

    it('should not expose sensitive data through error messages', () => {
      localStorageMock.setItem('user', '{"role": "DM", "password": "secret123"}');

      const role = getUserRole();

      // Verify sensitive data isn't leaked in console.error calls
      const errorCalls = console.error.mock.calls;
      errorCalls.forEach(call => {
        const errorMessage = call.join(' ');
        expect(errorMessage).not.toContain('secret123');
      });

      expect(role).toBe('DM');
    });

    it('should handle extremely large JSON objects gracefully', () => {
      const largeObject = {
        role: 'Player',
        metadata: {}
      };

      // Create a large object that might cause memory issues
      for (let i = 0; i < 1000; i++) {
        largeObject.metadata[`key_${i}`] = 'value'.repeat(100);
      }

      localStorageMock.setItem('user', JSON.stringify(largeObject));

      const role = getUserRole();

      expect(role).toBe('Player');
    });
  });
});