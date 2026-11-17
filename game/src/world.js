// BEAMKEEPER — dunia permainan: 5 NIGHTS, boon antar malam, toko EMBER,
// penelusuran sinar, wisp bertipe, menang/kalah, skor terbaik, feats.
// Semua acak berasal dari satu generator seeded supaya permainan dan
// adegan screenshot deterministik untuk seed yang sama.

import {
  GRID_ROWS, GRID_COLS, LANTERN_ROW, DIR_E, DIR_S, DIR_W, DIR_N,
  MIRROR_SLASH, MIRROR_BACKSLASH, LAYOUT, DIFFICULTIES, LANTERN_FLAMES,
  SCORE_BRAZIER, SCORE_WISP, SCORE_TIME_PER_SECOND, SCORE_NIGHT_CLEAR,
  WISP_GRACE_SECONDS, NIGHTS_TOTAL, WISP_TYPES, NIGHT_WISP_POOL,
  BOON_ORDER, SHOP, FLARE_COOLDOWN, FLARE_DAMAGE,
} from './config.js';

export const EVENT_NONE = 0;
export const EVENT_WIN = 1;
export const EVENT_LOSE = 2;
export const EVENT_BURN = 4;
export const EVENT_LIT = 8;
export const EVENT_FLAME_LOST = 16;
export const EVENT_NIGHT_CLEAR = 32;

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_BOON = 'boon';
export const SCREEN_WIN = 'win';
export const SCREEN_LOSE = 'lose';

const BURN_TICK = 0.35;

export function makeRng(seed) {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REFLECT = {
  [MIRROR_SLASH]: { [DIR_E]: DIR_N, [DIR_N]: DIR_E, [DIR_W]: DIR_S, [DIR_S]: DIR_W },
  [MIRROR_BACKSLASH]: { [DIR_E]: DIR_S, [DIR_S]: DIR_E, [DIR_W]: DIR_N, [DIR_N]: DIR_W },
};

// ---- penyimpanan lokal (best, feats, last runs) — aman bila tak tersedia.
function lsGet(key, fallback) {
  try {
    const raw = window.localStorage.getItem(key);
    return raw === null ? fallback : JSON.parse(raw);
  } catch {
    return fallback;
  }
}
function lsSet(key, value) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Abaikan: skor terbaik hanya kemudahan, bukan kebutuhan.
  }
}
export function loadBest() { return lsGet('beamkeeper_best', 0); }
export function loadFeats() { return lsGet('beamkeeper_feats', []); }
export function loadRuns() { return lsGet('beamkeeper_runs', []); }

function freshGrid(rng) {
  const grid = [];
  for (let r = 0; r < GRID_ROWS; r += 1) {
    const row = [];
    for (let c = 0; c < GRID_COLS; c += 1) row.push({ type: 'empty', orient: null });
    grid.push(row);
  }
  for (const b of LAYOUT.braziers) grid[b.r][b.c] = { type: 'brazier', orient: null, lit: false };
  // Orientasi awal cermin diacak tiap malam — selalu ada yang harus diperbaiki.
  for (const m of LAYOUT.mirrors) {
    grid[m.r][m.c] = { type: 'mirror', orient: rng() < 0.5 ? MIRROR_SLASH : MIRROR_BACKSLASH };
  }
  for (const w of LAYOUT.walls) grid[w.r][w.c] = { type: 'wall', orient: null };
  return grid;
}

function gradeFor(flamesLost, timeFrac) {
  if (flamesLost === 0 && timeFrac >= 0.4) return 'S';
  if (flamesLost === 0) return 'A';
  if (flamesLost === 1) return 'B';
  return 'C';
}
const GRADE_VALUE = { S: 4, A: 3, B: 2, C: 1 };

export function createWorld(difficultyKey, seed) {
  const diff = DIFFICULTIES[difficultyKey] ?? DIFFICULTIES.normal;
  const world = { difficultyKey, diff, seed, rng: makeRng(seed), state: null };

  function newState() {
    return {
      screen: SCREEN_TITLE,
      night: 1,
      grid: freshGrid(world.rng),
      beamCells: new Set(),
      burnCells: new Set(),
      beamPath: [],
      braziersLit: 0,
      flames: LANTERN_FLAMES,
      maxFlames: LANTERN_FLAMES,
      score: 0,
      embers: 0,
      wispsBurned: 0,
      wispsBurnedNight: 0,
      flamesLostNight: 0,
      combo: 0,
      bestCombo: 0,
      timeLeft: diff.dawnSeconds,
      dawnTotal: diff.dawnSeconds,
      elapsed: 0,
      spawnQueue: [],
      wisps: [],
      particles: [],
      flashes: [],
      floaters: [],
      boons: [],
      boonChoices: [],
      bonusDawn: 0,
      bonusTimeNext: 0,
      wispBonus: 0,
      slowMult: 1,
      scoreBonusMult: 1,
      flareCooldown: 0,
      paused: false,
      nightStats: [],
      grades: [],
      totalGrade: '',
      newBest: false,
      best: loadBest(),
      feats: loadFeats(),
      runs: loadRuns(),
      won: false,
      over: false,
      loseReason: '',
      time: 0,
    };
  }

  world.reset = function reset() {
    world.rng = makeRng(seed);
    world.state = newState();
    traceBeam(world.state);
    return world.state;
  };

  world.scoreMult = function scoreMult() {
    return world.diff.mult * world.state.scoreBonusMult;
  };

  world.addScore = function addScore(base) {
    world.state.score += Math.round(base * world.scoreMult());
  };

  world.dawnFor = function dawnFor(night) {
    return Math.max(60, world.diff.dawnSeconds - (night - 1) * 8) + world.state.bonusDawn + world.state.bonusTimeNext;
  };

  // Susun jadwal kemunculan wisp malam ini (deterministik dari seed).
  world.buildQueue = function buildQueue(night) {
    const state = world.state;
    const dawn = state.dawnTotal;
    const count = 5 + night * 2;
    const pool = NIGHT_WISP_POOL[night];
    const queue = [];
    for (let i = 0; i < count; i += 1) {
      const at = WISP_GRACE_SECONDS + (i / count) * dawn * 0.8 + world.rng() * 1.5;
      const type = pool[Math.floor(world.rng() * pool.length)];
      queue.push({ at, type, row: Math.floor(world.rng() * GRID_ROWS) });
    }
    if (night === NIGHTS_TOTAL) queue.push({ at: 8, type: 'nightmaw', row: 3 });
    queue.sort((a, b) => a.at - b.at);
    state.spawnQueue = queue;
  };

  world.startNight = function startNight(night) {
    const state = world.state;
    state.night = night;
    state.grid = freshGrid(world.rng);
    state.wisps = [];
    state.particles = [];
    state.flashes = [];
    state.floaters = [];
    state.braziersLit = 0;
    state.wispsBurnedNight = 0;
    state.flamesLostNight = 0;
    state.combo = 0;
    state.elapsed = 0;
    state.dawnTotal = world.dawnFor(night);
    state.timeLeft = state.dawnTotal;
    state.bonusTimeNext = 0;
    state.flareCooldown = 0;
    state.paused = false;
    state.screen = SCREEN_PLAY;
    world.buildQueue(night);
    traceBeam(state);
  };

  world.startRun = function startRun() {
    world.reset();
    world.startNight(1);
  };

  world.rollBoons = function rollBoons() {
    const state = world.state;
    const owned = new Set(state.boons);
    const unowned = BOON_ORDER.filter((k) => !owned.has(k));
    const pool = unowned.length >= 3 ? unowned : [...unowned, ...BOON_ORDER.filter((k) => owned.has(k))];
    const picks = [];
    const bag = [...pool];
    while (picks.length < 3 && bag.length > 0) {
      const i = Math.floor(world.rng() * bag.length);
      picks.push(bag.splice(i, 1)[0]);
    }
    state.boonChoices = picks;
  };

  world.applyBoon = function applyBoon(key) {
    const state = world.state;
    if (!state.boonChoices.includes(key)) return false;
    state.boons.push(key);
    if (key === 'ember') {
      state.maxFlames += 1;
      state.flames = Math.min(state.maxFlames, state.flames + 1);
    } else if (key === 'longnight') state.bonusDawn += 25;
    else if (key === 'wispbane') state.wispBonus += 100;
    else if (key === 'stoneward') state.slowMult *= 0.85;
    else if (key === 'golden') state.scoreBonusMult *= 1.25;
    state.boonChoices = [];
    return true;
  };

  world.buyShop = function buyShop(key) {
    const state = world.state;
    const item = SHOP.find((s) => s.key === key);
    if (!item || state.embers < item.cost) return false;
    if (key === 'repair' && state.flames >= state.maxFlames) return false;
    state.embers -= item.cost;
    if (key === 'repair') state.flames += 1;
    else if (key === 'time') state.bonusTimeNext += 15;
    else if (key === 'reroll') world.rollBoons();
    return true;
  };

  world.activateFlare = function activateFlare() {
    const state = world.state;
    if (state.screen !== SCREEN_PLAY || state.paused || state.flareCooldown > 0) return false;
    state.flareCooldown = FLARE_COOLDOWN;
    let hit = 0;
    for (let i = state.wisps.length - 1; i >= 0; i -= 1) {
      const w = state.wisps[i];
      if (state.beamCells.has(`${w.r},${Math.floor(w.x)}`)) {
        hit += 1;
        damageWisp(world, w, FLARE_DAMAGE, i);
      }
    }
    addFloater(state, 3, 3, hit > 0 ? `FLARE! ${hit} WISP BURNED` : 'FLARE!', '#ffc94d');
    return true;
  };

  world.nightClear = function nightClear() {
    const state = world.state;
    const timeFrac = state.dawnTotal > 0 ? state.timeLeft / state.dawnTotal : 0;
    const grade = gradeFor(state.flamesLostNight, timeFrac);
    state.grades.push(grade);
    state.nightStats.push({
      night: state.night,
      wisps: state.wispsBurnedNight,
      braziers: state.braziersLit,
      grade,
      timeLeft: Math.ceil(state.timeLeft),
    });
    world.addScore(SCORE_NIGHT_CLEAR + Math.floor(state.timeLeft) * SCORE_TIME_PER_SECOND);
    addFloater(state, 3, 3, `NIGHT ${state.night} CLEAR — GRADE ${grade}`, '#7be495');
    unlockFeat(world, 'first-light');
    if (grade === 'S') unlockFeat(world, 'flawless');
    if (state.night >= NIGHTS_TOTAL) {
      finishRun(world, true);
      return EVENT_WIN;
    }
    state.screen = SCREEN_BOON;
    world.rollBoons();
    return EVENT_NIGHT_CLEAR;
  };

  world.reset();
  return world;
}

function unlockFeat(world, key) {
  const state = world.state;
  if (!state.feats.includes(key)) {
    state.feats.push(key);
    lsSet('beamkeeper_feats', state.feats);
  }
}

function finishRun(world, won) {
  const state = world.state;
  state.over = true;
  state.won = won;
  state.floaters = [];
  state.screen = won ? SCREEN_WIN : SCREEN_LOSE;
  if (won) {
    const avg = state.grades.reduce((s, g) => s + GRADE_VALUE[g], 0) / Math.max(1, state.grades.length);
    state.totalGrade = avg >= 3.5 ? 'S' : avg >= 2.5 ? 'A' : avg >= 1.5 ? 'B' : 'C';
    unlockFeat(world, 'dawnkeeper');
  }
  if (state.wispsBurned >= 10) unlockFeat(world, 'wispbane-10');
  if (state.score > state.best) {
    state.best = state.score;
    state.newBest = true;
    lsSet('beamkeeper_best', state.best);
  }
  const run = { score: state.score, nights: won ? NIGHTS_TOTAL : state.night - 1, won, date: new Date().toISOString().slice(0, 10) };
  const runs = [run, ...loadRuns()].slice(0, 3);
  lsSet('beamkeeper_runs', runs);
  state.runs = runs;
}

function addFloater(state, r, c, text, color) {
  state.floaters.push({ r, c, text, color, life: 1.6, max: 1.6 });
}

function burst(state, r, c, color) {
  for (let i = 0; i < 10; i += 1) {
    state.particles.push({
      r, c,
      dx: (Math.random() - 0.5) * 2.4,
      dy: (Math.random() - 0.5) * 2.4,
      life: 0.5 + Math.random() * 0.3,
      max: 0.8,
      color,
    });
  }
}

function damageWisp(world, w, amount, index) {
  const state = world.state;
  w.hp -= amount;
  if (w.hp > 0) return false;
  const col = Math.floor(w.x);
  state.wisps.splice(index, 1);
  state.wispsBurned += 1;
  state.wispsBurnedNight += 1;
  state.embers += 1;
  state.combo += 1;
  state.bestCombo = Math.max(state.bestCombo, state.combo);
  const type = WISP_TYPES[w.type];
  world.addScore(type.score + state.wispBonus);
  burst(state, w.r, col, '#c4b5fd');
  addFloater(state, w.r, col, `WISP BURNED +${Math.round((type.score + state.wispBonus) * world.scoreMult())}${state.combo >= 3 ? `  COMBO x${state.combo}` : ''}`, '#ffc94d');
  return true;
}

// Telusuri sinar dari lentera (masuk dari barat di LANTERN_ROW, ke timur).
export function traceBeam(state) {
  state.beamCells = new Set();
  state.beamPath = [];
  for (let r = 0; r < GRID_ROWS; r += 1) {
    for (let c = 0; c < GRID_COLS; c += 1) {
      const cell = state.grid[r][c];
      if (cell.type === 'brazier') cell.lit = false;
    }
  }
  let r = LANTERN_ROW;
  let c = -1;
  let dir = DIR_E;
  let guard = 0;
  while (guard < 200) {
    guard += 1;
    if (dir === DIR_E) c += 1;
    else if (dir === DIR_W) c -= 1;
    else if (dir === DIR_S) r += 1;
    else r -= 1;
    if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) break;
    const key = `${r},${c}`;
    if (state.beamCells.has(key)) break;
    state.beamCells.add(key);
    state.beamPath.push({ r, c, dir });
    const cell = state.grid[r][c];
    if (cell.type === 'wall') break;
    if (cell.type === 'brazier') {
      cell.lit = true;
      continue;
    }
    if (cell.type === 'mirror') dir = REFLECT[cell.orient][dir];
  }
  let lit = 0;
  for (let rr = 0; rr < GRID_ROWS; rr += 1) {
    for (let cc = 0; cc < GRID_COLS; cc += 1) {
      if (state.grid[rr][cc].type === 'brazier' && state.grid[rr][cc].lit) lit += 1;
    }
  }
  state.braziersLit = lit;
  // Sel yang terbakar: jalur sinar (+ sel tetangga bila Broad Beam dimiliki).
  state.burnCells = new Set(state.beamCells);
  if (state.boons.includes('broad')) {
    for (const key of state.beamCells) {
      const [br, bc] = key.split(',').map(Number);
      for (let dr = -1; dr <= 1; dr += 1) {
        for (let dc = -1; dc <= 1; dc += 1) {
          const nr = br + dr;
          const nc = bc + dc;
          if (nr >= 0 && nr < GRID_ROWS && nc >= 0 && nc < GRID_COLS) state.burnCells.add(`${nr},${nc}`);
        }
      }
    }
  }
  return lit;
}

export function rotateMirror(world, r, c) {
  const state = world.state;
  if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return false;
  const cell = state.grid[r][c];
  if (cell.type !== 'mirror') return false;
  const before = state.braziersLit;
  cell.orient = cell.orient === MIRROR_SLASH ? MIRROR_BACKSLASH : MIRROR_SLASH;
  traceBeam(state);
  const newlyLit = state.braziersLit - before;
  if (newlyLit > 0) {
    world.addScore(newlyLit * SCORE_BRAZIER);
    for (let rr = 0; rr < GRID_ROWS; rr += 1) {
      for (let cc = 0; cc < GRID_COLS; cc += 1) {
        if (state.grid[rr][cc].type === 'brazier' && state.grid[rr][cc].lit) {
          state.flashes.push({ r: rr, c: cc, life: 0.9, max: 0.9 });
        }
      }
    }
    addFloater(state, 3, 3, 'BRAZIER LIT!', '#7be495');
    return 'lit';
  }
  return 'rotated';
}

function spawnWisp(world, entry) {
  const state = world.state;
  const type = WISP_TYPES[entry.type];
  const speed = world.diff.wispSpeed * type.speed * (1 + (state.night - 1) * 0.12) * state.slowMult * (0.9 + world.rng() * 0.2);
  state.wisps.push({
    type: entry.type, r: entry.row, x: GRID_COLS - 0.5,
    speed, hp: type.hp, maxHp: type.hp, burnIn: 0,
    wobble: world.rng() * Math.PI * 2, size: type.size,
  });
}

export function stepWorld(world, dt) {
  const state = world.state;
  if (state.screen !== SCREEN_PLAY) return EVENT_NONE;
  if (state.over || state.paused) return EVENT_NONE;
  let events = EVENT_NONE;
  state.time += dt;
  state.elapsed += dt;
  state.timeLeft -= dt;
  if (state.flareCooldown > 0) state.flareCooldown = Math.max(0, state.flareCooldown - dt);

  while (state.spawnQueue.length > 0 && state.spawnQueue[0].at <= state.elapsed) {
    spawnWisp(world, state.spawnQueue.shift());
  }

  for (let i = state.wisps.length - 1; i >= 0; i -= 1) {
    const w = state.wisps[i];
    w.x -= w.speed * dt;
    w.wobble += dt * 3;
    const col = Math.floor(w.x);
    if (col >= 0 && col < GRID_COLS && state.burnCells.has(`${w.r},${col}`)) {
      w.burnIn += dt;
      if (w.burnIn >= BURN_TICK) {
        w.burnIn = 0;
        if (damageWisp(world, w, 1, i)) {
          events |= EVENT_BURN;
          continue;
        }
      }
    } else {
      w.burnIn = 0;
    }
    if (w.x <= 0.4) {
      state.wisps.splice(i, 1);
      state.flames -= 1;
      state.flamesLostNight += 1;
      state.combo = 0;
      burst(state, w.r, 0, '#ff5d73');
      addFloater(state, w.r, 0, 'LANTERN HIT! -1 FLAME', '#ff5d73');
      events |= EVENT_FLAME_LOST;
      if (state.flames <= 0) {
        finishRun(world, false);
        state.loseReason = 'flames';
        events |= EVENT_LOSE;
        return events;
      }
    }
  }

  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.c += p.dx * dt;
    p.r += p.dy * dt;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
  for (let i = state.flashes.length - 1; i >= 0; i -= 1) {
    state.flashes[i].life -= dt;
    if (state.flashes[i].life <= 0) state.flashes.splice(i, 1);
  }
  for (let i = state.floaters.length - 1; i >= 0; i -= 1) {
    state.floaters[i].life -= dt;
    if (state.floaters[i].life <= 0) state.floaters.splice(i, 1);
  }

  if (!state.over && state.braziersLit >= LAYOUT.braziers.length) {
    return world.nightClear();
  }
  if (!state.over && state.timeLeft <= 0) {
    state.timeLeft = 0;
    state.loseReason = 'dawn';
    finishRun(world, false);
    events |= EVENT_LOSE;
  }
  return events;
}

export function stepAmbient(world, dt) {
  world.state.time += dt;
  for (let i = world.state.floaters.length - 1; i >= 0; i -= 1) {
    world.state.floaters[i].life -= dt;
    if (world.state.floaters[i].life <= 0) world.state.floaters.splice(i, 1);
  }
}
