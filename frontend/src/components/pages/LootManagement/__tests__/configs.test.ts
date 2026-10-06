import { describe, it, expect } from 'vitest';
import { unprocessedLootConfig, keptPartyLootConfig, keptCharacterLootConfig, trashedLootConfig } from '../configs';

const columns = (overrides: Record<string, boolean>) => ({
  select: true, quantity: true, name: true, type: true, size: true,
  whoHasIt: false, believedValue: false, averageAppraisal: false,
  sessionDate: true, lastUpdate: true, unidentified: false, pendingSale: false,
  ...overrides,
});

const filters = (overrides: Record<string, boolean>) => ({
  type: true, size: true, pendingSale: false, unidentified: false, whoHas: false,
  ...overrides,
});

describe('loot management configs', () => {
  it('unprocessed loot shows appraisal and identification columns and filters', () => {
    expect(unprocessedLootConfig.status).toBeNull();
    expect(unprocessedLootConfig.showColumns).toEqual(columns({
      believedValue: true, averageAppraisal: true, unidentified: true, pendingSale: true,
    }));
    expect(unprocessedLootConfig.showFilters).toEqual(filters({ pendingSale: true, unidentified: true }));
  });

  it('kept party loot is the plain table', () => {
    expect(keptPartyLootConfig.status).toBe('Kept Party');
    expect(keptPartyLootConfig.showColumns).toEqual(columns({}));
    expect(keptPartyLootConfig.showFilters).toEqual(filters({}));
  });

  it('kept character loot adds the holder column and filter plus appraisal columns', () => {
    expect(keptCharacterLootConfig.status).toBe('Kept Self');
    expect(keptCharacterLootConfig.showColumns).toEqual(columns({
      whoHasIt: true, believedValue: true, averageAppraisal: true,
    }));
    expect(keptCharacterLootConfig.showFilters).toEqual(filters({ whoHas: true }));
  });

  it('trashed loot has no selection or size column/filter', () => {
    expect(trashedLootConfig.status).toBe('Trash');
    expect(trashedLootConfig.showColumns).toEqual(columns({ select: false, size: false }));
    expect(trashedLootConfig.showFilters).toEqual(filters({ size: false }));
  });
});
