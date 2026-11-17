// BEAMKEEPER — konstanta permainan.
// Grid 7x7, 5 NIGHTS. Lentera di tepi kiri (baris 3) memancarkan sinar ke
// kanan. Tiap malam: nyalakan semua anglo sebelum fajar sambil wisp
// menyerang lentera. Antar malam: pilih 1 dari 3 boon + belanja pakai EMBER.

export const GRID_ROWS = 7;
export const GRID_COLS = 7;
export const NIGHTS_TOTAL = 5;

// Baris tempat lentera berdiri dan sinar masuk ke grid.
export const LANTERN_ROW = 3;

// Arah sinar: 0 timur, 1 selatan, 2 barat, 3 utara.
export const DIR_E = 0;
export const DIR_S = 1;
export const DIR_W = 2;
export const DIR_N = 3;

// Cermin '/' memantulkan E<->N dan W<->S; cermin '\' memantulkan E<->S dan W<->N.
export const MIRROR_SLASH = '/';
export const MIRROR_BACKSLASH = '\\';

// Tata letak dasar papan (baris, kolom). Orientasi awal diacak tiap malam
// dari seed — pemain harus memutar cermin jalur agar semua anglo menyala.
export const LAYOUT = {
  braziers: [
    { r: 5, c: 2 },
    { r: 6, c: 4 },
    { r: 1, c: 6 },
  ],
  // Cermin jalur solusi (solusi = orientasi yang benar) + pengecoh.
  mirrors: [
    { r: 3, c: 2, solution: MIRROR_BACKSLASH },
    { r: 6, c: 2, solution: MIRROR_BACKSLASH },
    { r: 6, c: 6, solution: MIRROR_SLASH },
    { r: 1, c: 3, solution: MIRROR_SLASH },
    { r: 4, c: 5, solution: MIRROR_BACKSLASH },
  ],
  walls: [
    { r: 2, c: 4 },
    { r: 4, c: 1 },
  ],
};

// Tingkat kesulitan: kecepatan wisp, lama fajar malam 1, pengali skor.
export const DIFFICULTIES = {
  easy: { label: 'Dusk', mult: 1.0, wispSpeed: 0.55, dawnSeconds: 150, blurb: 'Relaxed — slow wisps, long dawn.' },
  normal: { label: 'Midnight', mult: 1.25, wispSpeed: 0.8, dawnSeconds: 110, blurb: 'Balanced — a steady rhythm.' },
  hard: { label: 'Dawn Gate', mult: 1.5, wispSpeed: 1.15, dawnSeconds: 80, blurb: 'A race — fast wisps, short dawn.' },
};
export const DIFFICULTY_ORDER = ['easy', 'normal', 'hard'];
export const DEFAULT_DIFFICULTY = 'normal';

export const LANTERN_FLAMES = 3;
export const SCORE_BRAZIER = 1000;
export const SCORE_WISP = 150;
export const SCORE_TIME_PER_SECOND = 10;
export const SCORE_NIGHT_CLEAR = 500;
export const WISP_GRACE_SECONDS = 3;
export const FLARE_COOLDOWN = 20;
export const FLARE_DAMAGE = 2;

// Jenis wisp — nama dan perilaku buatan sendiri.
export const WISP_TYPES = {
  mote: { name: 'Mote', hp: 1, speed: 1.0, size: 0.55, score: 150, blurb: 'Drifts slowly toward the lantern.' },
  drift: { name: 'Drift', hp: 1, speed: 1.55, size: 0.5, score: 150, blurb: 'Darts quickly along its row.' },
  husk: { name: 'Husk', hp: 2, speed: 0.7, size: 0.75, score: 300, blurb: 'Thick shell — takes two burns.' },
  gloom: { name: 'Gloom', hp: 1, speed: 1.3, size: 0.62, score: 200, blurb: 'Weaves and flickers, hard to track.' },
  nightmaw: { name: 'Nightmaw', hp: 3, speed: 0.6, size: 1.05, score: 450, blurb: 'Night 5 boss — three burns to drive off.' },
};
// Jenis yang muncul tiap malam (malam 5 menambah bos).
export const NIGHT_WISP_POOL = {
  1: ['mote'],
  2: ['mote', 'drift'],
  3: ['mote', 'drift', 'husk'],
  4: ['mote', 'drift', 'husk', 'gloom'],
  5: ['mote', 'drift', 'husk', 'gloom'],
};

// Boon — upgrade antar malam. Nama dan efek buatan sendiri.
export const BOONS = {
  broad: { name: 'Broad Beam', family: 'Beam', rarity: 'Rare', blurb: 'The beam also burns wisps in cells beside the beam path.', synergy: 'Synergy: pairs with Wispbane Oil — more burns, more score.' },
  ember: { name: 'Ember Heart', family: 'Lantern', rarity: 'Rare', blurb: '+1 max flame and restore 1 flame now.', synergy: 'Synergy: pairs with Stone Ward — the lantern grows harder to snuff out.' },
  longnight: { name: 'Long Night', family: 'Time', rarity: 'Common', blurb: '+25s of dawn on every later night.', synergy: 'Synergy: pairs with Golden Hour — more time, bigger bonus.' },
  wispbane: { name: 'Wispbane Oil', family: 'Beam', rarity: 'Common', blurb: 'A burned wisp gives +100 score.', synergy: 'Synergy: pairs with Broad Beam — burn wider, harvest bigger.' },
  stoneward: { name: 'Stone Ward', family: 'Lantern', rarity: 'Common', blurb: 'Wisps move 15% slower.', synergy: 'Synergy: pairs with Ember Heart — layered defense for the lantern.' },
  golden: { name: 'Golden Hour', family: 'Score', rarity: 'Epic', blurb: '+25% to all score gained.', synergy: 'Synergy: pairs with Long Night — the time bonus grows too.' },
};
export const BOON_ORDER = ['broad', 'ember', 'longnight', 'wispbane', 'stoneward', 'golden'];

// Toko antar malam — mata uang EMBER (1 per wisp terbakar).
export const SHOP = [
  { key: 'repair', name: 'Repair Flame', cost: 3, blurb: 'Restore 1 lantern flame.' },
  { key: 'time', name: 'Borrowed Time', cost: 2, blurb: '+15s of dawn next night.' },
  { key: 'reroll', name: 'Reroll Boons', cost: 1, blurb: 'Re-roll the 3 boon cards.' },
];

// Satu palet koheren: malam indigo + emas sinar + ember oranye + ungu wisp.
export const COLORS = {
  skyTop: '#0b1026',
  skyBottom: '#131a38',
  star: '#cdd6ff',
  board: '#141b3a',
  boardEdge: '#2c3566',
  tile: '#1b2247',
  tileAlt: '#1e2650',
  tileHover: '#2a3468',
  gridLine: '#2c3566',
  beam: '#ffc94d',
  beamCore: '#fff3c4',
  beamGlow: 'rgba(255, 201, 77, 0.55)',
  lanternBody: '#8a6a2f',
  lanternGlow: 'rgba(255, 190, 90, 0.5)',
  flame: '#ff7a3d',
  flameCore: '#ffe9a8',
  brazierStone: '#3a3f5c',
  brazierLit: '#ff7a3d',
  mirror: '#9fb4d8',
  mirrorEdge: '#d7e3ff',
  wall: '#4a4f6e',
  wallTop: '#5d6284',
  wisp: '#9b7bff',
  wispCore: '#c4b5fd',
  wispSmoke: 'rgba(155, 123, 255, 0.35)',
  text: '#f5efe0',
  textDim: '#aab3d6',
  panel: 'rgba(20, 27, 58, 0.94)',
  panelSolid: '#141b3a',
  panelEdge: '#4a548f',
  accent: '#ffc94d',
  ember: '#ff7a3d',
  danger: '#ff5d73',
  good: '#7be495',
  card: '#1b2247',
  cardEdge: '#3a4470',
};

// Langkah simulasi tetap (detik) supaya adegan screenshot deterministik.
export const STEP = 1 / 60;
