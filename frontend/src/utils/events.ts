/**
 * Lightweight pub/sub for cross-component refresh signals — typically used
 * when a page mutates server state that another always-mounted component
 * (like the Sidebar) caches and displays.
 *
 * Implemented on top of `window.dispatchEvent` so subscribers can attach
 * with the standard `addEventListener` API and there's no global state.
 */

export const APP_EVENTS = {
  /**
   * Fired when an action somewhere in the app may have changed the counts
   * the Sidebar shows (unprocessed loot, unidentified loot). The Sidebar
   * listens and refetches its badge counts.
   */
  LOOT_COUNTS_CHANGED: 'app:loot-counts-changed',
} as const;

export type AppEventName = (typeof APP_EVENTS)[keyof typeof APP_EVENTS];

/**
 * Notify listeners that loot counts may be stale and should be refetched.
 * Safe to call from any handler that mutates loot status / identification.
 */
export function notifyLootCountsChanged(): void {
  window.dispatchEvent(new CustomEvent(APP_EVENTS.LOOT_COUNTS_CHANGED));
}
