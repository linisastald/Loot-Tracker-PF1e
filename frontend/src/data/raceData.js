// Weighted racial distribution for the Shackles region
// Based on Pathfinder lore about pirate demographics
const SHACKLES_RACIAL_WEIGHTS = {
  // Very Common (60% total)
  "Human": 45,           // "mostly human" - dominant population
  
  // Common (25% total) 
  "Half-Elf": 12,        // "comparatively high proportion of aiuvarins"
  "Half-Orc": 8,         // "comparatively high proportion of dromaars"  
  "Tengu": 5,            // "large tengu population" with own quarters
  
  // Uncommon (12% total)
  "Hobgoblin": 4,        // "significant population" (Bandu Fleet)
  "Goblin": 3,           // "tribes of goblins" in wilder areas
  "Elf": 2,              // Some present but not specifically mentioned as common
  "Dwarf": 2,            // Maritime dwarves, traders
  "Halfling": 1,         // Wanderers, ship cooks, etc.
  
  // Rare (3% total)
  "Gnome": 1,            // Occasional wanderers
  "Tiefling": 1,         // Outcasts drawn to pirate havens  
  "Aasimar": 0.5,        // Very rare, most avoid pirate life
  "Orc": 0.3,            // Pure orcs rare, mostly dromaars instead
  
  // Very Rare (0.8% total)
  "Catfolk": 0.15,       // Rare wanderers from distant lands
  "Ratfolk": 0.1,        // Occasional ship rats who gained sentience
  "Lizardfolk": 0.1,     // From coastal swamps, very uncommon
  "Dragonborn": 0.08,    // Extremely rare, powerful outcasts
  "Merfolk": 0.07,       // Occasional sea-dwellers who join crews
  "Grippli": 0.05,       // Rare frog-folk from jungles
  "Nagaji": 0.05,        // Serpentine humanoids, very uncommon
  "Undine": 0.04,        // Water elementals, drawn to seas but rare
  "Ifrit": 0.03,         // Fire elementals, some drawn to adventure
  "Sylph": 0.03,         // Air elementals, occasional sky pirates
  "Vishkanya": 0.03,     // Poison-wielders, assassins
  "Samsaran": 0.02,      // Ancient souls, extremely rare
  "Kitsune": 0.02,       // Shapeshifting fox-folk, very secretive
  "Vanara": 0.02,        // Monkey-folk from distant jungles
  "Wayang": 0.02,        // Shadow-touched, prefer hiding
  "Oread": 0.01          // Earth elementals, least likely to take to sea
};

// Create weighted array for selection
function createWeightedRaceArray() {
  const weightedArray = [];
  
  // Convert weights to selection pool
  Object.entries(SHACKLES_RACIAL_WEIGHTS).forEach(([race, weight]) => {
    // Multiply by 100 to handle decimal weights and add to array
    const instances = Math.round(weight * 100);
    for (let i = 0; i < instances; i++) {
      weightedArray.push(race);
    }
  });
  
  return weightedArray;
}

// Pre-create the weighted array for performance
const WEIGHTED_RACE_ARRAY = createWeightedRaceArray();

// Standard Pathfinder races for crew members (all available races)
export const STANDARD_RACES = [
  'Human',
  'Elf',
  'Half-Elf',
  'Dwarf',
  'Halfling',
  'Gnome',
  'Half-Orc',
  'Tiefling',
  'Aasimar',
  'Dragonborn',
  'Catfolk',
  'Ratfolk',
  'Tengu',
  'Goblin',
  'Hobgoblin',
  'Orc',
  'Lizardfolk',
  'Grippli',
  'Nagaji',
  'Samsaran',
  'Vanara',
  'Vishkanya',
  'Wayang',
  'Kitsune',
  'Merfolk',
  'Undine',
  'Sylph',
  'Ifrit',
  'Oread'
];

// Random name generation lists
export const RANDOM_NAMES = {
  first: [
    // Human names
    'Aelar', 'Aerdel', 'Ahvak', 'Aramil', 'Aranon', 'Berris', 'Cithreth', 'Dayereth', 'Enna', 'Galinndan',
    'Hadarai', 'Halimath', 'Heian', 'Himo', 'Immeral', 'Ivellios', 'Korfel', 'Lamlis', 'Laucian', 'Mindartis',
    'Naal', 'Nutae', 'Paelynn', 'Peren', 'Quarion', 'Riardon', 'Rolen', 'Silvyr', 'Suhnaal', 'Thamior',
    'Theriatis', 'Therivan', 'Uthemar', 'Vanuath', 'Varis',
    
    // Female names
    'Adrie', 'Althaea', 'Anastrianna', 'Andraste', 'Antinua', 'Bethrynna', 'Birel', 'Caelynn', 'Dara', 'Enna',
    'Galinndan', 'Hadarai', 'Immeral', 'Ivellios', 'Laucian', 'Mindartis', 'Naal', 'Nutae', 'Paelynn', 'Peren',
    'Quarion', 'Riardon', 'Rolen', 'Silvyr', 'Suhnaal', 'Thamior', 'Theriatis', 'Therivan', 'Uthemar', 'Vanuath',
    
    // More diverse names
    'Zara', 'Malik', 'Kira', 'Jovan', 'Elena', 'Dmitri', 'Anya', 'Viktor', 'Natasha', 'Boris',
    'Akira', 'Kenji', 'Yuki', 'Hiroshi', 'Sakura', 'Takeshi', 'Mei', 'Ryo', 'Nori', 'Shin',
    'Diego', 'Carlos', 'Maria', 'Rosa', 'Miguel', 'Carmen', 'Pablo', 'Sofia', 'Luis', 'Ana'
  ],
  
  last: [
    'Amakir', 'Amakura', 'Galanodel', 'Holimion', 'Liadon', 'Meliamne', 'Nailo', 'Siannodel', 'Xiloscient',
    'Alderleaf', 'Brushgather', 'Goodbarrel', 'Greenbottle', 'High-hill', 'Hilltopple', 'Leagallow', 'Tealeaf',
    'Thorngage', 'Tosscobble', 'Underbough', 'Axebreaker', 'Battlehammer', 'Brawnanvil', 'Dankil', 'Fireforge',
    'Frostbeard', 'Gorunn', 'Holderhek', 'Ironfist', 'Loderr', 'Lutgehr', 'Rumnaheim', 'Strakeln', 'Torunn',
    'Ungart', 'Vondal', 'Beren', 'Daergel', 'Folkor', 'Frick', 'Funk', 'Gunnloda', 'Hurd', 'Klaedris',
    'Krieg', 'Kuik', 'Murnig', 'Musadobar', 'Orlyck', 'Portyllo', 'Rockseeker', 'Rudrik', 'Stonehill',
    'Torbera', 'Torgga', 'Vistra',
    
    // More diverse surnames
    'Blackwater', 'Stormwind', 'Ironclad', 'Goldleaf', 'Silverstone', 'Redmane', 'Whitehawk', 'Greycloak',
    'Shadowbane', 'Lightbringer', 'Nightfall', 'Dawnbreaker', 'Starweaver', 'Moonwhisper', 'Sunblade',
    'Rivercross', 'Hillborn', 'Valeheart', 'Forestwalker', 'Seaborn', 'Windcaller', 'Flameheart', 'Frostborn'
  ]
};

// Function to generate a random name
export const generateRandomName = () => {
  const firstName = RANDOM_NAMES.first[Math.floor(Math.random() * RANDOM_NAMES.first.length)];
  const lastName = RANDOM_NAMES.last[Math.floor(Math.random() * RANDOM_NAMES.last.length)];
  return `${firstName} ${lastName}`;
};

// Function to generate a weighted random race based on Shackles demographics
export const generateRandomRace = () => {
  return WEIGHTED_RACE_ARRAY[Math.floor(Math.random() * WEIGHTED_RACE_ARRAY.length)];
};

// Function to generate an unweighted random race (for manual selection lists)
export const generateUnweightedRandomRace = () => {
  return STANDARD_RACES[Math.floor(Math.random() * STANDARD_RACES.length)];
};

// Function to get the weight of a specific race (for debugging/info)
export const getRaceWeight = (race) => {
  return SHACKLES_RACIAL_WEIGHTS[race] || 0;
};

// Function to generate a random age based on race
export const generateRandomAge = (race) => {
  const ageRanges = {
    'Human': [16, 60],
    'Elf': [100, 500],
    'Half-Elf': [20, 150],
    'Dwarf': [40, 250],
    'Halfling': [20, 100],
    'Gnome': [40, 300],
    'Half-Orc': [14, 50],
    'Tiefling': [20, 120],
    'Aasimar': [20, 120],
    'Dragonborn': [15, 80],
    'Catfolk': [15, 70],
    'Ratfolk': [12, 60],
    'Tengu': [15, 70],
    'Goblin': [12, 40],
    'Hobgoblin': [14, 60],
    'Orc': [12, 45],
    'Lizardfolk': [14, 80],
    'Grippli': [12, 50],
    'Nagaji': [20, 90],
    'Samsaran': [60, 800],
    'Vanara': [14, 60],
    'Vishkanya': [20, 120],
    'Wayang': [40, 300],
    'Kitsune': [15, 75],
    'Merfolk': [20, 150],
    'Undine': [60, 300],
    'Sylph': [60, 300],
    'Ifrit': [60, 300],
    'Oread': [60, 300]
  };
  
  const range = ageRanges[race] || [16, 60]; // Default to human range
  return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
};
