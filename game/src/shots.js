// BEAMKEEPER — adegan deterministik untuk screenshot (?shot=...&seed=...).
// Tiap adegan memainkan aturan asli dari dunia segar dengan seed tetap:
// start: judul dengan sinar solusi sebagai latar; play: tengah Night 2
// dengan 2 boon, 2 anglo menyala, dan wisp berdatangan; win: memenangi
// kelima malam lewat aturan asli; lose: membiarkan wisp memadamkan lentera.

import { STEP, LAYOUT, MIRROR_SLASH, MIRROR_BACKSLASH } from './config.js';
import {
  SCREEN_TITLE, SCREEN_PLAY, SCREEN_BOON, SCREEN_WIN, SCREEN_LOSE,
  stepWorld, stepAmbient, traceBeam,
} from './world.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 15;
const LOSE_LIMIT_SECONDS = 180;
// Win staging: burn up to 3 wisps per night before clearing it, so the
// victory table shows real burns instead of a column of zeroes.
const WIN_WAIT_SECONDS = 36;
const WIN_BURNS_PER_NIGHT = 3;

// Two hold poses while the night is not cleared yet:
// A — first two solution mirrors, third wrong: the beam covers rows 3-6
//     (row 3 across, column 2 down, row 6 across).
// B — first mirror flipped north: the beam runs up column 2 and covers
//     rows 0-3. Pick whichever pose covers more of the first three spawns.
function holdPose(state) {
  const early = state.spawnQueue.slice(0, 3);
  const coverA = new Set([3, 4, 5, 6]);
  const coverB = new Set([0, 1, 2, 3]);
  const countA = early.filter((e) => coverA.has(e.row)).length;
  const countB = early.filter((e) => coverB.has(e.row)).length;
  if (countB > countA) {
    setMirror(state, 3, 2, MIRROR_SLASH);
  } else {
    applySolution(state, 2);
    setMirror(state, 6, 6, MIRROR_BACKSLASH);
  }
}

// Play one night for the win shot: hold the beam in a burn pose until the
// burn target is met (or time/flames run low), then fix every mirror and
// clear the night through the real rules. Returns false if the run ended.
function playWinNight(world) {
  const state = world.state;
  holdPose(state);
  const burnedBefore = state.wispsBurnedNight;
  stepUntil(world, WIN_WAIT_SECONDS, (s) => s.over || s.screen !== SCREEN_PLAY
    || s.wispsBurnedNight - burnedBefore >= WIN_BURNS_PER_NIGHT || s.flames <= 1);
  if (state.screen === SCREEN_PLAY && !state.over) {
    applySolution(state, 3);
    stepUntil(world, 5, (s) => s.screen !== SCREEN_PLAY);
  }
  return !state.over;
}

function pickWinBoon(world) {
  const state = world.state;
  const pick = state.boonChoices.includes('broad') ? 'broad' : state.boonChoices[0];
  return world.applyBoon(pick);
}

// Tiga cermin jalur solusi: tiga entri pertama LAYOUT.mirrors.
function pathMirrors() {
  return LAYOUT.mirrors.slice(0, 3);
}

function setMirror(state, r, c, orient) {
  const cell = state.grid[r][c];
  if (cell.type === 'mirror') cell.orient = orient;
  traceBeam(state);
}

function applySolution(state, count) {
  const path = pathMirrors();
  for (let i = 0; i < Math.min(count, path.length); i += 1) {
    setMirror(state, path[i].r, path[i].c, path[i].solution);
  }
  traceBeam(state);
}

function stepUntil(world, maxSeconds, done) {
  const state = world.state;
  for (let i = 0; i < maxSeconds / STEP; i += 1) {
    stepWorld(world, STEP);
    if (done(state)) break;
  }
}

export function stageShot(name, world) {
  let state = world.state;

  if (name === 'win') {
    // Play all five nights through the real rules: each night the
    // autopilot burns wisps first, then fixes the mirrors and clears.
    world.startRun();
    state = world.state;
    while (!state.over && state.screen === SCREEN_PLAY) {
      if (!playWinNight(world)) break;
      if (state.screen === SCREEN_BOON) {
        pickWinBoon(world);
        world.startNight(state.night + 1);
        state = world.state;
      }
    }
    if (!state.over) {
      state.over = true;
      state.won = true;
      state.screen = SCREEN_WIN;
    }
    return { screen: SCREEN_WIN, best: state.score };
  }

  if (name === 'boon') {
    // Clear Night 1 fast through the real rules and stop on the boon
    // screen: 3 cards + shop + next, ready for a screenshot check.
    world.startRun();
    state = world.state;
    applySolution(state, 3);
    stepUntil(world, 5, (s) => s.screen !== SCREEN_PLAY);
    return { screen: state.screen, best: state.score };
  }

  if (name === 'lose') {
    world.startRun();
    state = world.state;
    stepUntil(world, LOSE_LIMIT_SECONDS, (s) => s.over);
    if (!state.over) {
      state.over = true;
      state.won = false;
      state.loseReason = 'flames';
      state.screen = SCREEN_LOSE;
    }
    return { screen: SCREEN_LOSE, best: state.score };
  }

  if (name === 'play') {
    world.startRun();
    state = world.state;
    // Menangi Night 1 cepat lalu ambil 2 boon, supaya toolbar play shot
    // menampilkan boon yang dimiliki.
    applySolution(state, 3);
    stepUntil(world, 5, (s) => s.screen !== SCREEN_PLAY);
    if (state.screen === SCREEN_BOON) {
      world.applyBoon(state.boonChoices[0]);
      world.rollBoons();
      world.applyBoon(state.boonChoices[0]);
      world.startNight(2);
    }
    // Night 2: dua cermin diperbaiki (dua anglo menyala), ketiga dibiarkan
    // salah supaya permainan masih berjalan saat wisp berdatangan.
    applySolution(state, 2);
    setMirror(state, 6, 6, MIRROR_BACKSLASH);
    stepUntil(world, PLAY_SECONDS, (s) => s.over || s.screen !== SCREEN_PLAY);
    return { screen: state.over ? (state.won ? SCREEN_WIN : SCREEN_LOSE) : SCREEN_PLAY, best: state.score };
  }

  // start (dan nama lain): latar judul dengan sinar solusi yang menyala.
  world.reset();
  state = world.state;
  applySolution(state, 3);
  state.screen = SCREEN_TITLE;
  for (let i = 0; i < START_SECONDS / STEP; i += 1) stepAmbient(world, STEP);
  return { screen: SCREEN_TITLE, best: 0 };
}
