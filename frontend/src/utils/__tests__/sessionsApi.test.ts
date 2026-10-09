import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({ default: { get: vi.fn() } }));

import api from '../api';
import { fetchSessionList, unwrapSessionList } from '../sessionsApi';
import { getErrorMessage } from '../apiErrors';

describe('unwrapSessionList', () => {
  it('reads rows from the { success, data } body', () => {
    expect(unwrapSessionList({ success: true, data: [{ id: 1 }] })).toEqual([{ id: 1 }]);
  });

  it('accepts a bare array and returns [] for anything else', () => {
    expect(unwrapSessionList([{ id: 2 }])).toEqual([{ id: 2 }]);
    expect(unwrapSessionList({ data: null })).toEqual([]);
    expect(unwrapSessionList(undefined)).toEqual([]);
  });
});

describe('fetchSessionList', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it('rejects when /sessions/enhanced fails and no fallback was asked for', async () => {
    (api.get as any).mockRejectedValue(new Error('down'));
    await expect(fetchSessionList()).rejects.toThrow('down');
    expect(api.get).toHaveBeenCalledTimes(1);
  });

  it('falls back to /sessions only when asked to', async () => {
    (api.get as any).mockImplementation((url: string) =>
      url === '/sessions/enhanced' ? Promise.reject(new Error('down')) : Promise.resolve({ data: [{ id: 3 }] })
    );
    await expect(fetchSessionList({ fallbackToUpcoming: true })).resolves.toEqual([{ id: 3 }]);
    expect(api.get).toHaveBeenCalledWith('/sessions');
  });
});

describe('getErrorMessage', () => {
  it('prefers the server message, then error, then the fallback', () => {
    expect(getErrorMessage({ response: { data: { message: 'm', error: 'e' } } }, 'f')).toBe('m');
    expect(getErrorMessage({ response: { data: { error: 'e' } } }, 'f')).toBe('e');
    expect(getErrorMessage(new Error('x'), 'f')).toBe('f');
    expect(getErrorMessage(null, 'f')).toBe('f');
  });
});
