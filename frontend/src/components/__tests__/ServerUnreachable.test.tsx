import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import ServerUnreachable, { RETRY_DELAYS_MS, retryDelayFor } from '../ServerUnreachable';

describe('retryDelayFor', () => {
  it('backs off 2s, 5s, 10s and then every 15s', () => {
    expect(RETRY_DELAYS_MS).toEqual([2000, 5000, 10000, 15000]);
    expect([1, 2, 3, 4, 5, 20].map(retryDelayFor)).toEqual([2000, 5000, 10000, 15000, 15000, 15000]);
  });

  it('treats a count below 1 as the first failure', () => {
    expect(retryDelayFor(0)).toBe(2000);
  });
});

describe('ServerUnreachable', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it('explains the problem and offers a retry button', () => {
    render(<ServerUnreachable failedChecks={1} onRetry={vi.fn().mockResolvedValue(undefined)} />);
    expect(screen.getByRole('heading', { name: "Can't reach the server" })).toBeInTheDocument();
    expect(screen.getByText(/not been signed out/)).toBeInTheDocument();
    expect(screen.getByText(/in about 2 seconds/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Try again now' })).toBeEnabled();
  });

  it('retries once the delay for the failure count has passed, not before', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    render(<ServerUnreachable failedChecks={2} onRetry={onRetry} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
    expect(onRetry).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('"Try again now" retries immediately and is disabled while the check runs', async () => {
    let finish: () => void = () => {};
    const onRetry = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    render(<ServerUnreachable failedChecks={1} onRetry={onRetry} />);
    fireEvent.click(screen.getByRole('button', { name: 'Try again now' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('button', { name: 'Try again now' })).toBeDisabled();
    // the automatic timer does not start a second check while one is running
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(onRetry).toHaveBeenCalledTimes(1);
    await act(async () => { finish(); });
    expect(screen.getByRole('button', { name: 'Try again now' })).toBeEnabled();
  });

  it('schedules the next, longer wait when the failure count goes up', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(<ServerUnreachable failedChecks={1} onRetry={onRetry} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(2000); });
    expect(onRetry).toHaveBeenCalledTimes(1);
    rerender(<ServerUnreachable failedChecks={2} onRetry={onRetry} />);
    await act(async () => { await vi.advanceTimersByTimeAsync(4999); });
    expect(onRetry).toHaveBeenCalledTimes(1);
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    expect(onRetry).toHaveBeenCalledTimes(2);
  });

  it('clears its timer on unmount', async () => {
    const onRetry = vi.fn().mockResolvedValue(undefined);
    const { unmount } = render(<ServerUnreachable failedChecks={1} onRetry={onRetry} />);
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(60000);
    expect(onRetry).not.toHaveBeenCalled();
  });
});
