import { describe, it, expect } from 'vitest';
import {
  DEFAULT_SHIP, NEW_SHIP_FORM, formatSigned, getHullStatus, getShipStatusChipColor, toShipForm, withShipDefaults
} from './shipUtils';

describe('getHullStatus', () => {
  it.each([
    [100, 100, 'Pristine', 'success'],
    [99, 100, 'Minor Damage', 'success'],
    [75, 100, 'Minor Damage', 'success'],
    [74, 100, 'Moderate Damage', 'warning'],
    [50, 100, 'Moderate Damage', 'warning'],
    [49, 100, 'Heavy Damage', 'warning'],
    [25, 100, 'Heavy Damage', 'warning'],
    [24, 100, 'Critical Damage', 'error'],
    [0, 100, 'Sunk', 'error'],
  ])('%i/%i is %s', (current, max, label, color) => {
    expect(getHullStatus({ current_hp: current, max_hp: max })).toEqual({ label, color });
  });

  it('is Unknown only when HP is missing', () => {
    expect(getHullStatus({}).label).toBe('Unknown');
    expect(getHullStatus({ current_hp: null as unknown as undefined, max_hp: 10 }).label).toBe('Unknown');
    expect(getHullStatus({ current_hp: 5, max_hp: 0 }).label).toBe('Unknown');
  });
});

describe('formatSigned', () => {
  it('prefixes non-negative numbers with +', () => {
    expect(formatSigned(3)).toBe('+3');
    expect(formatSigned(0)).toBe('+0');
    expect(formatSigned(-4)).toBe('-4');
    expect(formatSigned(undefined)).toBe('+0');
  });
});

describe('withShipDefaults', () => {
  it('keeps stored zero and false values and fills only missing ones', () => {
    const ship = withShipDefaults({
      id: 1, name: 'A', current_hp: 0, base_ac: 0, cost: 0, is_squibbing: false, hardness: undefined, cmd: null as unknown as undefined,
    });
    expect(ship.current_hp).toBe(0);
    expect(ship.base_ac).toBe(0);
    expect(ship.cost).toBe(0);
    expect(ship.hardness).toBe(DEFAULT_SHIP.hardness);
    expect(ship.cmd).toBe(DEFAULT_SHIP.cmd);
    expect(ship.max_hp).toBe(100);
  });
});

describe('toShipForm', () => {
  it('copies only the dialog fields', () => {
    const form = toShipForm({ id: 1, name: 'A', plunder: 5, officers: [{ name: 'x' }], captain_name: 'Cap' });
    expect(Object.keys(form).sort()).toEqual(Object.keys(NEW_SHIP_FORM).sort());
  });

  it('keeps a 0-HP ship at 0 HP', () => {
    expect(toShipForm({ id: 1, name: 'A', current_hp: 0, max_hp: 80 }).current_hp).toBe(0);
  });

  it('sends no empty weapon_types (legacy ships) but keeps new-format weapon_types', () => {
    expect(toShipForm({ id: 1, name: 'A', weapon_types: [], weapons: [{ name: 'x' }] }).weapon_types).toBeUndefined();
    const wt = [{ type: 'Ballista', quantity: 2 }];
    expect(toShipForm({ id: 1, name: 'A', weapon_types: wt }).weapon_types).toEqual(wt);
  });
});

describe('getShipStatusChipColor', () => {
  it('maps each status and falls back to default', () => {
    expect(getShipStatusChipColor('PC Active')).toBe('primary');
    expect(getShipStatusChipColor('Sunk')).toBe('error');
    expect(getShipStatusChipColor('Mystery')).toBe('default');
    expect(getShipStatusChipColor(undefined)).toBe('default');
  });
});
