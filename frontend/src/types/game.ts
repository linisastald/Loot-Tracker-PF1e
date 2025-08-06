/**
 * Core game entity type definitions for Pathfinder 1e Loot Tracker
 */

// Currency and value types
export interface CurrencyValue {
  platinum?: number;
  gold?: number;
  silver?: number;
  copper?: number;
}

export interface ItemValue {
  value: number;
  currency?: 'pp' | 'gp' | 'sp' | 'cp';
}

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
export type LootStatus = 
  | 'unprocessed'
  | 'kept-character' 
  | 'kept-party'
  | 'sold'
  | 'given-away'
  | 'trashed'
  | 'Pending Sale'; // Add this status that appears in the actual data

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

// Character types
export interface CharacterStats {
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
}

export interface Character {
  id: number;
  name: string;
  player_name?: string;
  class?: string;
  level?: number;
  stats?: CharacterStats;
  campaign_id: number;
  active: boolean;
  created_at?: string;
  updated_at?: string;
  
  // Computed fields
  inventory?: LootItem[];
  total_wealth?: number;
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

export interface LootManagementAction {
  label: string;
  color: 'primary' | 'secondary' | 'error' | 'warning' | 'info' | 'success';
  variant: 'contained' | 'outlined' | 'text';
  handler: () => void;
  showCondition?: boolean;
}

export interface LootManagementConfig {
  status?: LootStatus | null;
  showColumns: LootTableColumnConfig;
  showFilters: LootTableFilterConfig;
  actions: LootManagementAction[];
  hasFilters?: boolean;
  containerProps?: {
    sx?: any;
  };
}

// Campaign and session types
export interface Campaign {
  id: number;
  name: string;
  description?: string;
  gm_user_id: number;
  active: boolean;
  created_at: string;
  updated_at?: string;
  
  // Related data
  characters?: Character[];
  sessions?: Session[];
}

export interface Session {
  id: number;
  name: string;
  description?: string;
  session_date: string;
  campaign_id: number;
  created_at?: string;
  updated_at?: string;
  
  // Related data
  loot_items?: LootItem[];
}

// User and authentication types
export interface User {
  id: number;
  username: string;
  email?: string;
  role: 'admin' | 'gm' | 'player';
  active: boolean;
  created_at?: string;
  
  // Permissions
  campaigns?: Campaign[];
  characters?: Character[];
}

// Gold/currency tracking
export interface GoldEntry {
  id: number;
  amount: number;
  currency: 'pp' | 'gp' | 'sp' | 'cp';
  description: string;
  entry_type: 'income' | 'expense' | 'transfer';
  character_id?: number;
  session_id?: number;
  campaign_id: number;
  created_at: string;
  
  // Joined data
  character_name?: string;
  session_name?: string;
}

// Ship and crew types (for nautical campaigns)
export type ShipStatus = 'PC Active' | 'Active' | 'Docked' | 'Lost' | 'Sunk';

export interface Ship {
  id: number;
  name: string;
  type: string;
  status: ShipStatus;
  campaign_id: number;
  description?: string;
  stats?: Record<string, any>; // Flexible for ship stats
  created_at?: string;
  updated_at?: string;
}

export interface CrewMember {
  id: number;
  name: string;
  position: string;
  ship_id?: number;
  campaign_id: number;
  active: boolean;
  stats?: Record<string, any>; // Flexible for crew stats
  created_at?: string;
  updated_at?: string;
}

// API response types
export interface ApiResponse<T = any> {
  success: boolean;
  message: string;
  data: T;
  error?: string;
}

export interface PaginatedResponse<T = any> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

// Filter and search types
export interface LootFilters {
  search?: string;
  character?: string | number;
  characterId?: number;
  itemType?: ItemType;
  status?: LootStatus;
  session?: string | number;
  sessionId?: number;
  identified?: boolean;
  minValue?: number;
  maxValue?: number;
  campaign?: string | number;
  campaignId?: number;
}

export interface CharacterFilters {
  search?: string;
  campaign?: string | number;
  campaignId?: number;
  active?: boolean;
  class?: string;
  level?: number;
}

// Component prop types
export interface TableColumn<T = any> {
  id: keyof T | string;
  label: string;
  minWidth?: number;
  align?: 'left' | 'center' | 'right';
  format?: (value: any) => string | React.ReactNode;
  sortable?: boolean;
}

export interface SelectOption {
  value: string | number;
  label: string;
  disabled?: boolean;
}