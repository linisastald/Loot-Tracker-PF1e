import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { APP_EVENTS, notifyLootCountsChanged } from '../events';

describe('events', () => {
  let listener: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listener = vi.fn();
    window.addEventListener(APP_EVENTS.LOOT_COUNTS_CHANGED, listener);
  });

  afterEach(() => {
    window.removeEventListener(APP_EVENTS.LOOT_COUNTS_CHANGED, listener);
  });

  it('notifyLootCountsChanged dispatches a CustomEvent on window', () => {
    notifyLootCountsChanged();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0][0]).toBeInstanceOf(CustomEvent);
    expect(listener.mock.calls[0][0].type).toBe(
      APP_EVENTS.LOOT_COUNTS_CHANGED
    );
  });

  it('multiple notifications fire the listener once each (no debounce)', () => {
    notifyLootCountsChanged();
    notifyLootCountsChanged();
    notifyLootCountsChanged();
    expect(listener).toHaveBeenCalledTimes(3);
  });

  it('removed listeners no longer receive the event', () => {
    window.removeEventListener(APP_EVENTS.LOOT_COUNTS_CHANGED, listener);
    notifyLootCountsChanged();
    expect(listener).not.toHaveBeenCalled();
  });
});
