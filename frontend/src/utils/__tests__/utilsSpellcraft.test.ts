import { describe, it, expect, vi } from 'vitest';
import React from 'react';

vi.mock('../../services/lootService', () => ({ default: {} }));
vi.mock('../api', () => ({ default: {} }));

import { calculateSpellcraftDC, formatItemNameWithMods } from '../utils';

// Catalog rows and mods use `casterlevel`; loot rows carry `modids` (array)
const itemsMap = {
  1: { id: 1, name: 'Longsword', type: 'weapon', casterlevel: 1 },
  2: { id: 2, name: 'Cloak of Resistance', type: 'item', casterlevel: 5 },
  3: { id: 3, name: 'Bow', type: 'weapon' },
  4: { id: 4, name: 'Plate', type: 'armor', casterlevel: 3 },
  5: { id: 5, name: 'Staff of Power', type: 'item', casterlevel: 25 },
};

const modsMap = {
  10: { id: 10, name: 'Flaming', casterlevel: 10 },
  11: { id: 11, name: '+1', casterlevel: 4 },
  12: { id: 12, name: 'Plain', casterlevel: null },
};

describe('calculateSpellcraftDC (F-1585, F-1586)', () => {
  it('is 15 + the catalog item caster level for a non-weapon item', () => {
    expect(calculateSpellcraftDC({ itemid: 2 } as never, itemsMap, modsMap)).toBe(20);
  });

  it('uses the highest mod caster level for weapons and armor with mods (modids)', () => {
    expect(calculateSpellcraftDC({ itemid: 1, modids: [10, 11] } as never, itemsMap, modsMap)).toBe(25);
    expect(calculateSpellcraftDC({ itemid: 4, modids: [11] } as never, itemsMap, modsMap)).toBe(19);
  });

  it('falls back to the item caster level when no mod has one', () => {
    expect(calculateSpellcraftDC({ itemid: 4, modids: [12] } as never, itemsMap, modsMap)).toBe(18);
    expect(calculateSpellcraftDC({ itemid: 4, modids: [] } as never, itemsMap, modsMap)).toBe(18);
  });

  it('ignores mods on items that are not weapons or armor', () => {
    expect(calculateSpellcraftDC({ itemid: 2, modids: [10] } as never, itemsMap, modsMap)).toBe(20);
  });

  it('uses caster level 1 when the catalog item has none', () => {
    expect(calculateSpellcraftDC({ itemid: 3 } as never, itemsMap, modsMap)).toBe(16);
  });

  it('caps the caster level at 20', () => {
    expect(calculateSpellcraftDC({ itemid: 5 } as never, itemsMap, modsMap)).toBe(35);
  });

  it('returns null when the item is not linked to the catalog', () => {
    expect(calculateSpellcraftDC({} as never, itemsMap, modsMap)).toBeNull();
    expect(calculateSpellcraftDC({ itemid: 99 } as never, itemsMap, modsMap)).toBeNull();
  });
});

describe('formatItemNameWithMods (F-1587)', () => {
  it('prefixes the mod names from modids, plus-mods first', () => {
    expect(formatItemNameWithMods({ itemid: 1, modids: [10, 11] } as never, itemsMap, modsMap))
      .toBe('+1 Flaming Longsword');
  });

  it('returns the catalog name when there are no mods', () => {
    expect(formatItemNameWithMods({ itemid: 2 } as never, itemsMap, modsMap)).toBe('Cloak of Resistance');
    expect(formatItemNameWithMods({ itemid: 2, modids: [] } as never, itemsMap, modsMap)).toBe('Cloak of Resistance');
  });

  it('skips mod ids that are not in the map', () => {
    expect(formatItemNameWithMods({ itemid: 1, modids: [99, 10] } as never, itemsMap, modsMap))
      .toBe('Flaming Longsword');
  });

  it('shows a red "Not linked" marker for unlinked items', () => {
    const unlinked = formatItemNameWithMods({} as never, itemsMap, modsMap) as React.ReactElement;
    expect(unlinked.props.children).toBe('Not linked');
    const missing = formatItemNameWithMods({ itemid: 99 } as never, itemsMap, modsMap) as React.ReactElement;
    expect(missing.props.children).toBe('Not linked (ID: 99)');
  });
});
