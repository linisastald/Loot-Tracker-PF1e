/**
 * Core game entity type definitions for Pathfinder 1e Loot Tracker
 */

import type { SxProps, Theme } from '@mui/material/styles';

// Item and equipment types
export type ItemType = 
  | 'weapon' 
  | 'armor' 
  | 'shield' 
  | 'item' 
  | 'trade good' 
  | 'consumable'
  | 'wondrous item'
  | 'ring'
  | 'rod'
  | 'staff'
  | 'wand'
  | 'scroll'
  | 'potion';

export type ItemSubtype = string; // Flexible for various subtypes

export interface ItemModifier {
  id: number;
  name: string;
  description?: string;
  modifier_type: string;
  bonus_value?: number;
  cost_modifier?: number;
}

export interface BaseItem {
  id: number;
  name: string;
  type: ItemType;
  subtype?: ItemSubtype;
  description?: string;
  value: number;
  weight?: number;
  hardness?: number;
  hp?: number;
  ac_bonus?: number;
  enhancement_bonus?: number;
  damage?: string;
  critical?: string;
  range?: number;
  ammunition_type?: string;
  special_properties?: string;
  aura?: string;
  caster_level?: number;
  slot?: string;
  created_at?: string;
  updated_at?: string;
}

// Loot instance (actual items found/owned)
// Mirrors ValidationService.LOOT_STATUSES in the backend (see also LOOT_STATUSES in
// utils/itemOptions.ts); null is a row that has not been processed yet.
export type LootStatus =
  | null
  | 'Unprocessed'
  | 'Kept Party'
  | 'Kept Character'
  | 'Pending Sale'
  | 'Sold'
  | 'Given Away'
  | 'Trashed';

// Which list a Loot Management page shows. These are page keys read by
// useLootManagement, not loot statuses: 'Kept Self' is the Kept Character page and
// 'Trash' the Given Away / Trashed page.
export type LootPageKey = null | 'Kept Party' | 'Kept Self' | 'Trash';

export interface LootItem {
  id: number;
  itemid?: number; // Reference to BaseItem
  name: string;
  type: ItemType;
  subtype?: ItemSubtype;
  description?: string;
  value: number;
  identified?: boolean; // Make optional since some items use 'unidentified'
  unidentified?: boolean; // Add this property that exists in actual data
  quantity: number;
  status: LootStatus;
  statuspage?: string;
  whohas?: number; // Character ID who has the item
  salevalue?: number;
  session_id?: number;
  session_date?: string; // Add this property that exists in actual data
  character_id?: number;
  campaign_id?: number;
  
  // Item modifications
  mod1?: number;
  mod2?: number;
  mod3?: number;
  modids?: number[]; // Add modids array that's used in actual data
  
  // Additional item properties that exist in actual data
  size?: string;
  masterwork?: boolean;
  cursed?: boolean;
  notes?: string;
  caster_level?: number;
  
  // Timestamps
  lastupdate: string;
  created_at?: string;
  
  // Joined data (from database views)
  character_name?: string;
  character_names?: string[]; // Array of character names
  session_name?: string;
  mod1_name?: string;
  mod2_name?: string;
  mod3_name?: string;
  modification_names?: string;
  row_type?: 'summary' | 'individual'; // For loot_view
  base_item?: BaseItem;
  mods?: ItemModifier[];
  
  // Appraisal data
  appraisals?: Array<{
    character_id: number;
    character_name: string;
    believedvalue: number;
  }>;
  believedvalue?: number;
  average_appraisal?: number;
}

// Loot management configuration types
export interface LootTableColumnConfig {
  select: boolean;
  quantity: boolean;
  name: boolean;
  type: boolean;
  size: boolean;
  whoHasIt: boolean;
  believedValue: boolean;
  averageAppraisal: boolean;
  sessionDate: boolean;
  lastUpdate: boolean;
  unidentified: boolean;
  pendingSale: boolean;
}

export interface LootTableFilterConfig {
  pendingSale: boolean;
  unidentified: boolean;
  type: boolean;
  size: boolean;
  whoHas: boolean;
}

export type LootActionKey = 'appraise' | 'sell' | 'trash' | 'keepSelf' | 'keepParty';

export interface LootManagementAction {
  label: string;
  color: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  variant: 'contained' | 'outlined' | 'text';
  actionKey: LootActionKey;
}

export interface LootManagementConfig {
  status?: LootPageKey;
  showColumns: LootTableColumnConfig;
  showFilters: LootTableFilterConfig;
  actions: LootManagementAction[];
  containerProps?: {
    sx?: SxProps<Theme>;
  };
}

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
  error?: string;
}
