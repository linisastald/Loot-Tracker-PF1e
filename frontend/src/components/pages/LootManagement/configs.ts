import { LootManagementConfig } from '../../../types/game';

// Base column configurations
const baseColumns = {
  select: true,
  quantity: true,
  name: true,
  type: true,
  size: true,
  sessionDate: true,
  lastUpdate: true,
};

const baseFilters = {
  type: true,
  size: true,
};

// Configuration for Unprocessed Loot page
export const unprocessedLootConfig: LootManagementConfig = {
  status: null, // No status filter for unprocessed
  showColumns: {
    ...baseColumns,
    whoHasIt: false,
    believedValue: true,
    averageAppraisal: true,
    unidentified: true,
    pendingSale: true,
  },
  showFilters: {
    ...baseFilters,
    pendingSale: true,
    unidentified: true,
    whoHas: false,
  },
  actions: [], // Actions will be injected by the component
  containerProps: {
    sx: { pb: '80px' } // Always show padding for floating buttons
  }
};

// Configuration for Kept Party Loot page
export const keptPartyLootConfig: LootManagementConfig = {
  status: 'kept-party',
  showColumns: {
    ...baseColumns,
    whoHasIt: false,
    believedValue: false,
    averageAppraisal: false,
    unidentified: false,
    pendingSale: false,
  },
  showFilters: {
    ...baseFilters,
    pendingSale: false,
    unidentified: false,
    whoHas: false,
  },
  actions: [], // Actions will be injected by the component
};

// Configuration for Kept Character Loot page
export const keptCharacterLootConfig: LootManagementConfig = {
  status: 'kept-character',
  showColumns: {
    ...baseColumns,
    whoHasIt: true,
    believedValue: true,
    averageAppraisal: true,
    unidentified: false,
    pendingSale: false,
  },
  showFilters: {
    ...baseFilters,
    pendingSale: false,
    unidentified: false,
    whoHas: true,
  },
  actions: [], // Actions will be injected by the component
  hasFilters: true, // This page uses character filters
};

// Configuration for Sold Loot page
export const soldLootConfig: LootManagementConfig = {
  status: 'sold',
  showColumns: {
    ...baseColumns,
    whoHasIt: false,
    believedValue: true,
    averageAppraisal: false,
    unidentified: false,
    pendingSale: false,
  },
  showFilters: {
    ...baseFilters,
    pendingSale: false,
    unidentified: false,
    whoHas: false,
  },
  actions: [], // Usually no actions for sold items
};

// Configuration for Trashed/Given Away Loot page
export const trashedLootConfig: LootManagementConfig = {
  status: 'trashed',
  showColumns: {
    select: false, // No selection for trashed items
    quantity: true,
    name: true,
    type: true,
    size: false, // Don't show size for trashed items
    whoHasIt: false,
    believedValue: false,
    averageAppraisal: false,
    sessionDate: true,
    lastUpdate: true,
    unidentified: false,
    pendingSale: false,
  },
  showFilters: {
    pendingSale: false,
    unidentified: false,
    type: true,
    size: false, // Don't filter by size for trashed items
    whoHas: false,
  },
  actions: [], // Usually no actions for trashed items
};