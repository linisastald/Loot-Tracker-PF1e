import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn().mockResolvedValue({ data: {} }),
  },
}));

vi.mock('../../services/lootService', () => ({
  default: {
    parseItem: vi.fn(),
    createLoot: vi.fn(),
    suggestItems: vi.fn(),
  },
}));

import api from '../api';
import lootService from '../../services/lootService';
import {
  prepareEntryForSubmission,
  validateLootEntries,
  fetchItemNames,
  fetchInitialData,
} from '../lootEntryUtils';

const goldEntry = (overrides = {}) => ({
  type: 'gold',
  data: {
    sessionDate: '2025-01-15',
    transactionType: 'Withdrawal',
    platinum: '',
    gold: '10',
    silver: '',
    copper: '',
    notes: 'test',
    characterId: '',
    ...overrides,
  },
});

describe('prepareEntryForSubmission (gold attribution)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('sends the DM-selected character_id as an integer', async () => {
    await prepareEntryForSubmission(goldEntry({ characterId: '42' }));

    expect(api.post).toHaveBeenCalledWith('/gold', {
      goldEntries: [expect.objectContaining({ character_id: 42 })],
    });
    // The frontend-only characterId field must not be forwarded
    const sent = api.post.mock.calls[0][1].goldEntries[0];
    expect(sent.characterId).toBeUndefined();
  });

  it('sends null character_id when none is selected (unattributed)', async () => {
    await prepareEntryForSubmission(goldEntry({ characterId: '' }));

    const sent = api.post.mock.calls[0][1].goldEntries[0];
    expect(sent.character_id).toBeNull();
  });

  it('leaves "None" unattributed; the server forces the active character for players on its own', async () => {
    // There is no fallback to the user's own character on the client.
    await prepareEntryForSubmission(goldEntry({ characterId: '' }));

    const sent = api.post.mock.calls[0][1].goldEntries[0];
    expect(sent.character_id).toBeNull();
  });

  it('sends amounts as non-negative numbers and zero or blank as null', async () => {
    await prepareEntryForSubmission(goldEntry({ platinum: '-3', gold: '10.5', silver: '0', copper: '' }));

    const sent = api.post.mock.calls[0][1].goldEntries[0];
    expect(sent.platinum).toBe(3);
    expect(sent.gold).toBe(10.5);
    expect(sent.silver).toBeNull();
    expect(sent.copper).toBeNull();
  });
});

const itemEntry = (overrides = {}) => ({
  type: 'item',
  data: { name: 'Longsword', quantity: '2', ...overrides },
});

describe('prepareEntryForSubmission (items)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    lootService.createLoot.mockResolvedValue({ data: { id: 1 } });
  });

  it('maps the form data to the create-loot payload', async () => {
    await prepareEntryForSubmission(itemEntry({
      itemId: 7,
      modids: [1, 2],
      value: '150.5',
      type: 'Weapon',
      size: 'Medium',
      masterwork: true,
      charges: 3,
      notes: 'found',
      cursed: true,
      sessionDate: '2025-01-15',
    }));

    expect(lootService.createLoot).toHaveBeenCalledWith({
      name: 'Longsword',
      quantity: 2,
      notes: 'found',
      cursed: true,
      unidentified: false,
      itemId: 7,
      modIds: [1, 2],
      customValue: 150.5,
      type: 'weapon',
      size: 'Medium',
      masterwork: true,
      charges: null, // a charges value left on a row that is not a wand is not saved
      session_date: '2025-01-15',
    });
  });

  it('saves charges for a wand', async () => {
    await prepareEntryForSubmission(itemEntry({ name: 'Wand of Fireball', charges: 30 }));

    expect(lootService.createLoot).toHaveBeenCalledWith(expect.objectContaining({ name: 'Wand of Fireball', charges: 30 }));
  });

  it('defaults a missing quantity to 1 and blank optionals to null', async () => {
    await prepareEntryForSubmission(itemEntry({ quantity: '', sessionDate: '2025-01-15' }));

    const sent = lootService.createLoot.mock.calls[0][0];
    expect(sent.quantity).toBe(1);
    expect(sent).toMatchObject({ notes: null, itemId: null, modIds: [], customValue: null, type: null, size: null });
  });

  it('nulls itemId for an unidentified item and never parses it', async () => {
    await prepareEntryForSubmission(itemEntry({ itemId: 7, unidentified: true, parseItem: true }));

    expect(lootService.parseItem).not.toHaveBeenCalled();
    expect(lootService.createLoot.mock.calls[0][0]).toMatchObject({ unidentified: true, itemId: null });
  });

  it('merges the parsed result when Smart Item Detection is on', async () => {
    lootService.parseItem.mockResolvedValue({
      data: { type: 'Weapon', itemId: 42, modIds: [5], value: '8315', cursed: false },
    });

    await prepareEntryForSubmission(itemEntry({ name: '+1 Flaming Longsword', parseItem: true }));

    expect(lootService.parseItem).toHaveBeenCalledWith({ description: '+1 Flaming Longsword' });
    expect(lootService.createLoot.mock.calls[0][0]).toMatchObject({
      itemId: 42,
      modIds: [5],
      customValue: 8315,
      type: 'weapon',
    });
  });

  it('still creates the item as typed when parsing fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    lootService.parseItem.mockRejectedValue(new Error('parser down'));

    await prepareEntryForSubmission(itemEntry({ parseItem: true, itemId: 9 }));

    expect(lootService.createLoot.mock.calls[0][0]).toMatchObject({ name: 'Longsword', itemId: 9 });
    consoleError.mockRestore();
  });
});

describe('validateLootEntries', () => {
  const gold = (data) => ({
    type: 'gold',
    data: { transactionType: 'Deposit', platinum: '', gold: '', silver: '', copper: '', ...data },
  });

  it('accepts a named item with a positive quantity', () => {
    const { validEntries, invalidEntries } = validateLootEntries([itemEntry()]);
    expect(validEntries).toHaveLength(1);
    expect(invalidEntries).toHaveLength(0);
  });

  it.each([
    ['a blank name', { name: '   ' }, 'Item name is required'],
    ['a zero quantity', { quantity: '0' }, 'Quantity must be greater than 0'],
    ['a missing quantity', { quantity: '' }, 'Quantity must be greater than 0'],
  ])('rejects an item with %s', (_label, data, message) => {
    const { validEntries, invalidEntries } = validateLootEntries([itemEntry(data)]);
    expect(validEntries).toHaveLength(0);
    expect(invalidEntries[0].error).toBe(message);
  });

  // Owner decision (2026-10-06): a wand is entered with 1 to 50 charges; blank stays allowed.
  it.each([
    ['zero', '0'],
    ['numeric zero', 0],
    ['negative', '-2'],
    ['above fifty', '51'],
    ['fractional', '2.5'],
    ['not a number', 'abc'],
  ])('rejects wand charges that are %s', (_label, charges) => {
    const { validEntries, invalidEntries } = validateLootEntries([itemEntry({ name: 'Wand of Fireball', charges })]);
    expect(validEntries).toHaveLength(0);
    expect(invalidEntries[0].error).toBe('Wand charges must be a whole number from 1 to 50');
  });

  it.each([['blank', ''], ['one', '1'], ['fifty', 50], ['undefined', undefined]])('accepts wand charges that are %s', (_label, charges) => {
    const { validEntries } = validateLootEntries([itemEntry({ name: 'Wand of Fireball', charges })]);
    expect(validEntries).toHaveLength(1);
  });

  it('ignores a leftover charges value once the row is no longer a wand', () => {
    const { validEntries, invalidEntries } = validateLootEntries([itemEntry({ name: 'Fireball necklace', charges: 60 })]);
    expect(validEntries).toHaveLength(1);
    expect(invalidEntries).toHaveLength(0);
  });

  it('requires a transaction type on gold entries', () => {
    const { invalidEntries } = validateLootEntries([gold({ transactionType: '', gold: '5' })]);
    expect(invalidEntries[0].error).toBe('Transaction type is required');
  });

  it.each([
    ['all blank', {}],
    ['all zero', { platinum: '0', gold: '0.00', silver: '0', copper: '0' }],
    ['not a number', { gold: 'abc' }],
  ])('rejects a gold entry whose amounts are %s', (_label, amounts) => {
    const { validEntries, invalidEntries } = validateLootEntries([gold(amounts)]);
    expect(validEntries).toHaveLength(0);
    expect(invalidEntries[0].error).toBe('At least one currency amount is required');
  });

  it('accepts a gold entry with one non-zero amount (including a typed negative one)', () => {
    expect(validateLootEntries([gold({ copper: '7' })]).validEntries).toHaveLength(1);
    expect(validateLootEntries([gold({ gold: '-5' })]).validEntries).toHaveLength(1);
  });

  it('splits a mixed list and keeps the error on the invalid copy only', () => {
    const good = itemEntry();
    const bad = itemEntry({ name: '' });
    const { validEntries, invalidEntries } = validateLootEntries([good, bad]);
    expect(validEntries).toEqual([good]);
    expect(invalidEntries).toHaveLength(1);
    expect(good.error).toBeUndefined();
  });
});

describe('fetchItemNames / fetchInitialData', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('queries the trimmed text with a limit of 50 and reshapes the suggestions', async () => {
    lootService.suggestItems.mockResolvedValue({
      data: {
        suggestions: [
          { id: 1, name: 'Longsword', type: 'Weapon', subtype: 'Martial', value: 15 },
          { id: 2, name: 'Rope' },
        ],
      },
    });

    const result = await fetchItemNames('  sword ');

    expect(lootService.suggestItems).toHaveBeenCalledWith({ query: 'sword', limit: 50 });
    expect(result).toEqual([
      { id: 1, name: 'Longsword', type: 'Weapon', subtype: 'Martial', value: 15 },
      { id: 2, name: 'Rope', type: undefined, subtype: undefined, value: null },
    ]);
  });

  it('returns an empty list when the lookup fails', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    lootService.suggestItems.mockRejectedValue(new Error('down'));

    expect(await fetchItemNames('x')).toEqual([]);
    consoleError.mockRestore();
  });

  it('fetchInitialData only loads the item names (no character lookup)', async () => {
    lootService.suggestItems.mockResolvedValue({ data: { suggestions: [{ id: 1, name: 'Dagger' }] } });
    const setItemOptions = vi.fn();

    await fetchInitialData(setItemOptions);

    expect(setItemOptions).toHaveBeenCalledWith([expect.objectContaining({ name: 'Dagger' })]);
    expect(api.get).not.toHaveBeenCalled();
  });
});
