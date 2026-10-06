// Pathfinder races for crew members. Each race has a relative weight in the Shackles
// (used by generateRandomRace; based on Pathfinder lore about pirate demographics:
// mostly human, a comparatively high proportion of half-elves and half-orcs, a large
// tengu population, hobgoblins of the Bandu Fleet, the rest rare) and an age range
// [min, max] in years for generateRandomAge. Official Paizo races only: dragonborn is
// not a Pathfinder 1e race (it appears nowhere in the PRD).
const RACES = {
  'Human': { weight: 45, age: [16, 60] },
  'Elf': { weight: 2, age: [100, 500] },
  'Half-Elf': { weight: 12, age: [20, 150] },
  'Dwarf': { weight: 2, age: [40, 250] },
  'Halfling': { weight: 1, age: [20, 100] },
  'Gnome': { weight: 1, age: [40, 300] },
  'Half-Orc': { weight: 8, age: [14, 50] },
  'Tiefling': { weight: 1, age: [20, 120] },
  'Aasimar': { weight: 0.5, age: [20, 120] },
  'Catfolk': { weight: 0.15, age: [15, 70] },
  'Ratfolk': { weight: 0.1, age: [12, 60] },
  'Tengu': { weight: 5, age: [15, 70] },
  'Goblin': { weight: 3, age: [12, 40] },
  'Hobgoblin': { weight: 4, age: [14, 60] },
  'Orc': { weight: 0.3, age: [12, 45] },
  'Lizardfolk': { weight: 0.1, age: [14, 80] },
  'Grippli': { weight: 0.05, age: [12, 50] },
  'Nagaji': { weight: 0.05, age: [20, 90] },
  'Samsaran': { weight: 0.02, age: [60, 800] },
  'Vanara': { weight: 0.02, age: [14, 60] },
  'Vishkanya': { weight: 0.03, age: [20, 120] },
  'Wayang': { weight: 0.02, age: [40, 300] },
  'Kitsune': { weight: 0.02, age: [15, 75] },
  'Merfolk': { weight: 0.07, age: [20, 150] },
  'Undine': { weight: 0.04, age: [60, 300] },
  'Sylph': { weight: 0.03, age: [60, 300] },
  'Ifrit': { weight: 0.03, age: [60, 300] },
  'Oread': { weight: 0.01, age: [60, 300] }
};

// Weighted selection pool; weights are multiplied by 100 so decimals survive rounding.
const WEIGHTED_RACE_ARRAY = Object.entries(RACES).flatMap(([race, { weight }]) =>
  Array(Math.round(weight * 100)).fill(race)
);

// All races available for crew members
export const STANDARD_RACES = Object.keys(RACES);

// Random name generation lists
export const RANDOM_NAMES = {
  first: [
    'Aelar', 'Aerdel', 'Ahvak', 'Aramil', 'Aranon', 'Berris', 'Cithreth', 'Dayereth', 'Enna',
    'Galinndan', 'Hadarai', 'Halimath', 'Heian', 'Himo', 'Immeral', 'Ivellios', 'Korfel', 'Lamlis',
    'Laucian', 'Mindartis', 'Naal', 'Nutae', 'Paelynn', 'Peren', 'Quarion', 'Riardon', 'Rolen',
    'Silvyr', 'Suhnaal', 'Thamior', 'Theriatis', 'Therivan', 'Uthemar', 'Vanuath', 'Varis', 'Adrie',
    'Althaea', 'Anastrianna', 'Andraste', 'Antinua', 'Bethrynna', 'Birel', 'Caelynn', 'Dara', 'Zara',
    'Malik', 'Kira', 'Jovan', 'Elena', 'Dmitri', 'Anya', 'Viktor', 'Natasha', 'Boris',
    'Akira', 'Kenji', 'Yuki', 'Hiroshi', 'Sakura', 'Takeshi', 'Mei', 'Ryo', 'Nori',
    'Shin', 'Diego', 'Carlos', 'Maria', 'Rosa', 'Miguel', 'Carmen', 'Pablo', 'Sofia',
    'Luis', 'Ana'
  ],

  last: [
    'Amakir', 'Amakura', 'Galanodel', 'Holimion', 'Liadon', 'Meliamne', 'Nailo', 'Siannodel', 'Xiloscient',
    'Alderleaf', 'Brushgather', 'Goodbarrel', 'Greenbottle', 'High-hill', 'Hilltopple', 'Leagallow', 'Tealeaf', 'Thorngage',
    'Tosscobble', 'Underbough', 'Axebreaker', 'Battlehammer', 'Brawnanvil', 'Dankil', 'Fireforge', 'Frostbeard', 'Gorunn',
    'Holderhek', 'Ironfist', 'Loderr', 'Lutgehr', 'Rumnaheim', 'Strakeln', 'Torunn', 'Ungart', 'Vondal',
    'Beren', 'Daergel', 'Folkor', 'Frick', 'Funk', 'Gunnloda', 'Hurd', 'Klaedris', 'Krieg',
    'Kuik', 'Murnig', 'Musadobar', 'Orlyck', 'Portyllo', 'Rockseeker', 'Rudrik', 'Stonehill', 'Torbera',
    'Torgga', 'Vistra', 'Blackwater', 'Stormwind', 'Ironclad', 'Goldleaf', 'Silverstone', 'Redmane', 'Whitehawk',
    'Greycloak', 'Shadowbane', 'Lightbringer', 'Nightfall', 'Dawnbreaker', 'Starweaver', 'Moonwhisper', 'Sunblade', 'Rivercross',
    'Hillborn', 'Valeheart', 'Forestwalker', 'Seaborn', 'Windcaller', 'Flameheart', 'Frostborn'
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

// Function to generate a random age based on race
export const generateRandomAge = (race) => {
  const range = RACES[race]?.age || RACES.Human.age; // Default to human range
  return Math.floor(Math.random() * (range[1] - range[0] + 1)) + range[0];
};
