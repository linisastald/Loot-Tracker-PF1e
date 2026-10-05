// The catalog stores a wand's value per charge; an item availability check prices a
// new, full wand (50 charges), matching the backend (WAND_FULL_CHARGES).
export const WAND_FULL_CHARGES = 50;

export const isWandName = (name: string): boolean => name.toLowerCase().startsWith('wand of');

/** Item value as checked for availability: a wand at full charges, anything else as stored. */
export const availabilityItemValue = (item: { name: string; value: number }): number =>
  isWandName(item.name) ? item.value * WAND_FULL_CHARGES : item.value;

export const availabilityItemLabel = (item: { name: string; value: number }): string =>
  `${item.name} (${availabilityItemValue(item)} gp${isWandName(item.name) ? `, ${WAND_FULL_CHARGES} charges` : ''})`;
