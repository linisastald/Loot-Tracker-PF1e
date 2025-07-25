// Pathfinder 1e Ship Types with complete statistics
// Based on official rulebooks and Skull & Shackles Adventure Path

const SHIP_TYPES = {
  rowboat: {
    name: "Rowboat",
    size: "Large",
    cost: 50,
    base_ac: 9,
    touch_ac: 9,
    hardness: 5,
    max_hp: 60,
    cmb: 1,
    cmd: 11,
    saves: 0,
    initiative: 0,
    max_speed: 30,
    acceleration: 10,
    propulsion: "muscle",
    min_crew: 1,
    max_crew: 2,
    cargo_capacity: 1000, // pounds
    max_passengers: 4,
    decks: 1,
    weapons: 0,
    ramming_damage: "1d8",
    sails_oars: "2 oars",
    sailing_check_bonus: 0,
    typical_weapons: [],
    typical_improvements: []
  },
  ships_boat: {
    name: "Ship's Boat",
    size: "Large",
    cost: 500,
    base_ac: 8,
    touch_ac: 8,
    hardness: 5,
    max_hp: 150,
    cmb: 1,
    cmd: 11,
    saves: 2,
    initiative: 0,
    max_speed: 30,
    acceleration: 30,
    propulsion: "muscle/wind",
    min_crew: 4,
    max_crew: 10,
    cargo_capacity: 4000, // 2 tons
    max_passengers: 12,
    decks: 1,
    weapons: 0,
    ramming_damage: "1d8",
    sails_oars: "6 oars, 10 squares of sails (1 mast)",
    sailing_check_bonus: 0,
    typical_weapons: [],
    typical_improvements: []
  },
  keelboat: {
    name: "Keelboat",
    size: "Colossal",
    cost: 8000,
    base_ac: 4,
    touch_ac: 4,
    hardness: 5,
    max_hp: 600,
    cmb: 6,
    cmd: 16,
    saves: 4,
    initiative: 0,
    max_speed: 60,
    acceleration: 20,
    propulsion: "muscle/wind/current",
    min_crew: 8,
    max_crew: 15,
    cargo_capacity: 100000, // 50 tons
    max_passengers: 100,
    decks: 1,
    weapons: 1,
    ramming_damage: "6d8",
    sails_oars: "8 oars, 20 squares of sails (1 mast)",
    sailing_check_bonus: 0,
    typical_weapons: [
      {
        name: "Light Ballista",
        type: "direct-fire",
        range: "120 ft",
        crew: 1,
        aim: 2,
        load: 3,
        damage: "3d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+4",
        mount: "fore"
      }
    ],
    typical_improvements: ["Reinforced Hull"]
  },
  longship: {
    name: "Longship",
    size: "Colossal",
    cost: 10000,
    base_ac: 4,
    touch_ac: 4,
    hardness: 5,
    max_hp: 900,
    cmb: 8,
    cmd: 18,
    saves: 3,
    initiative: 0,
    max_speed: 120,
    acceleration: 20,
    propulsion: "muscle/wind/current",
    min_crew: 40,
    max_crew: 50,
    cargo_capacity: 100000, // 50 tons
    max_passengers: 120,
    decks: 1,
    weapons: 2,
    ramming_damage: "8d8",
    sails_oars: "40 oars, 30 squares of sails (1 mast)",
    sailing_check_bonus: 0,
    typical_weapons: [
      {
        name: "Light Ballista",
        type: "direct-fire",
        range: "120 ft",
        crew: 1,
        aim: 2,
        load: 3,
        damage: "3d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+5",
        mount: "fore"
      },
      {
        name: "Light Ballista",
        type: "direct-fire",
        range: "120 ft",
        crew: 1,
        aim: 2,
        load: 3,
        damage: "3d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+5",
        mount: "aft"
      }
    ],
    typical_improvements: ["Ram", "Reinforced Hull"]
  },
  sailing_ship: {
    name: "Sailing Ship",
    size: "Colossal",
    cost: 10000,
    base_ac: 2,
    touch_ac: 2,
    hardness: 5,
    max_hp: 900,
    cmb: 8,
    cmd: 18,
    saves: 0,
    initiative: 0,
    max_speed: 90,
    acceleration: 15,
    propulsion: "wind/current",
    min_crew: 20,
    max_crew: 30,
    cargo_capacity: 300000, // 150 tons
    max_passengers: 200,
    decks: 3,
    weapons: 20,
    ramming_damage: "8d8",
    sails_oars: "90 squares of sails (3 masts)",
    sailing_check_bonus: 0,
    typical_weapons: [
      {
        name: "Light Ballista",
        type: "direct-fire",
        range: "120 ft",
        crew: 1,
        aim: 2,
        load: 3,
        damage: "3d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+6",
        mount: "port"
      },
      {
        name: "Light Ballista",
        type: "direct-fire", 
        range: "120 ft",
        crew: 1,
        aim: 2,
        load: 3,
        damage: "3d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+6",
        mount: "starboard"
      }
    ],
    typical_improvements: ["Reinforced Hull", "Improved Rigging"]
  },
  warship: {
    name: "Warship",
    size: "Colossal",
    cost: 25000,
    base_ac: 2,
    touch_ac: 2,
    hardness: 8,
    max_hp: 1200,
    cmb: 8,
    cmd: 18,
    saves: 1,
    initiative: 0,
    max_speed: 90,
    acceleration: 15,
    propulsion: "muscle/wind/current",
    min_crew: 60,
    max_crew: 80,
    cargo_capacity: 100000, // 50 tons
    max_passengers: 160,
    decks: 2,
    weapons: 20,
    ramming_damage: "10d8",
    sails_oars: "160 squares of sails (3 masts), 60 oars",
    sailing_check_bonus: 1,
    typical_weapons: [
      {
        name: "Heavy Ballista",
        type: "direct-fire",
        range: "180 ft",
        crew: 3,
        aim: 2,
        load: 3,
        damage: "4d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+8",
        mount: "fore"
      },
      {
        name: "Standard Catapult",
        type: "indirect-fire",
        range: "300 ft",
        crew: 3,
        aim: 3,
        load: 3,
        damage: "6d6",
        ammunition: "stone",
        critical: "x2",
        attack_bonus: "+7",
        mount: "aft"
      }
    ],
    typical_improvements: ["Ram", "Armored Hull", "Improved Steering"]
  },
  galley: {
    name: "Galley",
    size: "Colossal",
    cost: 20000,
    base_ac: 2,
    touch_ac: 2,
    hardness: 5,
    max_hp: 1700,
    cmb: 8,
    cmd: 18,
    saves: 1,
    initiative: 0,
    max_speed: 120,
    acceleration: 20,
    propulsion: "muscle/wind/current",
    min_crew: 140,
    max_crew: 200,
    cargo_capacity: 300000, // 150 tons
    max_passengers: 250,
    decks: 3,
    weapons: 40,
    ramming_damage: "8d8",
    sails_oars: "140 oars, 80 squares of sails (2-3 masts)",
    sailing_check_bonus: 0,
    typical_weapons: [
      {
        name: "Light Ballista",
        type: "direct-fire",
        range: "120 ft",
        crew: 1,
        aim: 2,
        load: 3,
        damage: "3d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+6",
        mount: "port"
      },
      {
        name: "Light Ballista",
        type: "direct-fire",
        range: "120 ft",
        crew: 1,
        aim: 2,
        load: 3,
        damage: "3d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+6",
        mount: "starboard"
      },
      {
        name: "Ram",
        type: "special",
        range: "ramming",
        crew: 0,
        aim: 0,
        load: 0,
        damage: "+3d6 ramming",
        ammunition: "none",
        critical: "x2",
        attack_bonus: "+0",
        mount: "fore"
      }
    ],
    typical_improvements: ["Ram", "Reinforced Hull", "Improved Oars"]
  },
  man_o_war: {
    name: "Man-o'-War",
    size: "Colossal",
    cost: 50000,
    base_ac: 2,
    touch_ac: 2,
    hardness: 10,
    max_hp: 1620,
    cmb: 10,
    cmd: 20,
    saves: 14,
    initiative: 2,
    max_speed: 90,
    acceleration: 15,
    propulsion: "wind/current",
    min_crew: 80,
    max_crew: 120,
    cargo_capacity: 200000, // 100 tons
    max_passengers: 200,
    decks: 4,
    weapons: 30,
    ramming_damage: "10d8"
  },
  // Skull & Shackles Style Ships (Generic Types)
  three_masted_ship: {
    name: "Three-Masted Ship",
    size: "Colossal",
    cost: 15000,
    base_ac: 2,
    touch_ac: 2,
    hardness: 5,
    max_hp: 900,
    cmb: 8,
    cmd: 18,
    saves: 2,
    initiative: 1,
    max_speed: 90,
    acceleration: 15,
    propulsion: "wind/current",
    min_crew: 25,
    max_crew: 35,
    cargo_capacity: 300000, // 150 tons
    max_passengers: 150,
    decks: 3,
    weapons: 12,
    ramming_damage: "8d8",
    sails_oars: "90 squares of sails (3 masts)",
    sailing_check_bonus: 0,
    typical_weapons: [
      {
        name: "Light Ballista",
        type: "direct-fire",
        range: "120 ft",
        crew: 1,
        aim: 2,
        load: 3,
        damage: "3d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+6",
        mount: "port"
      }
    ],
    typical_improvements: ["Reinforced Hull", "Improved Rigging"]
  },
  improved_three_masted_ship: {
    name: "Improved Three-Masted Ship",
    size: "Colossal",
    cost: 18000,
    base_ac: 3,
    touch_ac: 3,
    hardness: 6,
    max_hp: 950,
    cmb: 8,
    cmd: 18,
    saves: 3,
    initiative: 1,
    max_speed: 95,
    acceleration: 15,
    propulsion: "wind/current",
    min_crew: 22,
    max_crew: 32,
    cargo_capacity: 280000,
    max_passengers: 140,
    decks: 3,
    weapons: 8,
    ramming_damage: "8d8",
    sails_oars: "100 squares of sails (3 masts)",
    sailing_check_bonus: 1,
    typical_weapons: [
      {
        name: "Light Ballista",
        type: "direct-fire",
        range: "120 ft",
        crew: 1,
        aim: 2,
        load: 3,
        damage: "3d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+7",
        mount: "starboard"
      }
    ],
    typical_improvements: ["Reinforced Hull", "Improved Steering", "Silk Sails"]
  },
  heavy_warship: {
    name: "Heavy Warship",
    size: "Colossal",
    cost: 75000,
    base_ac: 19,
    touch_ac: 2,
    hardness: 7,
    max_hp: 1620,
    cmb: 12,
    cmd: 22,
    saves: 14,
    initiative: 3,
    max_speed: 100,
    acceleration: 20,
    propulsion: "wind/current",
    min_crew: 100,
    max_crew: 160,
    cargo_capacity: 250000,
    max_passengers: 250,
    decks: 4,
    weapons: 20,
    ramming_damage: "12d8",
    sails_oars: "200 squares of sails (4 masts)",
    sailing_check_bonus: 2,
    typical_weapons: [
      {
        name: "Heavy Ballista",
        type: "direct-fire",
        range: "180 ft",
        crew: 3,
        aim: 2,
        load: 3,
        damage: "4d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+10",
        mount: "port"
      },
      {
        name: "Standard Catapult",
        type: "indirect-fire",
        range: "300 ft",
        crew: 3,
        aim: 3,
        load: 3,
        damage: "6d6",
        ammunition: "stone",
        critical: "x2",
        attack_bonus: "+9",
        mount: "fore"
      }
    ],
    typical_improvements: ["Ram", "Armored Hull", "Advanced Steering", "Rapid Deploy Sails"]
  },
  junk: {
    name: "Junk",
    size: "Colossal",
    cost: 12000,
    base_ac: 10,
    touch_ac: 2,
    hardness: 5,
    max_hp: 900,
    cmb: 16,
    cmd: 26,
    saves: 10,
    initiative: 2,
    max_speed: 85,
    acceleration: 20,
    propulsion: "wind/current",
    min_crew: 18,
    max_crew: 28,
    cargo_capacity: 200000,
    max_passengers: 120,
    decks: 2,
    weapons: 11,
    ramming_damage: "8d8",
    sails_oars: "80 squares of sails (2 masts, battened)",
    sailing_check_bonus: 1,
    typical_weapons: [
      {
        name: "Light Ballista",
        type: "direct-fire",
        range: "120 ft",
        crew: 1,
        aim: 2,
        load: 3,
        damage: "3d8",
        ammunition: "ballista bolt",
        critical: "19-20/x2",
        attack_bonus: "+8",
        mount: "port"
      },
      {
        name: "Standard Catapult",
        type: "indirect-fire",
        range: "300 ft",
        crew: 3,
        aim: 3,
        load: 3,
        damage: "6d6",
        ammunition: "stone",
        critical: "x2",
        attack_bonus: "+7",
        mount: "aft"
      }
    ],
    typical_improvements: ["Rapid Deploy Sails", "Silk Sails", "Reinforced Hull"]
  },
  // Specialized Vessels
  airship: {
    name: "Airship",
    size: "Colossal",
    cost: 50000,
    base_ac: 2,
    touch_ac: 2,
    hardness: 5,
    max_hp: 720,
    cmb: 8,
    cmd: 18,
    saves: 0,
    initiative: 0,
    max_speed: 100,
    acceleration: 30,
    propulsion: "magic/air current",
    min_crew: 0,
    max_crew: 15,
    cargo_capacity: 60000, // 30 tons
    max_passengers: 100,
    decks: 2,
    weapons: 6,
    ramming_damage: "8d8"
  },
  slave_galley: {
    name: "Slave Galley (Okeno)",
    size: "Colossal",
    cost: 66800,
    base_ac: 19,
    touch_ac: 4,
    hardness: 9,
    max_hp: 1638,
    cmb: 10,
    cmd: 20,
    saves: 16,
    initiative: 1,
    max_speed: 120,
    acceleration: 30,
    propulsion: "muscle/wind/current",
    min_crew: 180,
    max_crew: 250,
    cargo_capacity: 200000,
    max_passengers: 300,
    decks: 3,
    weapons: 13,
    ramming_damage: "10d8"
  },
  raft: {
    name: "Raft",
    size: "Large",
    cost: 100,
    base_ac: 9,
    touch_ac: 9,
    hardness: 5,
    max_hp: 50,
    cmb: 0,
    cmd: 10,
    saves: 0,
    initiative: 0,
    max_speed: 10,
    acceleration: 10,
    propulsion: "muscle/current",
    min_crew: 1,
    max_crew: 2,
    cargo_capacity: 1000,
    max_passengers: 6,
    decks: 1,
    weapons: 0,
    ramming_damage: "1d6"
  },
  folding_boat: {
    name: "Folding Boat (Magic)",
    size: "Large",
    cost: 7200,
    base_ac: 8,
    touch_ac: 8,
    hardness: 5,
    max_hp: 120,
    cmb: 2,
    cmd: 12,
    saves: 2,
    initiative: 0,
    max_speed: 25,
    acceleration: 15,
    propulsion: "muscle/wind",
    min_crew: 2,
    max_crew: 15,
    cargo_capacity: 3000,
    max_passengers: 15,
    decks: 1,
    weapons: 0,
    ramming_damage: "2d6"
  }
};

// Helper functions for ship type management
const getShipTypesList = () => {
  return Object.keys(SHIP_TYPES).map(key => ({
    key,
    name: SHIP_TYPES[key].name,
    size: SHIP_TYPES[key].size,
    cost: SHIP_TYPES[key].cost
  }));
};

const getShipTypeData = (typeKey) => {
  return SHIP_TYPES[typeKey] || null;
};

const getShipTypesBySize = (size) => {
  return Object.keys(SHIP_TYPES)
    .filter(key => SHIP_TYPES[key].size === size)
    .map(key => ({ key, ...SHIP_TYPES[key] }));
};

const getShipTypesByCost = (maxCost) => {
  return Object.keys(SHIP_TYPES)
    .filter(key => SHIP_TYPES[key].cost <= maxCost)
    .map(key => ({ key, ...SHIP_TYPES[key] }));
};

module.exports = {
  SHIP_TYPES,
  getShipTypesList,
  getShipTypeData,
  getShipTypesBySize,
  getShipTypesByCost
};
