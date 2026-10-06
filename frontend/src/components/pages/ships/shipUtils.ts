// Shared types and helpers for the ship pages (list, details, dialogs).

export type ChipColor = 'default' | 'primary' | 'secondary' | 'error' | 'info' | 'success' | 'warning';

export interface WeaponType {
  type: string;
  quantity: number;
}

/** Detailed (legacy-format) weapon stat block. */
export interface ShipWeapon {
  name?: string;
  type?: string;
  damage?: string;
  range?: string;
  [key: string]: unknown;
}

export interface Officer {
  position?: string;
  name?: string;
}

export interface CargoManifest {
  items: unknown[];
  passengers: unknown[];
  impositions: unknown[];
}

/** A ship as returned by GET /ships (every stored column plus the crew count). */
export interface Ship {
  id: number;
  name: string;
  location?: string | null;
  status?: string;
  ship_type?: string | null;
  size?: string;
  cost?: number;
  max_speed?: number;
  acceleration?: number;
  propulsion?: string | null;
  min_crew?: number;
  max_crew?: number;
  cargo_capacity?: number;
  max_passengers?: number;
  decks?: number;
  weapons?: ShipWeapon[];
  weapon_types?: WeaponType[];
  is_squibbing?: boolean;
  ramming_damage?: string;
  base_ac?: number;
  touch_ac?: number;
  hardness?: number;
  max_hp?: number;
  current_hp?: number;
  cmb?: number;
  cmd?: number;
  saves?: number;
  initiative?: number;
  plunder?: number;
  infamy?: number;
  disrepute?: number;
  sails_oars?: string | null;
  sailing_check_bonus?: number;
  officers?: Officer[];
  improvements?: string[];
  cargo_manifest?: CargoManifest;
  ship_notes?: string | null;
  captain_name?: string | null;
  flag_description?: string | null;
  crew_count?: number;
}

/** Entry of GET /ships/types. */
export interface ShipTypeOption {
  key: string;
  name: string;
  size: string;
  cost: number;
}

export interface CrewMember {
  id: number;
  name: string;
  ship_position?: string | null;
  race?: string | null;
  age?: number | null;
  description?: string | null;
}

/** The ship values the dialog edits. Fields it cannot edit are left out of the PUT body, so the backend keeps them. */
export type ShipForm = Pick<Ship,
  'name' | 'location' | 'status' | 'ship_type' | 'size' | 'cost' | 'max_speed' | 'acceleration' |
  'propulsion' | 'min_crew' | 'max_crew' | 'cargo_capacity' | 'max_passengers' | 'decks' | 'weapons' |
  'weapon_types' | 'is_squibbing' | 'ramming_damage' | 'base_ac' | 'touch_ac' | 'hardness' | 'max_hp' |
  'current_hp' | 'cmb' | 'cmd' | 'saves' | 'initiative' | 'sails_oars' | 'sailing_check_bonus' | 'improvements'
>;

export const SHIP_STATUSES = ['PC Active', 'Active', 'Docked', 'Lost', 'Sunk'] as const;

/** Chip colour of an operational status. */
export const SHIP_STATUS_COLORS: Record<string, ChipColor> = {
  'PC Active': 'primary',
  Active: 'success',
  Docked: 'info',
  Lost: 'warning',
  Sunk: 'error',
};

export const getShipStatusChipColor = (status?: string): ChipColor =>
  (status && SHIP_STATUS_COLORS[status]) || 'default';

/** Every value a ship can have, used for new ships and to fill gaps in stored ones. */
export const DEFAULT_SHIP = {
  name: '',
  location: '',
  status: 'Active',
  ship_type: null as string | null,
  size: 'Colossal',
  cost: 0,
  max_speed: 30,
  acceleration: 15,
  propulsion: '',
  min_crew: 1,
  max_crew: 10,
  cargo_capacity: 10000,
  max_passengers: 10,
  decks: 1,
  weapons: [] as ShipWeapon[],
  weapon_types: [] as WeaponType[],
  is_squibbing: false,
  ramming_damage: '1d8',
  base_ac: 10,
  touch_ac: 10,
  hardness: 0,
  max_hp: 100,
  current_hp: 100,
  cmb: 0,
  cmd: 10,
  saves: 0,
  initiative: 0,
  plunder: 0,
  infamy: 0,
  disrepute: 0,
  sails_oars: '',
  sailing_check_bonus: 0,
  officers: [] as Officer[],
  improvements: [] as string[],
  cargo_manifest: { items: [], passengers: [], impositions: [] } as CargoManifest,
  ship_notes: '',
  captain_name: '',
  flag_description: '',
};

export type FullShip = typeof DEFAULT_SHIP & { id: number; crew_count?: number };

/** Values of a new ship in the dialog (editable fields only). */
export const NEW_SHIP_FORM: ShipForm = {
  name: DEFAULT_SHIP.name,
  location: DEFAULT_SHIP.location,
  status: DEFAULT_SHIP.status,
  ship_type: DEFAULT_SHIP.ship_type,
  size: DEFAULT_SHIP.size,
  cost: DEFAULT_SHIP.cost,
  max_speed: DEFAULT_SHIP.max_speed,
  acceleration: DEFAULT_SHIP.acceleration,
  propulsion: DEFAULT_SHIP.propulsion,
  min_crew: DEFAULT_SHIP.min_crew,
  max_crew: DEFAULT_SHIP.max_crew,
  cargo_capacity: DEFAULT_SHIP.cargo_capacity,
  max_passengers: DEFAULT_SHIP.max_passengers,
  decks: DEFAULT_SHIP.decks,
  weapons: [],
  weapon_types: [],
  is_squibbing: DEFAULT_SHIP.is_squibbing,
  ramming_damage: DEFAULT_SHIP.ramming_damage,
  base_ac: DEFAULT_SHIP.base_ac,
  touch_ac: DEFAULT_SHIP.touch_ac,
  hardness: DEFAULT_SHIP.hardness,
  max_hp: DEFAULT_SHIP.max_hp,
  current_hp: DEFAULT_SHIP.current_hp,
  cmb: DEFAULT_SHIP.cmb,
  cmd: DEFAULT_SHIP.cmd,
  saves: DEFAULT_SHIP.saves,
  initiative: DEFAULT_SHIP.initiative,
  sails_oars: DEFAULT_SHIP.sails_oars,
  sailing_check_bonus: DEFAULT_SHIP.sailing_check_bonus,
  improvements: [],
};

/** A stored ship with gaps (null / missing columns) filled from DEFAULT_SHIP. A stored 0 or false is kept. */
export const withShipDefaults = (ship: Ship): FullShip => {
  const filled: Record<string, unknown> = { ...DEFAULT_SHIP };
  (Object.keys(DEFAULT_SHIP) as Array<keyof typeof DEFAULT_SHIP>).forEach((key) => {
    filled[key] = ship[key as keyof Ship] ?? DEFAULT_SHIP[key];
  });
  return { ...filled, id: ship.id, crew_count: ship.crew_count } as FullShip;
};

/**
 * Dialog values for an existing ship. A new-format ship keeps its weapon_types; a
 * legacy ship has an empty weapon_types, which must be sent as undefined: the
 * backend treats an empty array as "set" and would otherwise replace the legacy
 * weapons list.
 */
export const toShipForm = (ship: Ship): ShipForm => {
  const full = withShipDefaults(ship);
  const form: Record<string, unknown> = {};
  (Object.keys(NEW_SHIP_FORM) as Array<keyof ShipForm>).forEach((key) => {
    form[key] = full[key];
  });
  form.weapon_types = full.weapon_types.length > 0 ? full.weapon_types : undefined;
  form.is_squibbing = Boolean(full.is_squibbing);
  return form as unknown as ShipForm;
};

export interface HullStatus {
  label: string;
  color: ChipColor;
}

/** Hull condition from HP. A ship at 0 HP is Sunk; missing HP is Unknown. */
export const getHullStatus = (ship: Pick<Ship, 'current_hp' | 'max_hp'>): HullStatus => {
  if (ship.current_hp == null || !ship.max_hp) return { label: 'Unknown', color: 'default' };
  if (ship.current_hp <= 0) return { label: 'Sunk', color: 'error' };

  const hpPercentage = (ship.current_hp / ship.max_hp) * 100;
  if (hpPercentage === 100) return { label: 'Pristine', color: 'success' };
  if (hpPercentage >= 75) return { label: 'Minor Damage', color: 'success' };
  if (hpPercentage >= 50) return { label: 'Moderate Damage', color: 'warning' };
  if (hpPercentage >= 25) return { label: 'Heavy Damage', color: 'warning' };
  return { label: 'Critical Damage', color: 'error' };
};

/** "+3", "0" -> "+0", "-2". */
export const formatSigned = (value: number | null | undefined): string => {
  const number = value ?? 0;
  return `${number >= 0 ? '+' : ''}${number}`;
};
