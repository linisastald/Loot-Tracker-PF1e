// Shared option lists for item and gold forms/filters, so the dropdowns and
// filter menus do not each re-declare them.

export interface ItemTypeOption {
  value: string;
  label: string;
}

export const ITEM_TYPES: ItemTypeOption[] = [
  { value: 'weapon', label: 'Weapon' },
  { value: 'armor', label: 'Armor' },
  { value: 'magic', label: 'Magic' },
  { value: 'gear', label: 'Gear' },
  { value: 'trade good', label: 'Trade Good' },
  { value: 'other', label: 'Other' },
];

export const ITEM_SIZES: string[] = [
  'Fine',
  'Diminutive',
  'Tiny',
  'Small',
  'Medium',
  'Large',
  'Huge',
  'Gargantuan',
  'Colossal',
];

// Every status a loot row can have; mirrors ValidationService.LOOT_STATUSES in the backend.
export const LOOT_STATUSES: string[] = [
  'Unprocessed',
  'Kept Party',
  'Kept Character',
  'Pending Sale',
  'Sold',
  'Given Away',
  'Trashed',
];

export const GOLD_TRANSACTION_TYPES: string[] = [
  'Deposit',
  'Withdrawal',
  'Party Loot Purchase',
  'Party Payback',
  'Other',
];

// The loot entry Charges input is only shown for a name starting with "wand of ",
// so a value left over from an earlier name must neither block the entry nor be saved.
export const isWandEntryName = (name: unknown): boolean =>
  typeof name === 'string' && name.toLowerCase().startsWith('wand of ');
