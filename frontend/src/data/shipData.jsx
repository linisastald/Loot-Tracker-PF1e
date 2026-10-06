// Ship improvements data for Skull & Shackles campaign
// Contains all standard ship improvements with descriptions and mechanical effects

const IMPROVEMENTS_BY_NAME = {
  'Additional Crew Quarters': {
    description: 'More space for sailors to sleep and eat. Ship may support 10% more passengers, but cargo capacity is reduced by 10%.',
    effects: {
      max_passengers: '+10%',
      cargo_capacity: '-10%'
    }
  },
  'Armored Plating': {
    description: 'Metal plates attached to the ship. Hull hit points increased by 15% and hardness increased by 4. Cargo capacity reduced by 15%, -1 penalty on sailing checks, waterborne speed reduced by 20%.',
    effects: {
      max_hp: '+15%',
      hardness: '+4',
      cargo_capacity: '-15%',
      sailing_check_bonus: '-1',
      waterborne_speed: '-20%'
    }
  },
  'Concealed Weapon Port': {
    description: 'Belowdecks reconstruction to house Large direct-fire siege engines. Each port reduces cargo capacity by 5 tons and requires DC 15 Perception to detect.',
    effects: {
      cargo_capacity: '-5 tons per port',
      hidden_weapons: true
    }
  },
  'Extended Keel': {
    description: 'Longer than usual keel makes ship more stable. Ship 10% longer, +1 bonus on sailing checks. Must be installed during construction.',
    effects: {
      sailing_check_bonus: '+1',
      ship_length: '+10%'
    }
  },
  'Figurehead': {
    description: 'Fanciful carvings on the bowsprit. Purely cosmetic with no game effect.',
    effects: {}
  },
  'Glass Bottom': {
    description: 'Wide windows in ship bottom for ocean viewing. Makes bottom only as strong as glass (hardness 1, hp 3).',
    effects: {
      bottom_hardness: 1,
      bottom_hp: 3
    }
  },
  'Hold Optimization': {
    description: 'Efficient remodeling of ship layout provides more storage room. Cargo capacity increased by 10%.',
    effects: {
      cargo_capacity: '+10%'
    }
  },
  'Improved Rudder': {
    description: 'Wide rudder makes ship more nimble, granting +1 bonus on all sailing checks.',
    effects: {
      sailing_check_bonus: '+1'
    }
  },
  'Magically Treated Control Device': {
    description: 'Ship\'s steering wheel or tiller is magically treated, doubling its hit points and hardness.',
    effects: {
      control_device_hp: 'x2',
      control_device_hardness: 'x2'
    }
  },
  'Magically Treated Hull': {
    description: 'Ship\'s hull is magically treated, doubling the ship\'s hit points and hardness.',
    effects: {
      max_hp: 'x2',
      hardness: 'x2'
    }
  },
  'Magically Treated Oars': {
    description: 'Ship\'s oars are magically treated, doubling their hit points and hardness.',
    effects: {
      oar_hp: 'x2',
      oar_hardness: 'x2'
    }
  },
  'Magically Treated Sails': {
    description: 'Ship\'s sails are magically treated, doubling their hit points and hardness.',
    effects: {
      sail_hp: 'x2',
      sail_hardness: 'x2'
    }
  },
  'Movable Deck': {
    description: 'Deck features can be rearranged to disguise ship as different vessel. Hidden mechanisms require DC 20 Perception to detect.',
    effects: {
      disguise_capability: true
    }
  },
  'Narrow Hull': {
    description: 'Slender hull design for slipping through smaller spaces. Ship beam decreased by 20%, cargo capacity reduced by 10%, +2 bonus on sailing checks. Must be installed during construction.',
    effects: {
      sailing_check_bonus: '+2',
      cargo_capacity: '-10%',
      ship_beam: '-20%'
    }
  },
  'Ram': {
    description: 'Bronze or iron-sheathed ram mounted on bow. Deals additional 2d8 ramming damage and ignores damage for first square of solid objects.',
    effects: {
      ramming_damage: '+2d8',
      ramming_special: 'Ignores first square damage'
    }
  },
  'Rapid-Deploy Sails': {
    description: 'Improved rigging allows sails to be raised and lowered much faster than normal.',
    effects: {
      sail_deployment: 'Faster'
    }
  },
  'Silk Sails': {
    description: 'High-quality silk sails provide better performance and durability than standard canvas sails.',
    effects: {
      sail_quality: 'Superior'
    }
  },
  'Smuggling Compartments': {
    description: 'Hidden cargo areas between bulkheads. Doesn\'t change cargo capacity. Holds 1 plunder per 2 compartments. DC 20 Perception to locate.',
    effects: {
      hidden_storage: '1 plunder per 2 compartments'
    }
  },
  'Sturdy Hull': {
    description: 'Additional supports and wood layers make hull thicker and more resilient. Hull hardness increased by 2, cargo capacity reduced by 10%.',
    effects: {
      hardness: '+2',
      cargo_capacity: '-10%'
    }
  },
  'Wooden Plating': {
    description: 'Additional wooden planks nailed to hull for protection. Hull hit points increased by 5%, hardness increased by 2, cargo capacity reduced by 10%, waterborne speed reduced by 10%.',
    effects: {
      max_hp: '+5%',
      hardness: '+2',
      cargo_capacity: '-10%',
      waterborne_speed: '-10%'
    }
  }
};

// Each improvement carries its own name (the object key) so it is typed once.
export const SHIP_IMPROVEMENTS = Object.fromEntries(
  Object.entries(IMPROVEMENTS_BY_NAME).map(([name, improvement]) => [name, { name, ...improvement }])
);

// Standard Pathfinder 1e Ship Weapons
export const SHIP_WEAPON_TYPES = [
  'Light Ballista',
  'Heavy Ballista',
  'Dragon Ballista',
  'Gate Breaker Ballista',
  'Light Catapult',
  'Standard Catapult',
  'Heavy Catapult',
  'Light Bombard',
  'Standard Bombard',
  'Heavy Bombard',
  'Cannon',
  'Ship\'s Cannon',
  'Carronade',
  'Corvus',
  'Ram',
  'Manticore\'s Tail',
  'Firedrake',
  'Firewyrm',
  'Springal Arrow',
  'Springal Rocket'
];
