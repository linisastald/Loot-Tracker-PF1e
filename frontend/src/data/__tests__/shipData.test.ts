import { describe, it, expect } from 'vitest';
import * as shipData from '../shipData';

describe('shipData', () => {
  it('exposes only the named exports', () => {
    expect(Object.keys(shipData).sort()).toEqual(['SHIP_IMPROVEMENTS', 'SHIP_WEAPON_TYPES']);
  });

  it('gives every improvement a name equal to its key, defined once', () => {
    const entries = Object.entries(shipData.SHIP_IMPROVEMENTS as Record<string, { name: string; description: string; effects: object }>);
    expect(entries.length).toBeGreaterThan(10);
    entries.forEach(([key, improvement]) => {
      expect(improvement.name).toBe(key);
      expect(typeof improvement.description).toBe('string');
      expect(typeof improvement.effects).toBe('object');
    });
  });
});
