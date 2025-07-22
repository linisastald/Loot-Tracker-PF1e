// Standard Pathfinder races for crew members
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

// Function to generate a random race
export const generateRandomRace = () => {
  return STANDARD_RACES[Math.floor(Math.random() * STANDARD_RACES.length)];
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
