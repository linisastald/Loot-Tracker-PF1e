import { describe, it, expect } from 'vitest';
import { getDefaultItemQuantity } from '../itemEntryDefaults';

describe('getDefaultItemQuantity', () => {
  it('is blank when the setting is off, missing or the settings are not loaded', () => {
    expect(getDefaultItemQuantity({ default_quantity_enabled: '0', default_browser_quantity: '5' })).toBe('');
    expect(getDefaultItemQuantity({ default_browser_quantity: '5' })).toBe('');
    expect(getDefaultItemQuantity({})).toBe('');
    expect(getDefaultItemQuantity(null)).toBe('');
    expect(getDefaultItemQuantity(undefined)).toBe('');
  });

  it('is the configured quantity when on', () => {
    expect(getDefaultItemQuantity({ default_quantity_enabled: '1', default_browser_quantity: '5' })).toBe(5);
    expect(getDefaultItemQuantity({ default_quantity_enabled: '1', default_browser_quantity: 12 })).toBe(12);
  });

  it('falls back to 1 when on but the quantity is unset or invalid', () => {
    expect(getDefaultItemQuantity({ default_quantity_enabled: '1' })).toBe(1);
    expect(getDefaultItemQuantity({ default_quantity_enabled: '1', default_browser_quantity: '' })).toBe(1);
    expect(getDefaultItemQuantity({ default_quantity_enabled: '1', default_browser_quantity: 'many' })).toBe(1);
    expect(getDefaultItemQuantity({ default_quantity_enabled: '1', default_browser_quantity: '0' })).toBe(1);
  });
});
