import { describe, it, expect, vi } from 'vitest';
import { STANDARD_RACES, RANDOM_NAMES, generateRandomRace, generateRandomAge, generateRandomName } from '../raceData';

describe('raceData', () => {
  it('lists only official Pathfinder races (no Dragonborn)', () => {
    expect(STANDARD_RACES).not.toContain('Dragonborn');
    expect(STANDARD_RACES).toContain('Human');
    expect(STANDARD_RACES).toContain('Tengu');
    expect(new Set(STANDARD_RACES).size).toBe(STANDARD_RACES.length);
  });

  it('only generates races from the standard list', () => {
    for (let i = 0; i < 200; i += 1) {
      expect(STANDARD_RACES).toContain(generateRandomRace());
    }
  });

  it('weights the pool: the first roll of 0 is Human, the last is the rarest race', () => {
    const spy = vi.spyOn(Math, 'random');
    spy.mockReturnValue(0);
    expect(generateRandomRace()).toBe('Human');
    spy.mockReturnValue(0.999999);
    expect(generateRandomRace()).toBe('Oread');
    spy.mockRestore();
  });

  it('generates an age inside the race range and defaults to human', () => {
    const spy = vi.spyOn(Math, 'random');
    spy.mockReturnValue(0);
    expect(generateRandomAge('Elf')).toBe(100);
    expect(generateRandomAge('Unknown')).toBe(16);
    spy.mockReturnValue(0.999999);
    expect(generateRandomAge('Elf')).toBe(500);
    spy.mockRestore();
  });

  it('has no repeated names in the name pools', () => {
    expect(new Set(RANDOM_NAMES.first).size).toBe(RANDOM_NAMES.first.length);
    expect(new Set(RANDOM_NAMES.last).size).toBe(RANDOM_NAMES.last.length);
  });

  it('builds a "First Last" name', () => {
    expect(generateRandomName()).toMatch(/^\S+ \S+$/);
  });
});
