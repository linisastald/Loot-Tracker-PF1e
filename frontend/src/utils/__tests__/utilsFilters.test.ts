import { describe, it, expect } from 'vitest';
import { applyFilters } from '../utils';

const loot = {
  summary: [{ name: 'Sword' }, { name: 'Potion' }],
  individual: [
    { id: 1, name: 'Sword', type: 'Weapon', size: 'Medium', unidentified: false, status: 'Unprocessed' },
    { id: 2, name: 'Potion', type: 'Potion', size: 'Tiny', unidentified: true, status: 'Pending Sale' },
    { id: 3, name: 'Gem', type: 'Gem', size: 'Tiny', unidentified: null, status: 'Unprocessed' },
  ],
} as any;

const none = { unidentified: '', type: '', size: '', pendingSale: '', whoHas: [] } as any;
const ids = (r: any) => r.individual.map((i: any) => i.id);

describe('applyFilters', () => {
  it('returns empty loot for missing or malformed data', () => {
    expect(applyFilters(null, none)).toEqual({ summary: [], individual: [] });
    expect(applyFilters({ individual: [] } as any, none)).toEqual({ summary: [], individual: [] });
  });

  it('keeps everything with no filters and does not mutate its input', () => {
    const result = applyFilters(loot, none);
    expect(ids(result)).toEqual([1, 2, 3]);
    expect(result.individual).not.toBe(loot.individual);
  });

  it('filters by type and size', () => {
    expect(ids(applyFilters(loot, { ...none, type: 'Weapon' }))).toEqual([1]);
    expect(ids(applyFilters(loot, { ...none, size: 'Tiny' }))).toEqual([2, 3]);
    expect(ids(applyFilters(loot, { ...none, type: 'Gem', size: 'Tiny' }))).toEqual([3]);
  });

  it('filters by unidentified state', () => {
    expect(ids(applyFilters(loot, { ...none, unidentified: 'true' }))).toEqual([2]);
    expect(ids(applyFilters(loot, { ...none, unidentified: 'false' }))).toEqual([1]);
    expect(ids(applyFilters(loot, { ...none, unidentified: 'all' }))).toEqual([1, 2, 3]);
    expect(ids(applyFilters(loot, { ...none, unidentified: 'other' }))).toEqual([3]);
  });

  it('filters by pending sale', () => {
    expect(ids(applyFilters(loot, { ...none, pendingSale: 'true' }))).toEqual([2]);
    expect(ids(applyFilters(loot, { ...none, pendingSale: 'false' }))).toEqual([1, 3]);
  });
});
