// BEAMKEEPER — boot, loop utama, dan layar.
// Memasang canvas, membaca ?shot= & ?seed= untuk adegan screenshot,
// dan menggerakkan dunia dengan langkah tetap 1/60 detik.

import { STEP, DIFFICULTY_ORDER, DEFAULT_DIFFICULTY } from './config.js';
import {
  createWorld, rotateMirror, stepWorld, stepAmbient,
  SCREEN_TITLE, SCREEN_PLAY, SCREEN_BOON, SCREEN_WIN, SCREEN_LOSE,
  EVENT_WIN, EVENT_LOSE, EVENT_BURN, EVENT_LIT, EVENT_FLAME_LOST, EVENT_NIGHT_CLEAR,
} from './world.js';
import { computeLayout, tileAt, titleButtons, boonButtons, endButtons, toolbarButtons, draw } from './render.js';
import { attachInput } from './input.js';
import { sfx, toggleMute, isMuted } from './audio.js';
import { stageShot } from './shots.js';

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const params = new URLSearchParams(window.location.search);
const shotName = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

let difficultyKey = DEFAULT_DIFFICULTY;
let world = createWorld(difficultyKey, seed);
let layout = computeLayout(window.innerWidth, window.innerHeight);

function resize() {
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.floor(window.innerWidth * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  canvas.style.width = `${window.innerWidth}px`;
  canvas.style.height = `${window.innerHeight}px`;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  layout = computeLayout(window.innerWidth, window.innerHeight);
}
window.addEventListener('resize', resize);
resize();

function playEvents(events) {
  if (events & EVENT_WIN) sfx.win();
  else if (events & EVENT_LOSE) sfx.lose();
  if (events & EVENT_NIGHT_CLEAR) sfx.win();
  if (events & EVENT_BURN) sfx.burn();
  if (events & EVENT_LIT) sfx.lit();
  if (events & EVENT_FLAME_LOST) sfx.flameLost();
}

function startGame() {
  world = createWorld(difficultyKey, seed);
  world.startRun();
  sfx.click();
}

function toMenu() {
  world = createWorld(difficultyKey, seed);
  sfx.click();
}

function restartRun() {
  if (world.state.screen === SCREEN_TITLE) return;
  startGame();
}

function inside(rect, x, y) {
  return x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h;
}

function onClick(x, y) {
  const state = world.state;

  if (state.screen === SCREEN_TITLE) {
    const buttons = titleButtons(layout);
    for (const b of buttons.diffs) {
      if (inside(b, x, y)) {
        difficultyKey = b.key;
        sfx.click();
        return;
      }
    }
    if (inside(buttons.play, x, y)) startGame();
    return;
  }

  if (state.screen === SCREEN_BOON) {
    const btns = boonButtons(layout);
    for (const card of btns.cards) {
      const key = state.boonChoices[card.index];
      if (key && inside(card, x, y)) {
        if (world.applyBoon(key)) sfx.lit();
        return;
      }
    }
    for (const s of btns.shop) {
      if (inside(s, x, y)) {
        if (world.buyShop(s.key)) sfx.click();
        return;
      }
    }
    if (inside(btns.next, x, y) && state.boonChoices.length === 0) {
      world.startNight(state.night + 1);
      sfx.click();
    }
    return;
  }

  if (state.screen === SCREEN_WIN) {
    const btns = endButtons(layout, true, state.nightStats.length);
    if (inside(btns.again, x, y)) {
      world = createWorld(difficultyKey, (Math.random() * 1e9) | 0);
      world.startRun();
      sfx.click();
    } else if (inside(btns.seed, x, y)) {
      startGame();
    } else if (inside(btns.menu, x, y)) toMenu();
    return;
  }

  if (state.screen === SCREEN_LOSE) {
    const btns = endButtons(layout, false, state.nightStats.length);
    if (inside(btns.retry, x, y)) startGame();
    else if (inside(btns.menu, x, y)) toMenu();
    return;
  }

  // Layar play: toolbar dulu, lalu tile cermin.
  const tb = toolbarButtons(layout);
  if (inside(tb.flare, x, y)) {
    if (world.activateFlare()) sfx.burn();
    return;
  }
  if (inside(tb.pause, x, y)) {
    state.paused = !state.paused;
    sfx.click();
    return;
  }
  if (inside(tb.sound, x, y)) {
    toggleMute();
    sfx.click();
    return;
  }
  if (inside(tb.restart, x, y)) {
    restartRun();
    return;
  }
  const tile = tileAt(layout, x, y);
  if (!tile) return;
  const result = rotateMirror(world, tile.r, tile.c);
  if (result === 'lit') sfx.lit();
  else if (result === 'rotated') sfx.rotate();
}

attachInput(canvas, {
  onClick,
  onRestart: restartRun,
  onMute: () => { toggleMute(); },
  onDifficulty: (index) => {
    if (world.state.screen === SCREEN_TITLE) difficultyKey = DIFFICULTY_ORDER[index] ?? difficultyKey;
  },
  onConfirm: () => {
    const state = world.state;
    if (state.screen === SCREEN_TITLE) startGame();
    else if (state.screen === SCREEN_WIN) startGame();
    else if (state.screen === SCREEN_LOSE) startGame();
    else if (state.screen === SCREEN_BOON && state.boonChoices.length === 0) world.startNight(state.night + 1);
  },
});

window.addEventListener('keydown', (event) => {
  if (event.repeat) return;
  const key = event.key.toLowerCase();
  const state = world.state;
  if (key === 'f' && state.screen === SCREEN_PLAY) {
    if (world.activateFlare()) sfx.burn();
  } else if (key === 'p' && state.screen === SCREEN_PLAY) {
    state.paused = !state.paused;
    sfx.click();
  } else if ((key === '1' || key === '2' || key === '3') && state.screen === SCREEN_BOON) {
    const choice = state.boonChoices[Number(key) - 1];
    if (choice && world.applyBoon(choice)) sfx.lit();
  }
});

// Adegan screenshot: pentaskan sekali, lalu gambar; loop tetap berjalan
// supaya api dan bintang beranimasi saat bidikan diambil.
if (shotName) {
  stageShot(shotName, world);
  draw(ctx, world, layout, { selectedDifficulty: difficultyKey, muted: isMuted() });
}

// Loop utama: langkah simulasi tetap, gambar tiap frame.
let last = performance.now();
let accumulator = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  accumulator += dt;
  const state = world.state;
  while (accumulator >= STEP) {
    accumulator -= STEP;
    if (state.screen === SCREEN_PLAY) {
      const events = stepWorld(world, STEP);
      playEvents(events);
    } else {
      stepAmbient(world, STEP);
    }
  }
  draw(ctx, world, layout, { selectedDifficulty: difficultyKey, muted: isMuted() });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
