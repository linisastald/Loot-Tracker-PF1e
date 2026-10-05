import { describe, it, expect } from 'vitest';
import { isValidEmail } from '../validation';

describe('isValidEmail', () => {
  it.each(['a@b.co', 'first.last+tag@example.com', 'x_y%z@sub.example.org'])('accepts %s', (value) => {
    expect(isValidEmail(value)).toBe(true);
  });

  it.each(['', 'plain', 'a@b', 'a@b.c', '@example.com', 'a b@example.com', 'a@@example.com'])(
    'rejects %j',
    (value) => {
      expect(isValidEmail(value)).toBe(false);
    }
  );
});
