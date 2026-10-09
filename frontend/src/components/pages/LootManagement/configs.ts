import { LootManagementConfig } from '../../../types/game';

// Base column configuration: every flag is listed once; each page overrides
// only what differs.
const baseColumns = {
  select: true,
  quantity: true,
  name: true,
  type: true,
  size: true,
  whoHasIt: false,
  believedValue: false,
  averageAppraisal: false,
  sessionDate: true,
  lastUpdate: true,
  unidentified: false,
  pendingSale: false,
};

const baseFilters = {
  type: true,
  size: true,
  pendingSale: false,
  unidentified: false,
  whoHas: false,
};

// Configuration for Unprocessed Loot page
export const unprocessedLootConfig: LootManagementConfig = {
  status: null, // No status filter for unprocessed
  showColumns: {
    ...baseColumns,
    believedValue: true,
    averageAppraisal: true,
    unidentified: true,
    pendingSale: true,
  },
  showFilters: {
    ...baseFilters,
    pendingSale: true,
    unidentified: true,
  },
  actions: [], // Actions will be injected by the component
  containerProps: {
    sx: { pb: '80px' } // Always show padding for floating buttons
  }
};

// Configuration for Kept Party Loot page
export const keptPartyLootConfig: LootManagementConfig = {
  status: 'Kept Party',
  showColumns: baseColumns,
  showFilters: baseFilters,
  actions: [], // Actions will be injected by the component
};

// Configuration for Kept Character Loot page
export const keptCharacterLootConfig: LootManagementConfig = {
  status: 'Kept Self',
  showColumns: {
    ...baseColumns,
    whoHasIt: true,
    believedValue: true,
    averageAppraisal: true,
  },
  showFilters: {
    ...baseFilters,
    whoHas: true, // This page uses character filters
  },
  actions: [], // Actions will be injected by the component
};

// Configuration for Trashed/Given Away Loot page
export const trashedLootConfig: LootManagementConfig = {
  status: 'Trash',
  showColumns: {
    ...baseColumns,
    select: false, // No selection for trashed items
    size: false, // Don't show size for trashed items
  },
  showFilters: {
    ...baseFilters,
    size: false, // Don't filter by size for trashed items
  },
  actions: [], // Usually no actions for trashed items
};
