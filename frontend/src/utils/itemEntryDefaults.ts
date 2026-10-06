// Per-campaign item-entry defaults, read from the campaign settings map
// (values are stored as strings; see DMSettings/SystemSettings).

/**
 * The quantity a new item row in the entry form starts with.
 * When "default quantity" is on it is the campaign's default browser quantity
 * (1 if that is unset or invalid); when off, '' (blank, as before).
 */
export const getDefaultItemQuantity = (
  campaignSettings: Record<string, unknown> | null | undefined
): number | '' => {
  if (campaignSettings?.default_quantity_enabled !== '1') return '';
  const quantity = parseInt(String(campaignSettings.default_browser_quantity), 10);
  return quantity > 0 ? quantity : 1;
};
