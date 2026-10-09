// Static data and small helpers for the Infamy page (Skulls & Shackles).

export interface InfamyThreshold {
    /** Key of the matching group in the /infamy/impositions response. */
    key: 'disgraceful' | 'despicable' | 'notorious' | 'loathsome' | 'vile';
    title: string;
    /** Minimum infamy for this threshold. */
    min: number;
    /** Favored ports the ship may have once this threshold is reached. */
    favoredPorts: number;
    benefits: string[];
}

/** The five infamy thresholds, lowest first. */
export const INFAMY_THRESHOLDS: InfamyThreshold[] = [
    {
        key: 'disgraceful', title: 'Disgraceful', min: 10, favoredPorts: 1,
        benefits: [
            'Characters may purchase disgraceful impositions.',
            'The PCs may choose one favored port. They gain a +2 bonus on all Infamy checks made at that port.',
        ],
    },
    {
        key: 'despicable', title: 'Despicable', min: 20, favoredPorts: 1,
        benefits: [
            'Characters may purchase despicable impositions.',
            'Once per week, the PCs can sacrifice a prisoner or crew member to immediately gain 1d3 points of Disrepute.',
        ],
    },
    {
        key: 'notorious', title: 'Notorious', min: 30, favoredPorts: 2,
        benefits: [
            'Characters may purchase notorious impositions.',
            'Disgraceful impositions can be purchased for half price (rounded down).',
            'The PCs may choose a second favored port. They gain a +2 bonus on all Infamy checks made at this port and a +4 bonus at their first favored port.',
        ],
    },
    {
        key: 'loathsome', title: 'Loathsome', min: 40, favoredPorts: 2,
        benefits: [
            'Characters may purchase loathsome impositions.',
            'Despicable impositions can be purchased for half price (rounded down).',
            'PCs gain a +5 bonus on skill checks made to sell plunder.',
        ],
    },
    {
        key: 'vile', title: 'Vile', min: 55, favoredPorts: 3,
        benefits: [
            'Characters may purchase vile impositions.',
            'Notorious impositions can be purchased for half price (rounded down).',
            'Disgraceful impositions are free.',
            'The PCs may choose a third favored port. They gain a +2 bonus on all Infamy checks made at this port, a +4 bonus at their second favored port, and a +6 bonus at their first favored port.',
        ],
    },
];

/** Minimum infamy of the first threshold (Disgraceful). */
export const FIRST_THRESHOLD = INFAMY_THRESHOLDS[0].min;

/** Infamy points each port can contribute per threshold. */
export const MAX_PORT_INFAMY = 5;

/** Numeric threshold (0 below Disgraceful); port visits are tracked per threshold. */
export const getThresholdValue = (infamy: number): number =>
    INFAMY_THRESHOLDS.reduce((reached, t) => (infamy >= t.min ? t.min : reached), 0);

/** Sphere of influence in miles: 100 plus 100 per threshold reached. */
export const getSphereOfInfluence = (infamy: number): number =>
    100 + 100 * INFAMY_THRESHOLDS.filter((t) => infamy >= t.min).length;

/** How many favored ports the ship may have at this infamy. */
export const getMaxFavoredPorts = (infamy: number): number =>
    INFAMY_THRESHOLDS.reduce((slots, t) => (infamy >= t.min ? t.favoredPorts : slots), 0);

/** Ports of the Shackles a crew can boast at. */
export const SHACKLES_PORTS: string[] = [
    'Alendruan Harbor', 'Arena', 'Banukmaud', 'Beachcomber', 'Blackblood Cay',
    'Bogsbridge', 'Chalk Harbor', 'Cho-Tzu', 'Colvaas Gibbet', 'Downpour',
    'Dragonsthrall', 'Drenchport', 'Drowning Rock', 'Falchion Point', 'Fort Benbem',
    'Fort Holiday', 'Ganagsau', 'Genzei', 'Ghrinitshahara', 'Goatshead',
    'Haigui Wan', 'Halabad', 'Heggapnod', 'Hell Harbor', 'Heslandaena',
    'Kora', 'Kukgukmol', 'Lilywhite', 'Little Oppara', 'Maidenspool',
    'Mezdrubal', 'Moak Harbor', 'Myscurial', 'Neruma', 'Ngozu',
    'Ollo', 'Oyster Cay', 'Parley Point', 'Peshaka Naeu', 'Pex',
    'Plumetown', 'Port Peril', 'Queen Bes', 'Quent', 'Raketooth',
    'Rapier Bay', "Rickety's Squibs", 'Robu', 'Rumbutter', 'Slipcove',
    'Tyvas-Devas', 'Vezhnu', 'Vilelock', 'Yelligo Wharf', 'Zeibo',
    'Zhenbarghua',
];
