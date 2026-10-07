import { describe, it, expect } from 'vitest';
import { getErrorMessage } from '../apiErrors';

const withData = (data: unknown) => ({ response: { data } });

describe('getErrorMessage', () => {
  it('prefers the server message, then error', () => {
    expect(getErrorMessage(withData({ message: 'm', error: 'e' }), 'fb')).toBe('m');
    expect(getErrorMessage(withData({ error: 'e' }), 'fb')).toBe('e');
  });

  it('reads the first express-validator error ({errors:[...]}) when there is no message (L-8)', () => {
    const data = { errors: [{ msg: 'Username must be at least 5 characters long', path: 'username' }, { msg: 'second' }] };
    expect(getErrorMessage(withData(data), 'Registration failed')).toBe('Username must be at least 5 characters long');
  });

  it('also accepts a message field inside the first error', () => {
    expect(getErrorMessage(withData({ errors: [{ message: 'bad' }] }), 'fb')).toBe('bad');
  });

  it('falls back when nothing readable is present', () => {
    expect(getErrorMessage(withData({ errors: [] }), 'fb')).toBe('fb');
    expect(getErrorMessage(withData({ errors: [{}] }), 'fb')).toBe('fb');
    expect(getErrorMessage(new Error('x'), 'fb')).toBe('fb');
    expect(getErrorMessage(null, 'fb')).toBe('fb');
  });
});
