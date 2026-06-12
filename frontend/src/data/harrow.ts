// frontend/src/data/harrow.ts
// Static reference data for the Harrow Point Tracker (Curse of the Crimson
// Throne). Sourced from the Anniversary Edition, Appendix 3 (see
// docs/harrow-point-tracker-plan.md Appendices A & B). The app does not compute
// the spend options — they are reference text shown for the current chapter.

export interface HarrowChapter {
  /** Chapter number, 1-6 */
  chapter: number;
  /** AP chapter title */
  name: string;
  /** Harrow suit tied to the chapter */
  suit: string;
  /** Full ability score name */
  ability: string;
  /** Three-letter ability abbreviation (DEX, CON, ...) */
  abilityAbbr: string;
  /** Spend options unlocked this chapter (reference text for the panel) */
  spendOptions: string[];
}

export const HARROW_CHAPTERS: HarrowChapter[] = [
  {
    chapter: 1,
    name: 'Edge of Anarchy',
    suit: 'Keys',
    ability: 'Dexterity',
    abilityAbbr: 'DEX',
    spendOptions: [
      'Dexterity Rerolls (initiative, Reflex save, Dex-based attack, or Dex check)',
      'Dodge Bonus (+1 dodge AC per point spent, max +3 per encounter)',
      'Speed Increase (+10 ft for one encounter)',
    ],
  },
  {
    chapter: 2,
    name: 'Seven Days to the Grave',
    suit: 'Shields',
    ability: 'Constitution',
    abilityAbbr: 'CON',
    spendOptions: [
      'Constitution Rerolls (Fortitude save, stabilization, or Con check)',
      'Damage Reduction (DR 3/— for the encounter, not stackable)',
      'Fast HP Recovery (rest 1 min to heal ability damage equal to character level + 1; once per encounter)',
    ],
  },
  {
    chapter: 3,
    name: 'Escape from Old Korvosa',
    suit: 'Books',
    ability: 'Intelligence',
    abilityAbbr: 'INT',
    spendOptions: [
      'Arcane Wrath (Int-based caster: +2 spell DC, +4 caster level vs SR, +2 attack with that spell)',
      'Flash of Insight (one-time +5 insight bonus on an untrained trained-only skill check)',
      'Intelligence Rerolls',
    ],
  },
  {
    chapter: 4,
    name: 'A History of Ashes',
    suit: 'Hammers',
    ability: 'Strength',
    abilityAbbr: 'STR',
    spendOptions: [
      'Brutal Strike (+5 melee/natural damage for one combat, or ignore an object’s hardness for 1 round)',
      'Mighty Thews (treated one size larger for grapple, wielding, lifting, and swallow for one encounter)',
      'Strength Rerolls',
    ],
  },
  {
    chapter: 5,
    name: 'Skeletons of Scarwall',
    suit: 'Stars',
    ability: 'Wisdom',
    abilityAbbr: 'WIS',
    spendOptions: [
      'Divine Wrath (Wis-based caster: +2 spell DC, +4 caster level vs SR, +2 attack)',
      'Greater Channeling (+2 effective channel level and +2 save DC, with no daily use spent)',
      'Wisdom Rerolls (Wis check or Will save)',
    ],
  },
  {
    chapter: 6,
    name: 'Crown of Fangs',
    suit: 'Crowns',
    ability: 'Charisma',
    abilityAbbr: 'CHA',
    spendOptions: [
      'Charisma Rerolls',
      'Destiny Shall Not Be Denied (immediate action: force the GM to reroll a d20; the new result must be kept)',
      'Psychic Wrath (Cha-based caster: +2 spell DC, +4 caster level vs SR, +2 attack)',
    ],
  },
];

/** Look up a chapter's reference data (falls back to chapter 1). */
export const getHarrowChapter = (chapter: number): HarrowChapter =>
  HARROW_CHAPTERS.find((c) => c.chapter === chapter) || HARROW_CHAPTERS[0];

/** The 54 Harrow cards, for the Choosing-card autocomplete. */
export const HARROW_CARDS: string[] = [
  'Avalanche', 'Bear', 'Beating', 'Betrayal', 'Big Sky', 'Brass Dwarf', 'Carnival',
  'Courtesan', 'Cricket', 'Crows', 'Cyclone', 'Dance', "Demon's Lantern", 'Desert',
  'Eclipse', 'Empty Throne', 'Fiend', 'Foreign Trader', 'Forge', 'Hidden Truth',
  'Idiot', 'Inquisitor', 'Joke', 'Juggler', 'Keep', 'Liar', 'Locksmith', 'Lost',
  'Marriage', 'Midwife', 'Mountain Man', 'Mute Hag', 'Owl', 'Paladin', 'Peacock',
  'Publican', 'Queen Mother', 'Rabbit Prince', 'Rakshasa', 'Sickness', 'Snakebite',
  'Survivor', 'Tangled Briar', 'Teamster', 'Theater', 'Trumpet', 'Twin', 'Tyrant',
  'Unicorn', 'Uprising', 'Vision', 'Wanderer', 'Waxworks', 'Winged Serpent',
];
