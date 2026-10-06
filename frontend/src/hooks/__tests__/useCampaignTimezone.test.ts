import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';

vi.mock('../../utils/timezoneUtils', () => ({
  fetchCampaignTimezone: vi.fn(),
}));

import { fetchCampaignTimezone } from '../../utils/timezoneUtils';
import { useCampaignTimezone } from '../useCampaignTimezone';

describe('useCampaignTimezone', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts loading with the browser timezone, then provides the campaign timezone', async () => {
    (fetchCampaignTimezone as any).mockResolvedValue('Pacific/Auckland');

    const { result } = renderHook(() => useCampaignTimezone());

    expect(result.current.loading).toBe(true);
    expect(typeof result.current.timezone).toBe('string');
    expect(result.current.timezone.length).toBeGreaterThan(0);

    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.timezone).toBe('Pacific/Auckland');
  });

  it('does not update state after unmount', async () => {
    let resolve: (tz: string) => void = () => {};
    (fetchCampaignTimezone as any).mockReturnValue(new Promise<string>((r) => { resolve = r; }));
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const { unmount } = renderHook(() => useCampaignTimezone());
    unmount();
    resolve('Europe/Paris');
    await Promise.resolve();

    expect(errorSpy).not.toHaveBeenCalled();
    errorSpy.mockRestore();
  });

  it('fetches once on mount', async () => {
    (fetchCampaignTimezone as any).mockResolvedValue('UTC');

    const { result } = renderHook(() => useCampaignTimezone());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(fetchCampaignTimezone).toHaveBeenCalledTimes(1);
  });
});
