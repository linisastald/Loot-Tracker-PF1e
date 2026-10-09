const shipTypes = require('../shipTypes');

const { getShipTypesList, getShipTypeData } = shipTypes;

describe('shipTypes data', () => {
  it('only exports the two lookup helpers', () => {
    expect(Object.keys(shipTypes).sort()).toEqual(['getShipTypeData', 'getShipTypesList']);
  });

  it('lists every type with key, name, size and cost', () => {
    const list = getShipTypesList();
    expect(list.length).toBeGreaterThan(10);
    expect(list.find((t) => t.key === 'keelboat')).toEqual({
      key: 'keelboat', name: 'Keelboat', size: 'Colossal', cost: 8000
    });
  });

  it('returns null for an unknown type', () => {
    expect(getShipTypeData('nope')).toBeNull();
  });

  it('builds typical weapons from the shared siege blocks', () => {
    const keelboat = getShipTypeData('keelboat');
    expect(keelboat.typical_weapons).toEqual([{
      name: 'Light Ballista', type: 'direct-fire', range: '120 ft', crew: 1, aim: 2, load: 3,
      damage: '3d8', ammunition: 'ballista bolt', critical: '19-20/x2',
      attack_bonus: '+4', mount: 'fore'
    }]);
  });

  it('gives each ship its own weapon objects (no shared mutable base)', () => {
    const a = getShipTypeData('keelboat').typical_weapons[0];
    const b = getShipTypeData('longship').typical_weapons[0];
    expect(a).not.toBe(b);
    expect(b.attack_bonus).toBe('+5');
  });

  it('every typical weapon is a complete 11-field stat block', () => {
    getShipTypesList().forEach(({ key }) => {
      (getShipTypeData(key).typical_weapons || []).forEach((w) => {
        expect(Object.keys(w).sort()).toEqual([
          'aim', 'ammunition', 'attack_bonus', 'crew', 'critical', 'damage',
          'load', 'mount', 'name', 'range', 'type'
        ]);
      });
    });
  });
});
