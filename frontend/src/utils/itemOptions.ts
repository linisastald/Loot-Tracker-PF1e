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

export const GOLD_TRANSACTION_TYPES: string[] = [
  'Deposit',
  'Withdrawal',
  'Party Loot Purchase',
  'Party Payback',
  'Other',
];
