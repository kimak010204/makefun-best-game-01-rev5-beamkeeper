// BEAMKEEPER — all visuals drawn fresh on a 2D canvas, no outside assets.
// Round 2 art direction: "Lamplight Valley". The board is no longer a grid
// floating in a navy void — it is a mossy stone terrace in a painted night
// valley: indigo-violet sky melting into a teal horizon, a big warm moon,
// layered hills, pines and fireflies all around, and the board sitting in
// the grass. Palette: emerald moss, warm amber light, violet wisps, gold.
// Every screen carries at least three living colours; panels and buttons
// get gradients, gold rims and soft shadows so the UI has depth.

import {
  GRID_ROWS, GRID_COLS, LANTERN_ROW, COLORS, LAYOUT, LANTERN_FLAMES,
  NIGHTS_TOTAL, WISP_TYPES, BOONS, SHOP, DIFFICULTY_ORDER, DIFFICULTIES,
} from './config.js';
import { SCREEN_TITLE, SCREEN_PLAY, SCREEN_BOON, SCREEN_WIN, SCREEN_LOSE } from './world.js';

// ---- deterministic pseudo-random helpers (stable across frames) ----
function hash2(r, c) {
  const s = Math.sin(r * 127.1 + c * 311.7) * 43758.5453;
  return s - Math.floor(s);
}
function hash1(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// Twinkling stars scattered over the whole sky.
const STARS = (() => {
  let a = 20261117;
  const next = () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const stars = [];
  for (let i = 0; i < 170; i += 1) {
    stars.push({ x: next(), y: next() * 0.75, r: 0.6 + next() * 1.8, tw: next() * Math.PI * 2 });
  }
  return stars;
})();

// Warm fireflies drifting through the valley air — the living layer.
const FIREFLIES = (() => {
  const arr = [];
  for (let i = 0; i < 46; i += 1) {
    arr.push({
      x: hash1(i * 3 + 1), y: hash1(i * 3 + 2), r: 1.1 + hash1(i * 3 + 5) * 2.1,
      sp: 5 + hash1(i * 7 + 1) * 12, sway: 8 + hash1(i * 5 + 3) * 18,
      ph: hash1(i + 9) * Math.PI * 2, gold: hash1(i * 11 + 4) < 0.7,
    });
  }
  return arr;
})();

// Golden ember motes rising from fires across the screen.
const MOTES = (() => {
  const arr = [];
  for (let i = 0; i < 26; i += 1) {
    arr.push({ x: hash1(i * 3 + 1), y: hash1(i * 3 + 2), r: 0.8 + hash1(i * 3 + 5) * 1.8, sp: 6 + hash1(i * 7 + 1) * 14, ph: hash1(i + 9) * Math.PI * 2 });
  }
  return arr;
})();

// Slow violet mist banks crawling over the board.
const FOGS = [
  { x: 0.15, y: 0.3, r: 1.9, sp: 7, ph: 0 },
  { x: 0.6, y: 0.62, r: 2.3, sp: 5, ph: 2.1 },
  { x: 0.35, y: 0.85, r: 1.7, sp: 9, ph: 4.0 },
  { x: 0.85, y: 0.18, r: 1.5, sp: 6, ph: 5.3 },
];

// Slow clouds crossing the moonlit sky.
const CLOUDS = [
  { x: 0.2, y: 0.08, w: 260, h: 26, sp: 4, ph: 0.5 },
  { x: 0.65, y: 0.16, w: 320, h: 30, sp: 3, ph: 2.2 },
  { x: 0.45, y: 0.05, w: 200, h: 20, sp: 5, ph: 4.1 },
];

// Mirror spin animation lives here, in the renderer only: each mirror
// keeps a displayed angle that eases toward the angle of the world state,
// so a click visibly spins the glass without touching click logic.
const MIRROR_ANGLE = new Map();
function mirrorAngle(key, orient) {
  const target = orient === '/' ? -Math.PI / 4 : Math.PI / 4;
  const cur = MIRROR_ANGLE.get(key);
  if (cur === undefined) {
    MIRROR_ANGLE.set(key, target);
    return target;
  }
  const next = cur + (target - cur) * 0.16;
  MIRROR_ANGLE.set(key, next);
  return next;
}

const RIGHT_PANEL_W = 250;
const LANTERN_GAP = 64;
const TOP_H = 84;
const TOOLBAR_H = 72;

export function computeLayout(width, height) {
  const tile = Math.max(48, Math.floor(Math.min(
    (width - LANTERN_GAP - 20 - RIGHT_PANEL_W - 40) / GRID_COLS,
    (height - TOP_H - TOOLBAR_H - 16) / GRID_ROWS,
  )));
  const boardW = tile * GRID_COLS;
  const boardH = tile * GRID_ROWS;
  const contentW = LANTERN_GAP + boardW + 20 + RIGHT_PANEL_W;
  const boardX = Math.floor((width - contentW) / 2) + LANTERN_GAP;
  const boardY = TOP_H + Math.floor((height - TOP_H - TOOLBAR_H - boardH) / 2);
  return {
    width, height, tile, boardX, boardY, boardW, boardH,
    panelX: boardX + boardW + 20, panelW: RIGHT_PANEL_W,
    toolbarY: height - TOOLBAR_H + 8,
    toolbarX: boardX,
    toolbarW: boardW + 20 + RIGHT_PANEL_W,
  };
}

export function tileAt(layout, x, y) {
  const c = Math.floor((x - layout.boardX) / layout.tile);
  const r = Math.floor((y - layout.boardY) / layout.tile);
  if (r < 0 || r >= GRID_ROWS || c < 0 || c >= GRID_COLS) return null;
  return { r, c };
}

export function cellCenter(layout, r, c) {
  return { x: layout.boardX + c * layout.tile + layout.tile / 2, y: layout.boardY + r * layout.tile + layout.tile / 2 };
}

function roundRect(ctx, x, y, w, h, radius) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

function wrapText(ctx, text, x, y, maxW, lineH) {
  const words = text.split(' ');
  let line = '';
  let cy = y;
  for (const word of words) {
    const test = line === '' ? word : `${line} ${word}`;
    if (ctx.measureText(test).width > maxW && line !== '') {
      ctx.fillText(line, x, cy);
      line = word;
      cy += lineH;
    } else {
      line = test;
    }
  }
  if (line !== '') ctx.fillText(line, x, cy);
  return cy;
}

// A panel with depth: dark gradient, gold rim, soft drop shadow.
function panel(ctx, x, y, w, h, r, alpha = 0.92) {
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.55)';
  ctx.shadowBlur = 18;
  ctx.shadowOffsetY = 5;
  const g = ctx.createLinearGradient(x, y, x, y + h);
  g.addColorStop(0, `rgba(26, 34, 66, ${alpha})`);
  g.addColorStop(1, `rgba(12, 18, 42, ${alpha})`);
  ctx.fillStyle = g;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255, 201, 77, 0.45)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, x, y, w, h, r);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.07)';
  ctx.lineWidth = 1;
  roundRect(ctx, x + 3, y + 3, w - 6, h - 6, r - 2);
  ctx.stroke();
}

// A flame with three tongues: outer ember, mid gold, bright core.
function drawFlame(ctx, x, y, size, time, seed) {
  const flick = 1 + Math.sin(time * 7 + seed) * 0.12 + Math.sin(time * 13 + seed * 2) * 0.06;
  const h = size * flick;
  const w = size * 0.66;
  const tongue = (scale, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, y - h * scale);
    ctx.bezierCurveTo(x + w * scale, y - h * 0.45 * scale, x + w * 0.7 * scale, y, x, y);
    ctx.bezierCurveTo(x - w * 0.7 * scale, y, x - w * scale, y - h * 0.45 * scale, x, y - h * scale);
    ctx.fill();
  };
  ctx.save();
  ctx.shadowColor = '#ff7a3d';
  ctx.shadowBlur = 14;
  tongue(1, '#ff7a3d');
  tongue(0.68, '#ffc94d');
  tongue(0.4, '#fff3c4');
  ctx.restore();
}

// Embers rising from a fire, looping with time.
function drawRisingEmbers(ctx, x, y, time, seed, count) {
  for (let k = 0; k < count; k += 1) {
    const cyc = ((time * 22 + k * 19 + seed * 31) % 46) / 46;
    const ex = x + Math.sin(k * 2.4 + seed) * 7 - cyc * 6;
    const ey = y - cyc * 42;
    ctx.save();
    ctx.globalAlpha = (1 - cyc) * 0.9;
    ctx.fillStyle = k % 2 === 0 ? '#ffc94d' : '#ff7a3d';
    ctx.shadowColor = '#ff7a3d';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(ex, ey, 2.2 - cyc, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// A thin smoke curl rising from a cold fire.
function drawSmoke(ctx, x, y, time, seed, alpha = 0.4) {
  ctx.save();
  ctx.globalAlpha = alpha * (0.7 + 0.3 * Math.sin(time * 1.4 + seed));
  ctx.strokeStyle = '#c8cede';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.quadraticCurveTo(x + 7, y - 14, x - 2, y - 26);
  ctx.quadraticCurveTo(x - 8, y - 36, x + 2, y - 46);
  ctx.stroke();
  ctx.restore();
}

// ---------- THE PAINTED NIGHT VALLEY ----------
function drawSky(ctx, layout, time, moonPos) {
  const W = layout.width;
  const H = layout.height;
  // Sky: deep indigo-violet at the top melting into a teal horizon glow,
  // with a warm amber blush low on the lantern side.
  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0, '#171233');
  grad.addColorStop(0.45, '#2c2158');
  grad.addColorStop(0.75, '#1d4a4a');
  grad.addColorStop(1, '#173f36');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Colour washes: violet nebula, teal glow at the horizon, amber warmth.
  const wash = (x, y, r, color) => {
    const g = ctx.createRadialGradient(x, y, 4, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
  };
  wash(W * 0.14, H * 0.12, 280, 'rgba(140, 100, 230, 0.20)');
  wash(W * 0.9, H * 0.55, 300, 'rgba(46, 190, 160, 0.16)');
  wash(W * 0.06, H * 0.85, 260, 'rgba(255, 150, 60, 0.10)');

  for (const s of STARS) {
    const alpha = 0.3 + 0.55 * Math.abs(Math.sin(time * 0.7 + s.tw));
    ctx.fillStyle = `rgba(215, 222, 255, ${alpha.toFixed(3)})`;
    ctx.beginPath();
    ctx.arc(s.x * W, s.y * H, s.r, 0, Math.PI * 2);
    ctx.fill();
  }
  // One slow comet crossing the sky.
  const cometX = ((time * 46) % (W + 500)) - 250;
  const cometY = 92 + Math.sin(time * 0.25) * 34;
  const cometA = Math.max(0, Math.sin(time * 0.11 + 1.2));
  if (cometA > 0.05) {
    const cg = ctx.createLinearGradient(cometX, cometY, cometX - 110, cometY + 26);
    cg.addColorStop(0, `rgba(255, 244, 200, ${(0.85 * cometA).toFixed(2)})`);
    cg.addColorStop(1, 'rgba(255, 244, 200, 0)');
    ctx.strokeStyle = cg;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(cometX, cometY);
    ctx.lineTo(cometX - 110, cometY + 26);
    ctx.stroke();
    ctx.fillStyle = `rgba(255, 250, 220, ${(0.9 * cometA).toFixed(2)})`;
    ctx.beginPath();
    ctx.arc(cometX, cometY, 2.6, 0, Math.PI * 2);
    ctx.fill();
  }

  // Drifting clouds, lit faintly by the moon.
  for (const cl of CLOUDS) {
    const span = W + cl.w * 2;
    const cx = -cl.w + (((cl.x * W + time * cl.sp) % span) + span) % span;
    const cy = cl.y * H + Math.sin(time * 0.3 + cl.ph) * 6;
    ctx.save();
    ctx.globalAlpha = 0.5;
    ctx.fillStyle = 'rgba(120, 110, 190, 0.16)';
    ctx.beginPath();
    ctx.ellipse(cx, cy, cl.w / 2, cl.h / 2, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + cl.w * 0.28, cy + 6, cl.w * 0.3, cl.h * 0.36, 0, 0, Math.PI * 2);
    ctx.ellipse(cx - cl.w * 0.3, cy + 7, cl.w * 0.26, cl.h * 0.32, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Big warm moon — position varies per screen so it never sits on top
  // of HUD text or the title brazier (default: high on the right).
  const moonCfg = moonPos ?? { x: W - 110, y: 108, r: 44 };
  const mx = moonCfg.x;
  const my = moonCfg.y;
  const mr = moonCfg.r;
  const halo = ctx.createRadialGradient(mx, my, 10, mx, my, mr * 3);
  halo.addColorStop(0, 'rgba(255, 240, 200, 0.30)');
  halo.addColorStop(1, 'rgba(255, 240, 200, 0)');
  ctx.fillStyle = halo;
  ctx.beginPath();
  ctx.arc(mx, my, mr * 3, 0, Math.PI * 2);
  ctx.fill();
  const moon = ctx.createRadialGradient(mx - mr * 0.27, my - mr * 0.3, 6, mx, my, mr);
  moon.addColorStop(0, '#fff8dc');
  moon.addColorStop(1, '#f2d98c');
  ctx.fillStyle = moon;
  ctx.beginPath();
  ctx.arc(mx, my, mr, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = 'rgba(190, 160, 100, 0.5)';
  ctx.beginPath();
  ctx.arc(mx - mr * 0.3, my - mr * 0.18, mr * 0.18, 0, Math.PI * 2);
  ctx.arc(mx + mr * 0.32, my + mr * 0.27, mr * 0.14, 0, Math.PI * 2);
  ctx.arc(mx + mr * 0.14, my - mr * 0.43, mr * 0.1, 0, Math.PI * 2);
  ctx.arc(mx - mr * 0.05, my + mr * 0.45, mr * 0.08, 0, Math.PI * 2);
  ctx.fill();

  // Layered hills: far violet ridge, near teal ridge, then the grassy
  // valley floor the board sits on.
  ctx.fillStyle = '#241a4a';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H - 118);
  ctx.quadraticCurveTo(W * 0.25, H - 168, W * 0.5, H - 122);
  ctx.quadraticCurveTo(W * 0.75, H - 158, W, H - 112);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#14352c';
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H - 62);
  ctx.quadraticCurveTo(W * 0.3, H - 104, W * 0.58, H - 58);
  ctx.quadraticCurveTo(W * 0.82, H - 96, W, H - 60);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();
  // Valley floor: a warm emerald mound rising behind the board.
  const floor = ctx.createLinearGradient(0, H - 70, 0, H);
  floor.addColorStop(0, '#1d5c40');
  floor.addColorStop(1, '#0f3524');
  ctx.fillStyle = floor;
  ctx.beginPath();
  ctx.moveTo(0, H);
  ctx.lineTo(0, H - 26);
  ctx.quadraticCurveTo(W * 0.5, H - 52, W, H - 24);
  ctx.lineTo(W, H);
  ctx.closePath();
  ctx.fill();

  // Pine silhouettes on the ridges, with a firefly or two in the branches.
  const pine = (x, baseY, h, color) => {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x, baseY - h);
    ctx.lineTo(x - h * 0.3, baseY - h * 0.45);
    ctx.lineTo(x - h * 0.16, baseY - h * 0.45);
    ctx.lineTo(x - h * 0.34, baseY);
    ctx.lineTo(x + h * 0.34, baseY);
    ctx.lineTo(x + h * 0.16, baseY - h * 0.45);
    ctx.lineTo(x + h * 0.3, baseY - h * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(x - 2, baseY - 2, 4, 6);
  };
  pine(W * 0.045, H - 58, 52, '#0d2a20');
  pine(W * 0.085, H - 52, 36, '#0d2a20');
  pine(W * 0.955, H - 56, 48, '#0d2a20');
  pine(W * 0.915, H - 50, 30, '#0d2a20');
  pine(W * 0.02, H - 108, 40, '#1a1440');
  pine(W * 0.98, H - 102, 34, '#1a1440');

  // Fireflies: warm gold and cool green, pulsing as they drift.
  for (const f of FIREFLIES) {
    const fy = H - (((f.y * H + time * f.sp) % H) + H) % H;
    const fx = f.x * W + Math.sin(time * 0.7 + f.ph) * f.sway;
    const tw = 0.25 + 0.65 * Math.abs(Math.sin(time * 1.8 + f.ph));
    ctx.save();
    ctx.globalAlpha = tw;
    ctx.fillStyle = f.gold ? '#ffd76a' : '#8be89a';
    ctx.shadowColor = f.gold ? '#ffc94d' : '#7be495';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.arc(fx, fy, f.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// ---------- BOARD: a mossy stone terrace in the grass ----------
function drawBoard(ctx, layout, time) {
  const { boardX, boardY, boardW, boardH, tile } = layout;
  // Grass mound the terrace sits on, spilling past the frame.
  const mound = ctx.createLinearGradient(boardX, boardY + boardH - 30, boardX, boardY + boardH + 34);
  mound.addColorStop(0, '#1d5c40');
  mound.addColorStop(1, '#0f3524');
  ctx.fillStyle = mound;
  ctx.beginPath();
  ctx.moveTo(boardX - 26, boardY + boardH - 6);
  ctx.quadraticCurveTo(boardX + boardW / 2, boardY + boardH + 30, boardX + boardW + 26, boardY + boardH - 6);
  ctx.lineTo(boardX + boardW + 26, boardY + boardH + 18);
  ctx.lineTo(boardX - 26, boardY + boardH + 18);
  ctx.closePath();
  ctx.fill();
  // Wildflowers on the mound.
  for (let i = 0; i < 9; i += 1) {
    const fx = boardX - 14 + hash1(i * 7 + 2) * (boardW + 28);
    const fy = boardY + boardH + 8 + hash1(i * 7 + 5) * 12;
    ctx.strokeStyle = '#2f7a4d';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(fx, fy + 5);
    ctx.lineTo(fx, fy - 2);
    ctx.stroke();
    ctx.fillStyle = i % 3 === 0 ? '#ffb347' : i % 3 === 1 ? '#ff8fb0' : '#c4b5fd';
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(a) * 2.6, fy - 2 + Math.sin(a) * 2.6, 1.7, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Stone terrace frame with a mossy top rim and a gold trim line.
  ctx.save();
  ctx.shadowColor = 'rgba(0, 0, 0, 0.5)';
  ctx.shadowBlur = 16;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = '#221d2e';
  roundRect(ctx, boardX - 16, boardY - 16, boardW + 32, boardH + 32, 18);
  ctx.fill();
  ctx.restore();
  const stone = ctx.createLinearGradient(boardX, boardY - 12, boardX, boardY + boardH + 12);
  stone.addColorStop(0, '#3a3348');
  stone.addColorStop(1, '#241f31');
  ctx.fillStyle = stone;
  roundRect(ctx, boardX - 11, boardY - 11, boardW + 22, boardH + 22, 15);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 201, 77, 0.4)';
  ctx.lineWidth = 1.5;
  roundRect(ctx, boardX - 7, boardY - 7, boardW + 14, boardH + 14, 13);
  ctx.stroke();
  // Moss creeping over the top rim.
  ctx.fillStyle = '#3f8f5a';
  for (let i = 0; i < 14; i += 1) {
    const mx = boardX - 8 + hash1(i * 13 + 1) * (boardW + 16);
    const my = boardY - 12 + hash1(i * 13 + 4) * 7;
    ctx.beginPath();
    ctx.arc(mx, my, 3 + hash1(i * 5) * 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = '#57a773';
  for (let i = 0; i < 8; i += 1) {
    const mx = boardX + hash1(i * 17 + 3) * boardW;
    const my = boardY - 11 + hash1(i * 17 + 8) * 5;
    ctx.beginPath();
    ctx.arc(mx, my, 2 + hash1(i * 3) * 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // Tiles: mossy ground — emerald and teal-green stone, warm where the
  // light has lived, with soft seams instead of hard grid lines.
  for (let r = 0; r < GRID_ROWS; r += 1) {
    for (let c = 0; c < GRID_COLS; c += 1) {
      const x = boardX + c * tile;
      const y = boardY + r * tile;
      const h = hash2(r + 100, c + 100);
      const base = (r + c) % 2 === 0 ? '#1f5c40' : '#1a4f3a';
      const g = ctx.createLinearGradient(x, y, x + tile, y + tile);
      g.addColorStop(0, base);
      g.addColorStop(1, h < 0.22 ? '#2a6b4a' : h > 0.82 ? '#17483a' : '#1e5540');
      ctx.fillStyle = g;
      ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      if (h < 0.14) {
        ctx.fillStyle = 'rgba(255, 190, 90, 0.07)';
        ctx.fillRect(x + 1, y + 1, tile - 2, tile - 2);
      }
      ctx.strokeStyle = 'rgba(8, 20, 12, 0.5)';
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y + 0.5, tile - 1, tile - 1);
      ctx.strokeStyle = 'rgba(140, 220, 160, 0.10)';
      ctx.strokeRect(x + 1.5, y + 1.5, tile - 3, tile - 3);
    }
  }

  // Corner torches on the frame — living fire at the terrace edge.
  const torch = (x, y, seed) => {
    const glow = ctx.createRadialGradient(x, y - 8, 2, x, y - 8, 36);
    glow.addColorStop(0, 'rgba(255, 150, 60, 0.5)');
    glow.addColorStop(1, 'rgba(255, 150, 60, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(x, y - 8, 36, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#4a3a22';
    ctx.fillRect(x - 2.5, y, 5, 12);
    ctx.fillStyle = '#6b5a35';
    ctx.beginPath();
    ctx.arc(x, y, 6, 0, Math.PI);
    ctx.fill();
    drawFlame(ctx, x, y - 2, 13, time, seed);
  };
  torch(boardX - 11, boardY - 13, 1);
  torch(boardX + boardW + 11, boardY - 13, 4);
  void time;
}

// Ground dressing for one empty tile: grass, clover, pebbles, cracks,
// wildflowers or a little mushroom — seeded so it never shimmers.
function drawTileDecor(ctx, r, c, x, y, tile) {
  const h = hash2(r, c);
  const h2 = hash2(c + 40, r + 17);
  if (h < 0.2) {
    // Grass tuft, bright green.
    ctx.strokeStyle = h2 < 0.5 ? '#4da86e' : '#6cc184';
    ctx.lineWidth = 1.7;
    ctx.lineCap = 'round';
    const gx = x + tile * (0.3 + h2 * 0.4);
    const gy = y + tile * (0.55 + hash2(r + 9, c) * 0.25);
    for (let k = -1; k <= 1; k += 1) {
      ctx.beginPath();
      ctx.moveTo(gx + k * 4, gy);
      ctx.quadraticCurveTo(gx + k * 5, gy - 9, gx + k * 8, gy - 12 - Math.abs(k) * -2);
      ctx.stroke();
    }
  } else if (h < 0.3) {
    // Clover — three round leaves.
    const cx = x + tile * (0.35 + h2 * 0.3);
    const cy = y + tile * (0.4 + h2 * 0.25);
    ctx.fillStyle = '#3f9e5f';
    for (let k = 0; k < 3; k += 1) {
      const a = (k / 3) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.arc(cx + Math.cos(a) * 4, cy + Math.sin(a) * 4, 3.4, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (h < 0.38) {
    // Pebbles, warm stone.
    ctx.fillStyle = 'rgba(190, 180, 150, 0.55)';
    ctx.beginPath();
    ctx.arc(x + tile * (0.3 + h2 * 0.3), y + tile * (0.35 + h2 * 0.3), 3.2, 0, Math.PI * 2);
    ctx.arc(x + tile * (0.55 + h2 * 0.2), y + tile * (0.6 - h2 * 0.2), 2.2, 0, Math.PI * 2);
    ctx.fill();
  } else if (h < 0.46) {
    // Amber wildflower.
    const fx = x + tile * (0.3 + h2 * 0.4);
    const fy = y + tile * (0.4 + hash2(r + 3, c + 5) * 0.25);
    ctx.strokeStyle = '#4da86e';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(fx, fy + 8);
    ctx.lineTo(fx, fy);
    ctx.stroke();
    ctx.fillStyle = h2 < 0.5 ? '#ffb347' : '#ff8fb0';
    for (let k = 0; k < 5; k += 1) {
      const a = (k / 5) * Math.PI * 2;
      ctx.beginPath();
      ctx.arc(fx + Math.cos(a) * 3.4, fy + Math.sin(a) * 3.4, 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.fillStyle = '#ff7a3d';
    ctx.beginPath();
    ctx.arc(fx, fy, 2, 0, Math.PI * 2);
    ctx.fill();
  } else if (h < 0.52) {
    // Little mushroom with a red cap.
    const mx = x + tile * (0.4 + h2 * 0.2);
    const my = y + tile * 0.62;
    ctx.fillStyle = '#e8ddc0';
    ctx.fillRect(mx - 1.5, my - 6, 3, 7);
    ctx.fillStyle = '#e05a4e';
    ctx.beginPath();
    ctx.arc(mx, my - 6, 6, Math.PI, 0);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(mx - 2.5, my - 9, 1.2, 0, Math.PI * 2);
    ctx.arc(mx + 2, my - 10, 1, 0, Math.PI * 2);
    ctx.fill();
  } else if (h < 0.58) {
    // Mossy crack in the old stone.
    ctx.strokeStyle = 'rgba(8, 18, 10, 0.6)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x + tile * 0.2, y + tile * (0.3 + h2 * 0.2));
    ctx.lineTo(x + tile * 0.45, y + tile * 0.5);
    ctx.lineTo(x + tile * 0.4, y + tile * 0.72);
    ctx.lineTo(x + tile * 0.65, y + tile * 0.85);
    ctx.stroke();
    ctx.strokeStyle = '#3f8f5a';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(x + tile * 0.45, y + tile * 0.5);
    ctx.lineTo(x + tile * 0.52, y + tile * 0.44);
    ctx.stroke();
  }
}

// Warm wash on every tile the beam touches, so lit ground glows gold.
function drawLitWash(ctx, state, layout) {
  for (const key of state.beamCells) {
    const [r, c] = key.split(',').map(Number);
    const x = layout.boardX + c * layout.tile;
    const y = layout.boardY + r * layout.tile;
    const g = ctx.createRadialGradient(
      x + layout.tile / 2, y + layout.tile / 2, 4,
      x + layout.tile / 2, y + layout.tile / 2, layout.tile * 0.8,
    );
    g.addColorStop(0, 'rgba(255, 201, 77, 0.26)');
    g.addColorStop(1, 'rgba(255, 201, 77, 0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, layout.tile, layout.tile);
  }
}

function drawBeam(ctx, state, layout, time) {
  const path = state.beamPath;
  if (path.length === 0) return;
  const points = [];
  const first = cellCenter(layout, LANTERN_ROW, 0);
  points.push({ x: layout.boardX - layout.tile * 0.9, y: first.y });
  for (const step of path) points.push(cellCenter(layout, step.r, step.c));
  const last = points[points.length - 1];
  const prev = points[points.length - 2] ?? { x: last.x - layout.tile, y: last.y };
  const dx = last.x - prev.x;
  const dy = last.y - prev.y;
  const len = Math.hypot(dx, dy) || 1;
  points.push({ x: last.x + (dx / len) * layout.tile * 0.7, y: last.y + (dy / len) * layout.tile * 0.7 });

  const pulse = 1 + 0.09 * Math.sin(time * 3.2);
  const t = layout.tile;
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const stroke = (style, width) => {
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    ctx.beginPath();
    points.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();
  };
  stroke('rgba(255, 201, 77, 0.18)', t * 0.82 * pulse);
  stroke(COLORS.beamGlow, t * 0.52 * pulse);
  ctx.shadowColor = COLORS.beam;
  ctx.shadowBlur = 26;
  stroke(COLORS.beam, t * 0.32 * pulse);
  ctx.shadowBlur = 14;
  stroke(COLORS.beamCore, t * 0.14 * pulse);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Bright impact bloom where the beam ends.
  const end = points[points.length - 1];
  const bloom = ctx.createRadialGradient(end.x, end.y, 2, end.x, end.y, t * 0.6);
  bloom.addColorStop(0, 'rgba(255, 243, 196, 0.9)');
  bloom.addColorStop(0.4, 'rgba(255, 201, 77, 0.4)');
  bloom.addColorStop(1, 'rgba(255, 201, 77, 0)');
  ctx.fillStyle = bloom;
  ctx.beginPath();
  ctx.arc(end.x, end.y, t * 0.6, 0, Math.PI * 2);
  ctx.fill();

  // Sparks streaming along the beam.
  const segs = [];
  let total = 0;
  for (let i = 0; i < points.length - 1; i += 1) {
    const segLen = Math.hypot(points[i + 1].x - points[i].x, points[i + 1].y - points[i].y);
    segs.push(segLen);
    total += segLen;
  }
  const sparks = 18;
  for (let i = 0; i < sparks; i += 1) {
    const d = ((time * 90 + i * (total / sparks)) % total + total) % total;
    let acc = 0;
    let sx = points[0].x;
    let sy = points[0].y;
    for (let s = 0; s < segs.length; s += 1) {
      if (d <= acc + segs[s] || s === segs.length - 1) {
        const f = segs[s] === 0 ? 0 : Math.min(1, (d - acc) / segs[s]);
        sx = points[s].x + (points[s + 1].x - points[s].x) * f;
        sy = points[s].y + (points[s + 1].y - points[s].y) * f;
        break;
      }
      acc += segs[s];
    }
    const tw = 0.55 + 0.45 * Math.sin(time * 5 + i * 1.3);
    ctx.save();
    ctx.fillStyle = `rgba(255, 244, 200, ${(0.85 * tw).toFixed(2)})`;
    ctx.shadowColor = COLORS.beam;
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.arc(sx, sy, t * 0.055 * tw + 1.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  for (const flash of state.flashes) {
    const p = cellCenter(layout, flash.r, flash.c);
    const frac = 1 - flash.life / flash.max;
    ctx.save();
    ctx.globalAlpha = Math.max(0, flash.life / flash.max);
    ctx.strokeStyle = COLORS.beamCore;
    ctx.lineWidth = 5;
    ctx.shadowColor = COLORS.beam;
    ctx.shadowBlur = 20;
    ctx.beginPath();
    ctx.arc(p.x, p.y, t * (0.3 + frac * 0.9), 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

// ---------- HERO PIECES: lantern, mirror, brazier, wall ----------
function drawLantern(ctx, state, layout, time) {
  const p = cellCenter(layout, LANTERN_ROW, 0);
  const x = layout.boardX - layout.tile * 0.62;
  const y = p.y;
  const t = layout.tile;
  // Warm halo first, so the lantern reads as the light source.
  const pulse = 1 + 0.05 * Math.sin(time * 2.2);
  const glow = ctx.createRadialGradient(x, y, 4, x, y, t * 1.7 * pulse);
  glow.addColorStop(0, 'rgba(255, 190, 90, 0.55)');
  glow.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, t * 1.7 * pulse, 0, Math.PI * 2);
  ctx.fill();

  // A gnarled branch the lantern hangs from, with a leaf and a firefly.
  ctx.strokeStyle = '#4a3520';
  ctx.lineWidth = 5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(x - t * 0.62, y - t * 1.12);
  ctx.quadraticCurveTo(x - t * 0.2, y - t * 1.2, x, y - t * 1.05);
  ctx.stroke();
  ctx.fillStyle = '#3f8f5a';
  ctx.beginPath();
  ctx.ellipse(x - t * 0.34, y - t * 1.16, 9, 4.5, -0.5, 0, Math.PI * 2);
  ctx.fill();
  // Hanging chain and hook.
  ctx.strokeStyle = '#8a6a2f';
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.moveTo(x, y - t * 1.05);
  ctx.lineTo(x, y - t * 0.5);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(x, y - t * 0.56, 6, Math.PI, 0);
  ctx.stroke();

  // Ornate cage: domed cap with a finial, glass core, scrollwork base.
  const bw = 46;
  const bh = 64;
  ctx.save();
  ctx.shadowColor = 'rgba(255, 190, 90, 0.9)';
  ctx.shadowBlur = 20;
  const glass = ctx.createLinearGradient(x - bw / 2, y - bh / 2, x + bw / 2, y + bh / 2);
  glass.addColorStop(0, '#fff3c4');
  glass.addColorStop(0.5, '#ffd76a');
  glass.addColorStop(1, '#ff9d45');
  ctx.fillStyle = glass;
  roundRect(ctx, x - bw / 2, y - bh / 2, bw, bh, 10);
  ctx.fill();
  ctx.restore();
  // Big living flame inside the glass.
  drawFlame(ctx, x, y + bh / 2 - 8, 24, time, 3);
  drawFlame(ctx, x - 11, y + bh / 2 - 6, 12, time, 7);
  drawFlame(ctx, x + 11, y + bh / 2 - 6, 12, time, 11);
  // Bronze frame: vertical bars, rim, domed cap, finial ball.
  ctx.strokeStyle = '#5d4517';
  ctx.lineWidth = 4;
  roundRect(ctx, x - bw / 2, y - bh / 2, bw, bh, 10);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - bw / 2 + 8, y - bh / 2);
  ctx.lineTo(x - bw / 2 + 8, y + bh / 2);
  ctx.moveTo(x + bw / 2 - 8, y - bh / 2);
  ctx.lineTo(x + bw / 2 - 8, y + bh / 2);
  ctx.moveTo(x, y - bh / 2);
  ctx.lineTo(x, y - bh / 2 + 8);
  ctx.stroke();
  ctx.fillStyle = '#3d2f10';
  ctx.beginPath();
  ctx.moveTo(x - bw / 2 - 3, y - bh / 2 - 2);
  ctx.quadraticCurveTo(x, y - bh / 2 - 18, x + bw / 2 + 3, y - bh / 2 - 2);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x, y - bh / 2 - 17, 4.5, 0, Math.PI * 2);
  ctx.fill();
  // Scrollwork base.
  ctx.fillStyle = '#3d2f10';
  roundRect(ctx, x - bw / 2 - 5, y + bh / 2 - 2, bw + 10, 11, 5);
  ctx.fill();
  ctx.fillStyle = '#8a6a2f';
  ctx.beginPath();
  ctx.arc(x - bw / 2 + 2, y + bh / 2 + 3, 3, 0, Math.PI * 2);
  ctx.arc(x + bw / 2 - 2, y + bh / 2 + 3, 3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('LANTERN', x, y + t * 0.82);
  // Flame pips: one per flame left.
  for (let i = 0; i < state.maxFlames; i += 1) {
    const px = x + (i - (state.maxFlames - 1) / 2) * 13;
    const py = y + t * 1.0;
    if (i < state.flames) {
      drawFlame(ctx, px, py + 4, 7, time, i * 2 + 1);
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(px, py, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawMirror(ctx, cell, cx, cy, tile, time, key, lit) {
  const angle = mirrorAngle(key, cell.orient);
  const len = tile * 0.72;
  const th = tile * 0.24;
  ctx.save();
  // Mossy stone pedestal plate under the glass.
  ctx.fillStyle = 'rgba(6, 10, 8, 0.55)';
  roundRect(ctx, cx - tile * 0.44, cy - tile * 0.44, tile * 0.88, tile * 0.88, 12);
  ctx.fill();
  ctx.strokeStyle = lit ? 'rgba(255, 201, 77, 0.85)' : 'rgba(140, 160, 110, 0.45)';
  ctx.lineWidth = lit ? 2.5 : 1.5;
  ctx.stroke();
  ctx.fillStyle = '#3f8f5a';
  ctx.beginPath();
  ctx.arc(cx - tile * 0.36, cy + tile * 0.36, 3, 0, Math.PI * 2);
  ctx.arc(cx + tile * 0.38, cy - tile * 0.34, 2.5, 0, Math.PI * 2);
  ctx.fill();
  if (lit) {
    ctx.shadowColor = COLORS.beam;
    ctx.shadowBlur = 24;
  }
  // Ornate gold frame around the glass slab, spun to its animated angle.
  ctx.translate(cx, cy);
  ctx.rotate(angle);
  const frame = ctx.createLinearGradient(-len / 2, -th / 2 - 5, len / 2, th / 2 + 5);
  frame.addColorStop(0, '#8a6a2f');
  frame.addColorStop(0.5, '#e8c268');
  frame.addColorStop(1, '#8a6a2f');
  ctx.fillStyle = frame;
  roundRect(ctx, -len / 2 - 4, -th / 2 - 5, len + 8, th + 10, (th + 10) / 2);
  ctx.fill();
  const glass = ctx.createLinearGradient(-len / 2, -th / 2, len / 2, th / 2);
  glass.addColorStop(0, '#f2f7ff');
  glass.addColorStop(0.45, '#b9c8ea');
  glass.addColorStop(0.55, '#f8fbff');
  glass.addColorStop(1, '#8fa3d4');
  ctx.fillStyle = glass;
  roundRect(ctx, -len / 2, -th / 2, len, th, th / 2);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.strokeStyle = '#5d4517';
  ctx.lineWidth = 1.5;
  roundRect(ctx, -len / 2, -th / 2, len, th, th / 2);
  ctx.stroke();
  // Bright glint stripe along the top edge.
  ctx.strokeStyle = 'rgba(255,255,255,0.95)';
  ctx.lineWidth = 2.5;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-len * 0.32, -th * 0.18);
  ctx.lineTo(len * 0.28, -th * 0.18);
  ctx.stroke();
  // Gold rivets at both ends of the frame.
  ctx.fillStyle = '#5d4517';
  ctx.beginPath();
  ctx.arc(-len / 2 - 1, 0, 3, 0, Math.PI * 2);
  ctx.arc(len / 2 + 1, 0, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffd76a';
  ctx.beginPath();
  ctx.arc(-len / 2 - 1, 0, 1.4, 0, Math.PI * 2);
  ctx.arc(len / 2 + 1, 0, 1.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // Small pulsing "turn me" hint in the tile corner.
  ctx.save();
  ctx.globalAlpha = 0.4 + 0.25 * Math.sin(time * 3 + cx * 0.01);
  ctx.fillStyle = '#ffd76a';
  ctx.font = `bold ${Math.max(13, tile * 0.2)}px system-ui, sans-serif`;
  ctx.textAlign = 'right';
  ctx.fillText('↻', cx + tile * 0.44, cy - tile * 0.3);
  ctx.restore();
}

function drawBrazier(ctx, cell, cx, cy, tile, time, index) {
  const t = tile;
  if (cell.lit) {
    const glow = ctx.createRadialGradient(cx, cy - t * 0.08, 2, cx, cy - t * 0.08, t * 1.15);
    glow.addColorStop(0, 'rgba(255, 122, 61, 0.6)');
    glow.addColorStop(1, 'rgba(255, 122, 61, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(cx, cy - t * 0.08, t * 1.15, 0, Math.PI * 2);
    ctx.fill();
  }
  // Carved stone pedestal with moss at its foot.
  ctx.fillStyle = '#2c3050';
  ctx.fillRect(cx - 6, cy + t * 0.14, 12, t * 0.26);
  ctx.fillStyle = '#3a3f5c';
  ctx.fillRect(cx - 13, cy + t * 0.36, 26, 6);
  ctx.fillStyle = '#3f8f5a';
  ctx.beginPath();
  ctx.arc(cx - 12, cy + t * 0.38, 3, 0, Math.PI * 2);
  ctx.arc(cx + 12, cy + t * 0.4, 2.5, 0, Math.PI * 2);
  ctx.fill();
  // Wide stone bowl with a brass rim.
  ctx.fillStyle = '#4a4a68';
  ctx.beginPath();
  ctx.arc(cx, cy + t * 0.12, t * 0.42, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8a6a2f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(cx, cy + t * 0.12, t * 0.42, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#5d6284';
  ctx.fillRect(cx - t * 0.42, cy + t * 0.1, t * 0.84, 5);
  ctx.fillStyle = '#333752';
  ctx.beginPath();
  ctx.ellipse(cx, cy + t * 0.1, t * 0.36, t * 0.1, 0, 0, Math.PI * 2);
  ctx.fill();

  if (cell.lit) {
    // Tall triple flame + rising embers + a wisp of smoke.
    drawFlame(ctx, cx, cy + t * 0.1, t * 0.52, time, index * 1.7 + 1);
    drawFlame(ctx, cx - t * 0.18, cy + t * 0.1, t * 0.32, time, index * 2.3 + 4);
    drawFlame(ctx, cx + t * 0.17, cy + t * 0.1, t * 0.28, time, index * 1.3 + 8);
    drawRisingEmbers(ctx, cx, cy - t * 0.1, time, index, 4);
    drawSmoke(ctx, cx + t * 0.1, cy - t * 0.3, time, index, 0.25);
  } else {
    // Cold coals sunk in the bowl with a smoke curl — clearly unlit.
    ctx.fillStyle = '#5e2f24';
    ctx.beginPath();
    ctx.ellipse(cx - t * 0.08, cy + t * 0.1, t * 0.1, t * 0.05, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + t * 0.1, cy + t * 0.11, t * 0.08, t * 0.045, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#7a4030';
    ctx.beginPath();
    ctx.arc(cx - t * 0.02, cy + t * 0.08, t * 0.035, 0, Math.PI * 2);
    ctx.fill();
    drawSmoke(ctx, cx, cy - t * 0.02, time, index, 0.4);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = `bold ${Math.max(10, t * 0.13)}px system-ui, sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText('BRAZIER', cx, cy + t * 0.52);
  }
}

function drawWall(ctx, cx, cy, tile, time) {
  ctx.save();
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  roundRect(ctx, cx - tile * 0.34, cy - tile * 0.3, tile * 0.68, tile * 0.68, 8);
  ctx.fill();
  // Mossy old ruin block: stone body, moss cap, crack, tiny mushroom.
  const body = ctx.createLinearGradient(cx, cy - tile * 0.36, cx, cy + tile * 0.36);
  body.addColorStop(0, '#5d6284');
  body.addColorStop(1, '#3a3f5c');
  ctx.fillStyle = body;
  roundRect(ctx, cx - tile * 0.36, cy - tile * 0.36, tile * 0.72, tile * 0.72, 8);
  ctx.fill();
  ctx.strokeStyle = '#2c3050';
  ctx.lineWidth = 2;
  ctx.stroke();
  ctx.fillStyle = '#3f8f5a';
  roundRect(ctx, cx - tile * 0.36, cy - tile * 0.36, tile * 0.72, tile * 0.14, 6);
  ctx.fill();
  ctx.strokeStyle = 'rgba(20, 22, 40, 0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - tile * 0.2, cy - tile * 0.18);
  ctx.lineTo(cx - tile * 0.08, cy + tile * 0.05);
  ctx.lineTo(cx - tile * 0.18, cy + tile * 0.28);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + tile * 0.1, cy + tile * 0.12);
  ctx.lineTo(cx + tile * 0.28, cy + tile * 0.3);
  ctx.stroke();
  // Tiny mushroom growing from the moss cap.
  ctx.fillStyle = '#e8ddc0';
  ctx.fillRect(cx + tile * 0.2 - 1, cy - tile * 0.36, 2, 5);
  ctx.fillStyle = '#e05a4e';
  ctx.beginPath();
  ctx.arc(cx + tile * 0.2, cy - tile * 0.36, 4.5, Math.PI, 0);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
  void time;
}

// ---- WISPS: each type gets its own silhouette, face and trail ----
function drawWispShape(ctx, type, x, y, s, time, seed) {
  ctx.save();
  if (type === 'mote') {
    const g = ctx.createRadialGradient(x, y - s * 0.1, 1, x, y, s);
    g.addColorStop(0, '#e2d9ff');
    g.addColorStop(0.55, '#9b7bff');
    g.addColorStop(1, 'rgba(155, 123, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#efe9ff';
    ctx.beginPath();
    ctx.arc(x - s * 0.18, y - s * 0.12, s * 0.11, 0, Math.PI * 2);
    ctx.arc(x + s * 0.18, y - s * 0.12, s * 0.11, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#241a4d';
    ctx.beginPath();
    ctx.arc(x - s * 0.18, y - s * 0.12, s * 0.05, 0, Math.PI * 2);
    ctx.arc(x + s * 0.18, y - s * 0.12, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(36, 26, 77, 0.85)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y + s * 0.08, s * 0.16, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
    ctx.fillStyle = 'rgba(155, 123, 255, 0.5)';
    ctx.beginPath();
    ctx.arc(x + s * 0.3, y + s * 0.55, s * 0.18, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'drift') {
    // Dart: swept teardrop pointing left, toward the lantern.
    const g = ctx.createRadialGradient(x, y, 1, x, y, s * 1.1);
    g.addColorStop(0, '#c4b5fd');
    g.addColorStop(0.6, '#8b6cf0');
    g.addColorStop(1, 'rgba(139, 108, 240, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - s * 1.05, y);
    ctx.quadraticCurveTo(x - s * 0.2, y - s * 0.72, x + s * 0.55, y - s * 0.28);
    ctx.quadraticCurveTo(x + s * 0.9, y, x + s * 0.55, y + s * 0.28);
    ctx.quadraticCurveTo(x - s * 0.2, y + s * 0.72, x - s * 1.05, y);
    ctx.fill();
    ctx.strokeStyle = 'rgba(196, 181, 253, 0.7)';
    ctx.lineWidth = 2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x + s * 0.7, y - s * 0.3);
    ctx.lineTo(x + s * 1.35, y - s * 0.3);
    ctx.moveTo(x + s * 0.7, y + s * 0.3);
    ctx.lineTo(x + s * 1.3, y + s * 0.3);
    ctx.stroke();
    ctx.fillStyle = '#efe9ff';
    ctx.beginPath();
    ctx.ellipse(x - s * 0.42, y - s * 0.08, s * 0.16, s * 0.09, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#241a4d';
    ctx.beginPath();
    ctx.arc(x - s * 0.46, y - s * 0.06, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'husk') {
    // Armored shell: stone dome, cracks, grim eyes, stubby feet.
    const g = ctx.createRadialGradient(x, y - s * 0.15, 1, x, y, s * 1.05);
    g.addColorStop(0, '#c9b8a8');
    g.addColorStop(0.5, '#8a7a68');
    g.addColorStop(1, 'rgba(138, 122, 104, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s * 0.95, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d5348';
    ctx.beginPath();
    ctx.arc(x, y - s * 0.28, s * 0.72, Math.PI, 0);
    ctx.fill();
    ctx.strokeStyle = 'rgba(40, 32, 24, 0.7)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.4, y - s * 0.85);
    ctx.lineTo(x - s * 0.2, y - s * 0.55);
    ctx.lineTo(x - s * 0.35, y - s * 0.3);
    ctx.moveTo(x + s * 0.3, y - s * 0.9);
    ctx.lineTo(x + s * 0.15, y - s * 0.6);
    ctx.stroke();
    ctx.fillStyle = '#3d342c';
    ctx.beginPath();
    ctx.arc(x - s * 0.55, y - s * 0.3, s * 0.07, 0, Math.PI * 2);
    ctx.arc(x + s * 0.55, y - s * 0.3, s * 0.07, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#2a2140';
    ctx.beginPath();
    ctx.ellipse(x - s * 0.22, y + s * 0.05, s * 0.16, s * 0.1, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 0.22, y + s * 0.05, s * 0.16, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#c4b5fd';
    ctx.beginPath();
    ctx.arc(x - s * 0.22, y + s * 0.05, s * 0.05, 0, Math.PI * 2);
    ctx.arc(x + s * 0.22, y + s * 0.05, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#5d5348';
    ctx.beginPath();
    ctx.ellipse(x - s * 0.4, y + s * 0.88, s * 0.18, s * 0.1, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 0.4, y + s * 0.88, s * 0.18, s * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (type === 'gloom') {
    // Flickering ghost: rounded top, wavy tail, hollow glowing eyes.
    ctx.globalAlpha = 0.72 + 0.28 * Math.abs(Math.sin(time * 4 + seed));
    const g = ctx.createRadialGradient(x, y - s * 0.2, 1, x, y, s * 1.1);
    g.addColorStop(0, '#e6e0ff');
    g.addColorStop(0.5, '#7c6bd8');
    g.addColorStop(1, 'rgba(124, 107, 216, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.moveTo(x - s * 0.75, y + s * 0.55);
    ctx.quadraticCurveTo(x - s * 0.85, y - s * 0.7, x, y - s * 0.85);
    ctx.quadraticCurveTo(x + s * 0.85, y - s * 0.7, x + s * 0.75, y + s * 0.55);
    ctx.quadraticCurveTo(x + s * 0.38, y + s * 0.3, x, y + s * 0.62);
    ctx.quadraticCurveTo(x - s * 0.38, y + s * 0.3, x - s * 0.75, y + s * 0.55);
    ctx.fill();
    ctx.fillStyle = '#12081f';
    ctx.beginPath();
    ctx.ellipse(x - s * 0.26, y - s * 0.18, s * 0.14, s * 0.2, 0, 0, Math.PI * 2);
    ctx.ellipse(x + s * 0.26, y - s * 0.18, s * 0.14, s * 0.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#b79cff';
    ctx.beginPath();
    ctx.arc(x - s * 0.26, y - s * 0.14, s * 0.05, 0, Math.PI * 2);
    ctx.arc(x + s * 0.26, y - s * 0.14, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(18, 8, 31, 0.8)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(x, y + s * 0.28, s * 0.12, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  } else {
    // nightmaw — the boss: horned maw with teeth and burning red eyes.
    const g = ctx.createRadialGradient(x, y, 1, x, y, s * 1.15);
    g.addColorStop(0, '#5b3a8e');
    g.addColorStop(0.55, '#3a2360');
    g.addColorStop(1, 'rgba(58, 35, 96, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, s * 1.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#d8c9a8';
    ctx.beginPath();
    ctx.moveTo(x - s * 0.7, y - s * 0.55);
    ctx.quadraticCurveTo(x - s * 1.05, y - s * 1.25, x - s * 0.45, y - s * 0.95);
    ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.6, x - s * 0.7, y - s * 0.55);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(x + s * 0.7, y - s * 0.55);
    ctx.quadraticCurveTo(x + s * 1.05, y - s * 1.25, x + s * 0.45, y - s * 0.95);
    ctx.quadraticCurveTo(x + s * 0.6, y - s * 0.6, x + s * 0.7, y - s * 0.55);
    ctx.fill();
    ctx.fillStyle = '#2a1848';
    for (let k = -1; k <= 1; k += 1) {
      ctx.beginPath();
      ctx.moveTo(x + k * s * 0.4 - s * 0.14, y - s * 0.78);
      ctx.lineTo(x + k * s * 0.4, y - s * 1.12);
      ctx.lineTo(x + k * s * 0.4 + s * 0.14, y - s * 0.78);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#4d0f1e';
    ctx.beginPath();
    ctx.ellipse(x, y + s * 0.28, s * 0.62, s * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff6e8';
    for (let k = -2; k <= 2; k += 1) {
      ctx.beginPath();
      ctx.moveTo(x + k * s * 0.22 - s * 0.08, y - s * 0.1);
      ctx.lineTo(x + k * s * 0.22, y + s * 0.12);
      ctx.lineTo(x + k * s * 0.22 + s * 0.08, y - s * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(x + k * s * 0.22 - s * 0.08, y + s * 0.64);
      ctx.lineTo(x + k * s * 0.22, y + s * 0.44);
      ctx.lineTo(x + k * s * 0.22 + s * 0.08, y + s * 0.64);
      ctx.closePath();
      ctx.fill();
    }
    ctx.fillStyle = '#ff5d73';
    ctx.shadowColor = '#ff5d73';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.ellipse(x - s * 0.34, y - s * 0.34, s * 0.15, s * 0.1, -0.25, 0, Math.PI * 2);
    ctx.ellipse(x + s * 0.34, y - s * 0.34, s * 0.15, s * 0.1, 0.25, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#1c0a12';
    ctx.beginPath();
    ctx.arc(x - s * 0.34, y - s * 0.34, s * 0.05, 0, Math.PI * 2);
    ctx.arc(x + s * 0.34, y - s * 0.34, s * 0.05, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

// Small wisp portrait for panels and the field guide.
function drawWispIcon(ctx, type, x, y, r, time) {
  const glow = ctx.createRadialGradient(x, y, 1, x, y, r * 1.9);
  glow.addColorStop(0, type === 'nightmaw' ? 'rgba(255, 93, 115, 0.5)' : 'rgba(155, 123, 255, 0.5)');
  glow.addColorStop(1, 'rgba(155, 123, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, r * 1.9, 0, Math.PI * 2);
  ctx.fill();
  drawWispShape(ctx, type, x, y, r * 0.95, time, 1);
}

function drawWisp(ctx, w, layout, time) {
  const p = cellCenter(layout, w.r, 0);
  const x = layout.boardX + w.x * layout.tile;
  const y = p.y + Math.sin(w.wobble) * layout.tile * 0.12;
  const s = layout.tile * w.size;
  ctx.save();
  // Fading trail behind the wisp (it travels left, so the trail is right).
  for (let k = 2; k >= 1; k -= 1) {
    ctx.save();
    ctx.globalAlpha = 0.16 / k;
    drawWispShape(ctx, w.type, x + k * s * 0.55, y + Math.sin(w.wobble - k * 0.4) * layout.tile * 0.08, s * (1 - k * 0.18), time, w.wobble);
    ctx.restore();
  }
  const glow = ctx.createRadialGradient(x, y, 1, x, y, s * 1.8);
  glow.addColorStop(0, w.type === 'nightmaw' ? 'rgba(255, 93, 115, 0.4)' : 'rgba(155, 123, 255, 0.4)');
  glow.addColorStop(1, 'rgba(155, 123, 255, 0)');
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(x, y, s * 1.8, 0, Math.PI * 2);
  ctx.fill();
  drawWispShape(ctx, w.type, x, y, s, time, w.wobble);
  if (w.maxHp > 1) {
    for (let i = 0; i < w.maxHp; i += 1) {
      ctx.fillStyle = i < w.hp ? '#ff5d73' : 'rgba(255,255,255,0.25)';
      ctx.beginPath();
      ctx.arc(x - (w.maxHp - 1) * 6 + i * 12, y - s * 1.25, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}

function drawParticles(ctx, state, layout) {
  for (const p of state.particles) {
    const alpha = Math.max(0, p.life / p.max);
    ctx.fillStyle = p.color;
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(layout.boardX + p.c * layout.tile + layout.tile / 2, layout.boardY + p.r * layout.tile + layout.tile / 2, 4 * alpha + 1, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}

function drawFloaters(ctx, state, layout) {
  ctx.textAlign = 'center';
  for (const f of state.floaters) {
    const frac = 1 - f.life / f.max;
    const p = cellCenter(layout, Math.max(0, Math.min(GRID_ROWS - 1, Math.round(f.r))), Math.max(0, Math.min(GRID_COLS - 1, Math.round(f.c))));
    ctx.save();
    ctx.globalAlpha = Math.max(0, Math.min(1, f.life / (f.max * 0.6)));
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 6;
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, p.x, p.y - frac * 34);
    ctx.restore();
  }
}

// Slow violet mist banks drifting over the board.
function drawFog(ctx, layout, time) {
  for (const f of FOGS) {
    const span = layout.boardW + 260;
    const fx = layout.boardX - 130 + (((f.x * layout.boardW + time * f.sp) % span) + span) % span;
    const fy = layout.boardY + f.y * layout.boardH + Math.sin(time * 0.4 + f.ph) * 10;
    const g = ctx.createRadialGradient(fx, fy, 4, fx, fy, layout.tile * f.r);
    g.addColorStop(0, 'rgba(150, 170, 255, 0.06)');
    g.addColorStop(1, 'rgba(150, 170, 255, 0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(fx, fy, layout.tile * f.r, 0, Math.PI * 2);
    ctx.fill();
  }
}

// Golden ember motes floating up across the screen.
function drawEmberMotes(ctx, layout, time) {
  for (const m of MOTES) {
    const y = layout.height - (((m.y * layout.height + time * m.sp) % layout.height) + layout.height) % layout.height;
    const x = m.x * layout.width + Math.sin(time * 0.8 + m.ph) * 14;
    const tw = 0.35 + 0.4 * Math.abs(Math.sin(time * 1.6 + m.ph));
    ctx.save();
    ctx.globalAlpha = tw;
    ctx.fillStyle = '#ffc94d';
    ctx.shadowColor = '#ff7a3d';
    ctx.shadowBlur = 6;
    ctx.beginPath();
    ctx.arc(x, y, m.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// Soft dark edges so the middle of the board pops.
function drawVignette(ctx, layout) {
  const g = ctx.createRadialGradient(
    layout.width / 2, layout.height / 2, Math.min(layout.width, layout.height) * 0.36,
    layout.width / 2, layout.height / 2, Math.max(layout.width, layout.height) * 0.72,
  );
  g.addColorStop(0, 'rgba(5, 8, 20, 0)');
  g.addColorStop(1, 'rgba(5, 8, 20, 0.38)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, layout.width, layout.height);
}

// ---------- TOP BAR: night progress, score, flames, WIN/LOSE ----------
function drawTopBar(ctx, state, layout, world) {
  // Soft dark ribbon behind the bar so text reads over the painted sky.
  const ribbon = ctx.createLinearGradient(0, 0, 0, 88);
  ribbon.addColorStop(0, 'rgba(8, 12, 30, 0.72)');
  ribbon.addColorStop(1, 'rgba(8, 12, 30, 0)');
  ctx.fillStyle = ribbon;
  ctx.fillRect(0, 0, layout.width, 88);

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 24px Georgia, serif';
  ctx.fillText('BEAMKEEPER', 24, 34);
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillStyle = COLORS.accent;
  ctx.fillText(`NIGHT ${state.night}/${NIGHTS_TOTAL}`, 24, 58);
  for (let i = 0; i < NIGHTS_TOTAL; i += 1) {
    const cx = 130 + i * 20;
    ctx.fillStyle = i < state.night - 1 ? COLORS.accent : i === state.night - 1 ? COLORS.ember : 'rgba(255,255,255,0.18)';
    ctx.beginPath();
    ctx.arc(cx, 53, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.textAlign = 'center';
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillStyle = COLORS.good;
  ctx.fillText('WIN: light all 3 braziers', layout.width / 2, 30);
  ctx.fillStyle = COLORS.danger;
  ctx.fillText('LOSE: lantern flame hits 0  •  or dawn arrives first', layout.width / 2, 50);

  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 30px Georgia, serif';
  ctx.fillText(`${state.score}`, layout.width - 24, 36);
  ctx.fillStyle = COLORS.textDim;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('SCORE', layout.width - 24, 52);
  const barW = 150;
  const barX = layout.width - 24 - barW;
  const barY = 56;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, barX, barY, barW, 10, 5);
  ctx.fill();
  if (state.flames > 0) {
    const fb = ctx.createLinearGradient(barX, barY, barX + barW, barY);
    fb.addColorStop(0, '#ff7a3d');
    fb.addColorStop(1, '#ffc94d');
    ctx.fillStyle = fb;
    roundRect(ctx, barX, barY, Math.max(8, barW * (state.flames / state.maxFlames)), 10, 5);
    ctx.fill();
  }
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.textAlign = 'left';
  ctx.fillText(`LANTERN ${state.flames}/${state.maxFlames}`, barX - 108, barY + 9);
  ctx.textAlign = 'right';
  ctx.fillStyle = COLORS.textDim;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`Dawn ${Math.ceil(state.timeLeft)}s  •  Braziers ${state.braziersLit}/3`, layout.width - 24, 82);

  // Thin gold divider under the bar.
  const dg = ctx.createLinearGradient(0, 0, layout.width, 0);
  dg.addColorStop(0, 'rgba(255, 201, 77, 0)');
  dg.addColorStop(0.5, 'rgba(255, 201, 77, 0.4)');
  dg.addColorStop(1, 'rgba(255, 201, 77, 0)');
  ctx.fillStyle = dg;
  ctx.fillRect(0, 86, layout.width, 1);
  void world;
}

// ---------- PANEL KANAN: INCOMING ----------
function drawRightPanel(ctx, state, layout, time) {
  const x = layout.panelX;
  const y = layout.boardY;
  const w = layout.panelW;
  const h = layout.boardH;
  panel(ctx, x, y, w, h, 14, 0.94);

  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('INCOMING', x + 14, y + 28);
  ctx.fillStyle = COLORS.textDim;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText(`Night ${state.night} — wisp queue`, x + 14, y + 46);

  const upcoming = state.spawnQueue.slice(0, 5);
  if (upcoming.length === 0 && state.wisps.length === 0) {
    ctx.fillStyle = COLORS.good;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('— clear skies —', x + 14, y + 80);
  }
  upcoming.forEach((entry, i) => {
    const type = WISP_TYPES[entry.type];
    const eta = Math.max(0, Math.ceil(entry.at - state.elapsed));
    const ry = y + 74 + i * 44;
    drawWispIcon(ctx, entry.type, x + 26, ry - 4, 10, time);
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(type.name, x + 42, ry);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(`row ${entry.row + 1}  •  ${type.hp} HP`, x + 42, ry + 15);
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'right';
    ctx.fillText(`in ${eta}s`, x + w - 14, ry);
    ctx.textAlign = 'left';
  });

  const sepY = y + 74 + 5 * 44 + 6;
  ctx.strokeStyle = 'rgba(255, 201, 77, 0.3)';
  ctx.beginPath();
  ctx.moveTo(x + 14, sepY);
  ctx.lineTo(x + w - 14, sepY);
  ctx.stroke();

  ctx.fillStyle = '#ff7a3d';
  ctx.save();
  ctx.translate(x + 20, sepY + 20);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-5, -5, 10, 10);
  ctx.restore();
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText(`EMBER  ◆ ${state.embers}`, x + 32, sepY + 26);
  ctx.fillStyle = COLORS.textDim;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('1 ember per wisp burned', x + 14, sepY + 44);
  ctx.fillText(`Wisps burned: ${state.wispsBurned}`, x + 14, sepY + 62);
  ctx.fillText(`Best combo: x${state.bestCombo}`, x + 14, sepY + 80);
  ctx.fillText(`Boons owned: ${state.boons.length}`, x + 14, sepY + 98);
  if (state.night < NIGHTS_TOTAL) {
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText(`NEXT: NIGHT ${state.night + 1}`, x + 14, sepY + 126);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '12px system-ui, sans-serif';
    const pool = { 2: 'NEW: Drift', 3: 'NEW: Husk', 4: 'NEW: Gloom', 5: 'BOSS: Nightmaw' }[state.night + 1] ?? '';
    ctx.fillText(pool, x + 14, sepY + 144);
  }
}

// ---------- TOOLBAR BAWAH ----------
export function toolbarButtons(layout) {
  const y = layout.toolbarY;
  const right = layout.toolbarX + layout.toolbarW;
  return {
    flare: { x: layout.toolbarX, y, w: 140, h: 52 },
    pause: { x: right - 256, y, w: 80, h: 52 },
    sound: { x: right - 168, y, w: 80, h: 52 },
    restart: { x: right - 80, y, w: 80, h: 52 },
  };
}

function drawToolbar(ctx, state, layout, ui, world, time) {
  const y = layout.toolbarY;
  const btns = toolbarButtons(layout);
  const slotX0 = btns.flare.x + btns.flare.w + 16;
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.textDim;
  ctx.font = 'bold 12px system-ui, sans-serif';
  ctx.fillText('BOONS', slotX0, y + 16);
  if (state.boons.length === 0) {
    ctx.fillStyle = 'rgba(170, 179, 214, 0.75)';
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText('Clear a night to earn boons — they appear here.', slotX0, y + 38);
  } else {
    state.boons.forEach((key, i) => {
      const sx = slotX0 + i * 58;
      const g = ctx.createLinearGradient(sx, y + 22, sx, y + 50);
      g.addColorStop(0, '#2a3468');
      g.addColorStop(1, '#1b2247');
      ctx.fillStyle = g;
      roundRect(ctx, sx, y + 22, 52, 28, 7);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 201, 77, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = COLORS.accent;
      ctx.font = 'bold 10px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(BOONS[key].name.split(' ')[0].toUpperCase(), sx + 26, y + 34);
      ctx.fillStyle = COLORS.textDim;
      ctx.font = '9px system-ui, sans-serif';
      ctx.fillText(BOONS[key].family.toUpperCase(), sx + 26, y + 45);
    });
  }
  ctx.textAlign = 'left';

  // FLARE slot with a little flame glyph and cooldown.
  const f = btns.flare;
  const ready = state.flareCooldown <= 0;
  if (ready) {
    ctx.save();
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 16;
    const fg = ctx.createLinearGradient(f.x, f.y, f.x, f.y + f.h);
    fg.addColorStop(0, '#5a4517');
    fg.addColorStop(1, '#3a2f10');
    ctx.fillStyle = fg;
    roundRect(ctx, f.x, f.y, f.w, f.h, 10);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, f.x, f.y, f.w, f.h, 10);
    ctx.fill();
  }
  ctx.strokeStyle = ready ? COLORS.accent : COLORS.panelEdge;
  ctx.lineWidth = ready ? 2 : 1.5;
  roundRect(ctx, f.x, f.y, f.w, f.h, 10);
  ctx.stroke();
  drawFlame(ctx, f.x + 16, f.y + 30, 9, time, 2);
  ctx.fillStyle = ready ? COLORS.accent : COLORS.textDim;
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(ready ? 'FLARE [F]' : `FLARE ${Math.ceil(state.flareCooldown)}s`, f.x + f.w / 2 + 8, f.y + 22);
  ctx.fillStyle = COLORS.textDim;
  ctx.font = '11px system-ui, sans-serif';
  ctx.fillText('burn wisps in beam', f.x + f.w / 2 + 8, f.y + 40);

  const small = (b, label, sub) => {
    const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
    g.addColorStop(0, 'rgba(255,255,255,0.10)');
    g.addColorStop(1, 'rgba(255,255,255,0.04)');
    ctx.fillStyle = g;
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.fill();
    ctx.strokeStyle = COLORS.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, b.x + b.w / 2, b.y + 22);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(sub, b.x + b.w / 2, b.y + 40);
  };
  small(btns.pause, state.paused ? 'RESUME' : 'PAUSE', '[P]');
  small(btns.sound, ui.muted ? 'MUTE' : 'SOUND', '[M]');
  small(btns.restart, 'RESTART', '[R]');
  void world;
}

// ---------- TITLE: the poster IS the whole screen ----------
// One painted illustration fills the entire title screen — a giant
// lantern on a hill throwing a golden beam to a burning brazier, under
// the moon, with wisps and fireflies — and the GOAL / HOW TO PLAY /
// difficulty / field-guide panels float over it, semi-transparent.
export function titleButtons(layout) {
  const bw = 176;
  const bh = 48;
  const gap = 14;
  const x0 = 60;
  const y0 = 560;
  return {
    diffs: DIFFICULTY_ORDER.map((key, i) => ({ key, x: x0 + i * (bw + gap), y: y0, w: bw, h: bh })),
    play: { x: 60, y: 626, w: 596, h: 62 },
  };
}

const FEATS = [
  { key: 'first-light', name: 'First Light', blurb: 'Clear Night 1.' },
  { key: 'wispbane-10', name: 'Wispbane 10', blurb: 'Burn 10 wisps in one run.' },
  { key: 'flawless', name: 'Flawless Night', blurb: 'Clear a night with grade S.' },
  { key: 'dawnkeeper', name: 'Dawnkeeper', blurb: 'Clear all 5 nights.' },
];

// The full-screen poster: valley sky, moon, hills, a hilltop with the
// giant lantern, a sweeping golden beam, a burning brazier, pines and
// fireflies. Panels are drawn over this, semi-transparent.
function drawTitlePoster(ctx, layout, time) {
  const W = layout.width;
  const H = layout.height;
  // Title moon: small, tucked in the top-right corner above the brazier.
  drawSky(ctx, layout, time, { x: W - 58, y: 62, r: 30 });

  // A grassy hilltop rising behind the title band.
  const hill = ctx.createLinearGradient(0, 120, 0, 260);
  hill.addColorStop(0, '#2a7a4e');
  hill.addColorStop(1, '#17543a');
  ctx.fillStyle = hill;
  ctx.beginPath();
  ctx.moveTo(0, 210);
  ctx.quadraticCurveTo(W * 0.22, 130, W * 0.5, 176);
  ctx.quadraticCurveTo(W * 0.78, 128, W, 196);
  ctx.lineTo(W, 260);
  ctx.lineTo(0, 260);
  ctx.closePath();
  ctx.fill();

  // Giant hero lantern on the hilltop, left — with a big living flame.
  const lx = 150;
  const ly = 150;
  const lg = ctx.createRadialGradient(lx, ly, 4, lx, ly, 130);
  lg.addColorStop(0, 'rgba(255, 190, 90, 0.65)');
  lg.addColorStop(1, 'rgba(255, 190, 90, 0)');
  ctx.fillStyle = lg;
  ctx.beginPath();
  ctx.arc(lx, ly, 130, 0, Math.PI * 2);
  ctx.fill();
  // The lantern hangs on a chain from the top of the frame.
  ctx.strokeStyle = '#8a6a2f';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(lx, 20);
  ctx.lineTo(lx, ly - 46);
  ctx.stroke();
  ctx.fillStyle = '#3d2f10';
  ctx.beginPath();
  ctx.moveTo(lx - 30, ly - 44);
  ctx.quadraticCurveTo(lx, ly - 64, lx + 30, ly - 44);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.arc(lx, ly - 62, 6, 0, Math.PI * 2);
  ctx.fill();
  const glass = ctx.createLinearGradient(lx - 26, ly - 38, lx + 26, ly + 38);
  glass.addColorStop(0, '#fff3c4');
  glass.addColorStop(0.5, '#ffd76a');
  glass.addColorStop(1, '#ff9d45');
  ctx.save();
  ctx.shadowColor = 'rgba(255, 190, 90, 0.9)';
  ctx.shadowBlur = 26;
  ctx.fillStyle = glass;
  roundRect(ctx, lx - 26, ly - 38, 52, 76, 10);
  ctx.fill();
  ctx.restore();
  drawFlame(ctx, lx, ly + 30, 26, time, 5);
  drawFlame(ctx, lx - 14, ly + 32, 14, time, 8);
  ctx.strokeStyle = '#5d4517';
  ctx.lineWidth = 4;
  roundRect(ctx, lx - 26, ly - 38, 52, 76, 10);
  ctx.stroke();
  ctx.fillStyle = '#3d2f10';
  roundRect(ctx, lx - 31, ly + 38, 62, 12, 5);
  ctx.fill();
  drawRisingEmbers(ctx, lx, ly - 40, time, 3, 4);

  // The golden beam sweeping from the lantern across the poster.
  ctx.save();
  ctx.lineCap = 'round';
  ctx.strokeStyle = 'rgba(255, 201, 77, 0.22)';
  ctx.lineWidth = 36;
  ctx.beginPath();
  ctx.moveTo(lx + 30, ly + 6);
  ctx.lineTo(W - 200, 132);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(255, 201, 77, 0.4)';
  ctx.lineWidth = 15;
  ctx.beginPath();
  ctx.moveTo(lx + 30, ly + 6);
  ctx.lineTo(W - 200, 132);
  ctx.stroke();
  ctx.shadowColor = '#ffc94d';
  ctx.shadowBlur = 18;
  ctx.strokeStyle = 'rgba(255, 243, 196, 0.9)';
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(lx + 30, ly + 6);
  ctx.lineTo(W - 200, 132);
  ctx.stroke();
  ctx.restore();

  // Burning hero brazier on the right hilltop.
  const bx = W - 178;
  const by = 160;
  const bg = ctx.createRadialGradient(bx, by - 10, 2, bx, by - 10, 100);
  bg.addColorStop(0, 'rgba(255, 122, 61, 0.6)');
  bg.addColorStop(1, 'rgba(255, 122, 61, 0)');
  ctx.fillStyle = bg;
  ctx.beginPath();
  ctx.arc(bx, by - 10, 100, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#4a4a68';
  ctx.beginPath();
  ctx.arc(bx, by + 10, 42, 0, Math.PI);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#8a6a2f';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(bx, by + 10, 42, Math.PI, 0);
  ctx.stroke();
  ctx.fillStyle = '#2c3050';
  ctx.fillRect(bx - 6, by + 10, 12, 32);
  ctx.fillStyle = '#3a3f5c';
  ctx.fillRect(bx - 15, by + 40, 30, 6);
  drawFlame(ctx, bx, by + 10, 42, time, 9);
  drawFlame(ctx, bx - 18, by + 10, 24, time, 12);
  drawFlame(ctx, bx + 17, by + 10, 20, time, 15);
  drawRisingEmbers(ctx, bx, by - 10, time, 7, 4);
  drawSmoke(ctx, bx + 12, by - 30, time, 9, 0.3);

  // Wisps drifting through the poster, clear of the title lettering.
  const wispSpots = [
    { type: 'mote', fx: 0.30, fy: 0.30, amp: 8, sp: 1.1 },
    { type: 'drift', fx: 0.72, fy: 0.22, amp: 10, sp: 1.6 },
    { type: 'gloom', fx: 0.60, fy: 0.34, amp: 7, sp: 0.9 },
  ];
  for (const ws of wispSpots) {
    const wx = ws.fx * W + Math.sin(time * 0.5 + ws.fx * 20) * 12;
    const wy = ws.fy * 200 + Math.sin(time * ws.sp + ws.fx * 9) * ws.amp;
    drawWispIcon(ctx, ws.type, wx, wy, 16, time);
  }

  // Title + tagline, centered over the poster.
  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = '#ffc94d';
  ctx.shadowBlur = 30;
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 62px Georgia, serif';
  ctx.fillText('BEAMKEEPER', W / 2, 96);
  ctx.restore();
  ctx.fillStyle = '#f5efe0';
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Five nights. One beam. Keep the lantern lit.', W / 2, 124);

  // Gold rule under the poster band.
  const rg = ctx.createLinearGradient(0, 0, W, 0);
  rg.addColorStop(0, 'rgba(255, 201, 77, 0)');
  rg.addColorStop(0.5, 'rgba(255, 201, 77, 0.55)');
  rg.addColorStop(1, 'rgba(255, 201, 77, 0)');
  ctx.fillStyle = rg;
  ctx.fillRect(0, 167, W, 2);
}

function drawTitle(ctx, state, layout, ui, time) {
  drawTitlePoster(ctx, layout, time);

  // Left panel: goal / how to play / difficulty / PLAY — semi-transparent
  // so the poster glows through.
  panel(ctx, 36, 180, 620, 564, 18, 0.7);

  ctx.textAlign = 'left';
  ctx.font = 'bold 14px system-ui, sans-serif';
  ctx.fillStyle = COLORS.text;
  ctx.fillText('GOAL:  Light all 3 braziers every night, for 5 nights.', 60, 232);
  ctx.fillStyle = COLORS.good;
  ctx.fillText('WIN:  Clear Night 5 — the dawn is yours.', 60, 254);
  ctx.fillStyle = COLORS.danger;
  ctx.fillText('LOSE:  Lantern flame hits 0, or dawn arrives first.', 60, 276);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('HOW TO PLAY', 60, 316);
  const steps = [
    '1.  Click a mirror to rotate it 90°.',
    '2.  Guide the golden beam into every brazier.',
    '3.  The beam burns wisps — keep them off the lantern.',
  ];
  ctx.fillStyle = COLORS.text;
  ctx.font = '14px system-ui, sans-serif';
  steps.forEach((s, i) => ctx.fillText(s, 60, 342 + i * 22));

  // Mini icon strip: rotate, guide, light.
  ctx.strokeStyle = 'rgba(255, 201, 77, 0.35)';
  ctx.beginPath();
  ctx.moveTo(60, 408);
  ctx.lineTo(632, 408);
  ctx.stroke();
  const iconY = 448;
  ctx.save();
  ctx.translate(150, iconY - 8);
  ctx.rotate(-Math.PI / 4);
  ctx.fillStyle = '#d7e3ff';
  roundRect(ctx, -22, -5, 44, 10, 5);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#ffd76a';
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('↻', 184, iconY - 16);
  ctx.fillStyle = COLORS.text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('ROTATE mirrors', 150, iconY + 26);
  ctx.save();
  ctx.strokeStyle = '#ffc94d';
  ctx.lineWidth = 6;
  ctx.lineCap = 'round';
  ctx.shadowColor = '#ffc94d';
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(300, iconY - 8);
  ctx.lineTo(360, iconY + 8);
  ctx.stroke();
  ctx.restore();
  ctx.fillStyle = COLORS.text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('GUIDE the beam', 330, iconY + 26);
  drawFlame(ctx, 512, iconY + 12, 20, time, 6);
  ctx.fillStyle = COLORS.text;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('LIGHT braziers', 512, iconY + 26);
  ctx.textAlign = 'left';

  const buttons = titleButtons(layout);
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 15px system-ui, sans-serif';
  ctx.fillText('CHOOSE DIFFICULTY', 60, 512);
  for (const b of buttons.diffs) {
    const d = DIFFICULTIES[b.key];
    const selected = ui.selectedDifficulty === b.key;
    if (selected) {
      ctx.save();
      ctx.shadowColor = COLORS.accent;
      ctx.shadowBlur = 14;
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, '#5a4517');
      g.addColorStop(1, '#3a2f10');
      ctx.fillStyle = g;
      roundRect(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fill();
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0.04)');
      ctx.fillStyle = g;
      roundRect(ctx, b.x, b.y, b.w, b.h, 10);
      ctx.fill();
    }
    ctx.strokeStyle = selected ? COLORS.accent : COLORS.panelEdge;
    ctx.lineWidth = selected ? 2.5 : 1.5;
    roundRect(ctx, b.x, b.y, b.w, b.h, 10);
    ctx.stroke();
    ctx.fillStyle = selected ? COLORS.accent : COLORS.text;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${d.label}  ×${d.mult.toFixed(2)}`, b.x + b.w / 2, b.y + 20);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(b.key === 'easy' ? '150s • slow wisps' : b.key === 'normal' ? '110s • steady wisps' : '80s • fast wisps', b.x + b.w / 2, b.y + 36);
    ctx.textAlign = 'left';
  }
  const p = buttons.play;
  ctx.save();
  ctx.shadowColor = COLORS.accent;
  ctx.shadowBlur = 24;
  const pg = ctx.createLinearGradient(p.x, p.y, p.x, p.y + p.h);
  pg.addColorStop(0, '#ffd76a');
  pg.addColorStop(1, '#f0a832');
  ctx.fillStyle = pg;
  roundRect(ctx, p.x, p.y, p.w, p.h, 14);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = '#241a05';
  ctx.font = 'bold 26px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('▶  PLAY — NIGHT 1', p.x + p.w / 2, p.y + 41);
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.textDim;
  ctx.font = '12px system-ui, sans-serif';
  ctx.fillText('Hotkeys:  R restart  •  M sound  •  F flare  •  P pause  •  1-3 pick boon', 60, 722);

  // Right panel: field guide with real wisp portraits + best + feats + runs.
  const rx = 680;
  const rw = 564;
  panel(ctx, rx, 180, rw, 564, 18, 0.7);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('WISP FIELD GUIDE', rx + 24, 212);
  const types = ['mote', 'drift', 'husk', 'gloom', 'nightmaw'];
  types.forEach((key, i) => {
    const t = WISP_TYPES[key];
    const y = 238 + i * 36;
    drawWispIcon(ctx, key, rx + 36, y - 4, 11, time);
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`${t.name}  —  ${t.hp} HP  •  +${t.score}`, rx + 54, y);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '12px system-ui, sans-serif';
    ctx.fillText(t.blurb, rx + 54, y + 15);
  });

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('BEST SCORE', rx + 24, 440);
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText(`${state.best}`, rx + 24, 478);

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('FEATS', rx + 24, 518);
  FEATS.forEach((f, i) => {
    const got = state.feats.includes(f.key);
    const y = 542 + i * 22;
    ctx.fillStyle = got ? COLORS.good : 'rgba(255,255,255,0.25)';
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(got ? '✓' : '○', rx + 24, y);
    ctx.fillStyle = got ? COLORS.text : COLORS.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText(`${f.name} — ${f.blurb}`, rx + 48, y);
  });

  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('LAST RUNS', rx + 24, 648);
  if (state.runs.length === 0) {
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('No runs yet — your legend starts tonight.', rx + 24, 672);
  } else {
    state.runs.forEach((run, i) => {
      ctx.fillStyle = COLORS.text;
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(`${run.won ? '★' : '·'}  ${run.date} — Night ${run.nights}/5  •  ${run.score} pts`, rx + 24, 672 + i * 20);
    });
  }
}

// ---------- BOON: pick 1 of 3 + shop ----------
export function boonButtons(layout) {
  const cw = 280;
  const ch = 280;
  const gap = 20;
  const total = cw * 3 + gap * 2;
  const x0 = (layout.width - total) / 2;
  const y0 = 170;
  const cards = [0, 1, 2].map((i) => ({ index: i, x: x0 + i * (cw + gap), y: y0, w: cw, h: ch }));
  const sw = 200;
  const shop = SHOP.map((s, i) => ({ key: s.key, x: x0 + i * (sw + gap), y: y0 + ch + 24, w: sw, h: 64 }));
  return {
    cards,
    shop,
    next: { x: x0 + 3 * (sw + gap), y: y0 + ch + 24, w: 200, h: 64 },
  };
}

const RARITY_COLOR = { Common: '#aab3d6', Rare: '#7be495', Epic: '#ffc94d' };

// Small glyph per boon family, drawn inside a gold-ringed medallion.
function drawBoonIcon(ctx, family, x, y, r, time) {
  const g = ctx.createRadialGradient(x, y, 2, x, y, r);
  g.addColorStop(0, 'rgba(255, 201, 77, 0.35)');
  g.addColorStop(1, 'rgba(255, 201, 77, 0.05)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = COLORS.accent;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.save();
  if (family === 'Beam') {
    ctx.strokeStyle = '#ffc94d';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#ffc94d';
    ctx.shadowBlur = 8;
    ctx.beginPath();
    ctx.moveTo(x - r * 0.55, y + r * 0.3);
    ctx.lineTo(x, y - r * 0.35);
    ctx.lineTo(x + r * 0.55, y + r * 0.3);
    ctx.stroke();
  } else if (family === 'Lantern') {
    ctx.fillStyle = 'rgba(255, 215, 106, 0.3)';
    roundRect(ctx, x - r * 0.3, y - r * 0.45, r * 0.6, r * 0.9, 3);
    ctx.fill();
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 2;
    roundRect(ctx, x - r * 0.3, y - r * 0.45, r * 0.6, r * 0.9, 3);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - r * 0.55);
    ctx.lineTo(x, y - r * 0.45);
    ctx.stroke();
    drawFlame(ctx, x, y + r * 0.28, r * 0.34, time, 4);
  } else if (family === 'Time') {
    ctx.strokeStyle = '#ffd76a';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, r * 0.55, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x, y - r * 0.35);
    ctx.moveTo(x, y);
    ctx.lineTo(x + r * 0.28, y + r * 0.12);
    ctx.stroke();
  } else if (family === 'Score') {
    ctx.fillStyle = '#ffc94d';
    ctx.beginPath();
    for (let k = 0; k < 5; k += 1) {
      const a = -Math.PI / 2 + (k / 5) * Math.PI * 2;
      const a2 = a + Math.PI / 5;
      const px = x + Math.cos(a) * r * 0.6;
      const py = y + Math.sin(a) * r * 0.6;
      const qx = x + Math.cos(a2) * r * 0.26;
      const qy = y + Math.sin(a2) * r * 0.26;
      if (k === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
      ctx.lineTo(qx, qy);
    }
    ctx.closePath();
    ctx.fill();
  } else {
    drawFlame(ctx, x, y + r * 0.3, r * 0.55, time, 7);
  }
  ctx.restore();
}

function drawBoon(ctx, state, layout, time) {
  drawSky(ctx, layout, time);
  // Warm hearth glow behind the cards.
  const glow = ctx.createRadialGradient(layout.width / 2, 300, 10, layout.width / 2, 300, 560);
  glow.addColorStop(0, 'rgba(255, 170, 70, 0.18)');
  glow.addColorStop(1, 'rgba(255, 170, 70, 0)');
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, layout.width, layout.height);
  drawEmberMotes(ctx, layout, time);

  ctx.textAlign = 'center';
  ctx.save();
  ctx.shadowColor = COLORS.accent;
  ctx.shadowBlur = 18;
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 34px Georgia, serif';
  ctx.fillText(`NIGHT ${state.night} CLEAR`, layout.width / 2, 96);
  ctx.restore();
  ctx.fillStyle = COLORS.text;
  ctx.font = '16px system-ui, sans-serif';
  const grade = state.grades[state.grades.length - 1] ?? '—';
  ctx.fillText(`Grade ${grade}  •  ${state.embers} ember in the coffer`, layout.width / 2, 124);
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 20px system-ui, sans-serif';
  ctx.fillText('CHOOSE A BOON — PICK 1 OF 3', layout.width / 2, 156);

  const btns = boonButtons(layout);
  btns.cards.forEach((card, i) => {
    const key = state.boonChoices[i];
    if (!key) return;
    const b = BOONS[key];
    ctx.save();
    ctx.shadowColor = RARITY_COLOR[b.rarity];
    ctx.shadowBlur = 18;
    ctx.shadowOffsetY = 6;
    const cg = ctx.createLinearGradient(card.x, card.y, card.x, card.y + card.h);
    cg.addColorStop(0, '#232c56');
    cg.addColorStop(1, '#141b3a');
    ctx.fillStyle = cg;
    roundRect(ctx, card.x, card.y, card.w, card.h, 14);
    ctx.fill();
    ctx.restore();
    ctx.strokeStyle = RARITY_COLOR[b.rarity];
    ctx.lineWidth = 2;
    roundRect(ctx, card.x, card.y, card.w, card.h, 14);
    ctx.stroke();
    ctx.fillStyle = RARITY_COLOR[b.rarity];
    roundRect(ctx, card.x, card.y, card.w, 5, 2);
    ctx.fill();
    drawBoonIcon(ctx, b.family, card.x + card.w - 42, card.y + 52, 22, time);
    ctx.textAlign = 'left';
    ctx.fillStyle = RARITY_COLOR[b.rarity];
    ctx.font = 'bold 12px system-ui, sans-serif';
    ctx.fillText(`[${i + 1}]  ${b.rarity.toUpperCase()}  •  ${b.family.toUpperCase()}`, card.x + 18, card.y + 30);
    ctx.fillStyle = COLORS.text;
    ctx.font = 'bold 22px Georgia, serif';
    ctx.fillText(b.name, card.x + 18, card.y + 66);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '14px system-ui, sans-serif';
    wrapText(ctx, b.blurb, card.x + 18, card.y + 96, card.w - 36, 20);
    ctx.fillStyle = COLORS.accent;
    ctx.font = '12px system-ui, sans-serif';
    wrapText(ctx, b.synergy, card.x + 18, card.y + 190, card.w - 36, 17);
  });

  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.accent;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText('— SHOP —', layout.width / 2, btns.shop[0].y - 8);
  btns.shop.forEach((s) => {
    const item = SHOP.find((x) => x.key === s.key);
    const afford = state.embers >= item.cost;
    if (afford) {
      const sg = ctx.createLinearGradient(s.x, s.y, s.x, s.y + s.h);
      sg.addColorStop(0, '#232c56');
      sg.addColorStop(1, '#141b3a');
      ctx.fillStyle = sg;
    } else {
      ctx.fillStyle = 'rgba(255,255,255,0.04)';
    }
    roundRect(ctx, s.x, s.y, s.w, s.h, 10);
    ctx.fill();
    ctx.strokeStyle = afford ? COLORS.ember : COLORS.panelEdge;
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.fillStyle = afford ? COLORS.text : COLORS.textDim;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(`${item.name}  ◆${item.cost}`, s.x + s.w / 2, s.y + 24);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '11px system-ui, sans-serif';
    ctx.fillText(item.blurb, s.x + s.w / 2, s.y + 44);
  });
  const n = btns.next;
  const picked = state.boonChoices.length === 0;
  if (picked) {
    ctx.save();
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 16;
    const ng = ctx.createLinearGradient(n.x, n.y, n.x, n.y + n.h);
    ng.addColorStop(0, '#ffd76a');
    ng.addColorStop(1, '#f0a832');
    ctx.fillStyle = ng;
    roundRect(ctx, n.x, n.y, n.w, n.h, 10);
    ctx.fill();
    ctx.restore();
  } else {
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    roundRect(ctx, n.x, n.y, n.w, n.h, 10);
    ctx.fill();
  }
  ctx.fillStyle = picked ? '#241a05' : COLORS.textDim;
  ctx.font = 'bold 16px system-ui, sans-serif';
  ctx.fillText(picked ? `NEXT: NIGHT ${state.night + 1} ▶` : 'PICK A BOON ↑', n.x + n.w / 2, n.y + 39);

  ctx.fillStyle = COLORS.textDim;
  ctx.font = '13px system-ui, sans-serif';
  ctx.fillText('Boons last the whole run. Embers carry over between nights — spend them well.', layout.width / 2, btns.shop[0].y + 108);
}

// ---------- AKHIR: victory / defeat ----------
// Lose panel grows when cleared nights leave a stats table to show.
export function endPanelH(won, statsCount = 0) {
  if (won) return 600;
  return statsCount > 0 ? 456 + 34 + statsCount * 24 : 456;
}

export function endButtons(layout, won, statsCount = 0) {
  const panelH = endPanelH(won, statsCount);
  const px = (layout.width - 640) / 2;
  const y = (layout.height - panelH) / 2 + panelH - 76;
  if (won) {
    return {
      again: { x: px + 20, y, w: 190, h: 56 },
      seed: { x: px + 225, y, w: 190, h: 56 },
      menu: { x: px + 430, y, w: 190, h: 56 },
    };
  }
  return {
    retry: { x: layout.width / 2 - 215, y, w: 200, h: 56 },
    menu: { x: layout.width / 2 + 15, y, w: 200, h: 56 },
  };
}

function statsTable(ctx, state, layout, y0) {
  const x = layout.width / 2 - 260;
  ctx.textAlign = 'left';
  ctx.fillStyle = COLORS.textDim;
  ctx.font = 'bold 13px system-ui, sans-serif';
  ctx.fillText('NIGHT', x, y0);
  ctx.fillText('WISPS', x + 110, y0);
  ctx.fillText('BRAZIERS', x + 200, y0);
  ctx.fillText('GRADE', x + 310, y0);
  ctx.fillText('TIME LEFT', x + 400, y0);
  ctx.strokeStyle = 'rgba(255, 201, 77, 0.3)';
  ctx.beginPath();
  ctx.moveTo(x, y0 + 8);
  ctx.lineTo(x + 520, y0 + 8);
  ctx.stroke();
  state.nightStats.forEach((s, i) => {
    const y = y0 + 32 + i * 24;
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`${s.night}`, x, y);
    ctx.fillText(`${s.wisps}`, x + 110, y);
    ctx.fillText(`${s.braziers}/3`, x + 200, y);
    ctx.fillStyle = s.grade === 'S' ? COLORS.accent : s.grade === 'A' ? COLORS.good : COLORS.text;
    ctx.font = 'bold 14px system-ui, sans-serif';
    ctx.fillText(s.grade, x + 310, y);
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`${s.timeLeft}s`, x + 400, y);
  });
  return y0 + 32 + state.nightStats.length * 24;
}

function drawEnd(ctx, state, layout, won, time) {
  // Backdrop first: a painted dawn for a win, a cold valley for a loss.
  if (won) {
    const dawn = ctx.createLinearGradient(0, 0, 0, layout.height);
    dawn.addColorStop(0, '#3a2a10');
    dawn.addColorStop(0.35, '#7a4a1e');
    dawn.addColorStop(0.7, '#2c2158');
    dawn.addColorStop(1, '#171233');
    ctx.fillStyle = dawn;
    ctx.fillRect(0, 0, layout.width, layout.height);
    // Rising sun with rays fanning down.
    const sun = ctx.createRadialGradient(layout.width / 2, 40, 4, layout.width / 2, 40, 260);
    sun.addColorStop(0, 'rgba(255, 220, 130, 0.9)');
    sun.addColorStop(0.4, 'rgba(255, 170, 70, 0.35)');
    sun.addColorStop(1, 'rgba(255, 170, 70, 0)');
    ctx.fillStyle = sun;
    ctx.fillRect(0, 0, layout.width, layout.height);
    ctx.fillStyle = '#fff3c4';
    ctx.beginPath();
    ctx.arc(layout.width / 2, 40, 34, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = '#ffc94d';
    for (let k = -3; k <= 3; k += 1) {
      ctx.beginPath();
      ctx.moveTo(layout.width / 2, 40);
      ctx.lineTo(layout.width / 2 + k * 170 - 60, layout.height * 0.55);
      ctx.lineTo(layout.width / 2 + k * 170 + 60, layout.height * 0.55);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
    // Ember confetti rising around the panel.
    for (let i = 0; i < 26; i += 1) {
      const ex = hash1(i * 5 + 2) * layout.width;
      const ey = layout.height - (((hash1(i * 5 + 3) * layout.height + time * (10 + hash1(i) * 22)) % layout.height) + layout.height) % layout.height;
      ctx.save();
      ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(time * 2 + i));
      ctx.fillStyle = i % 3 === 0 ? '#ff7a3d' : '#ffc94d';
      ctx.beginPath();
      ctx.arc(ex, ey, 1.5 + hash1(i * 7) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  } else {
    drawSky(ctx, layout, time);
    ctx.fillStyle = 'rgba(7, 10, 24, 0.55)';
    ctx.fillRect(0, 0, layout.width, layout.height);
    // Wisps drifting through the dark valley.
    const ghosts = [
      { type: 'gloom', fx: 0.12, fy: 0.22, sp: 0.5 },
      { type: 'mote', fx: 0.88, fy: 0.3, sp: 0.7 },
      { type: 'drift', fx: 0.2, fy: 0.78, sp: 0.45 },
    ];
    for (const gh of ghosts) {
      const gx = gh.fx * layout.width + Math.sin(time * gh.sp + gh.fx * 30) * 26;
      const gy = gh.fy * layout.height + Math.sin(time * gh.sp * 1.3) * 12;
      ctx.save();
      ctx.globalAlpha = 0.35;
      drawWispShape(ctx, gh.type, gx, gy, 22, time, gh.fx * 10);
      ctx.restore();
    }
  }

  const statsCount = state.nightStats.length;
  const panelH = endPanelH(won, statsCount);
  const px = (layout.width - 640) / 2;
  const py = (layout.height - panelH) / 2;
  panel(ctx, px, py, 640, panelH, 18, won ? 0.88 : 0.92);
  ctx.textAlign = 'center';

  if (won) {
    drawFlame(ctx, px + 52, py + 52, 16, time, 2);
    drawFlame(ctx, px + 588, py + 52, 16, time, 5);
    ctx.save();
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 26;
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText('DAWN KEEPER!', layout.width / 2, py + 64);
    ctx.restore();
    ctx.fillStyle = COLORS.text;
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('All five nights held — the lantern never went out.', layout.width / 2, py + 92);
    ctx.save();
    ctx.strokeStyle = COLORS.accent;
    ctx.lineWidth = 3;
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 24;
    ctx.beginPath();
    ctx.arc(layout.width / 2, py + 158, 56, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
    ctx.save();
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 30;
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 92px Georgia, serif';
    ctx.fillText(state.totalGrade, layout.width / 2, py + 188);
    ctx.restore();
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.fillText('RUN GRADE', layout.width / 2, py + 232);
    if (state.newBest) {
      ctx.fillStyle = COLORS.good;
      ctx.font = 'bold 16px system-ui, sans-serif';
      ctx.fillText('★ NEW BEST ★', layout.width / 2, py + 254);
    }
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText(`Score ${state.score}`, layout.width / 2, py + 290);
    const tableEnd = statsTable(ctx, state, layout, py + 322);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '13px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`Boons: ${state.boons.map((k) => BOONS[k].name).join('  •  ') || 'none'}`, layout.width / 2, tableEnd + 22);
  } else {
    const snuffed = (sx, sy) => {
      ctx.strokeStyle = '#6b5322';
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 18);
      ctx.lineTo(sx, sy - 6);
      ctx.stroke();
      ctx.fillStyle = '#3a3f5c';
      roundRect(ctx, sx - 11, sy - 6, 22, 26, 4);
      ctx.fill();
      ctx.fillStyle = '#232742';
      roundRect(ctx, sx - 7, sy - 2, 14, 18, 3);
      ctx.fill();
      drawSmoke(ctx, sx, sy - 6, time, sx, 0.5);
    };
    snuffed(px + 56, py + 150);
    snuffed(px + 584, py + 150);
    ctx.save();
    ctx.shadowColor = COLORS.danger;
    ctx.shadowBlur = 22;
    ctx.fillStyle = COLORS.danger;
    ctx.font = 'bold 44px Georgia, serif';
    ctx.fillText('THE NIGHT TAKES YOU', layout.width / 2, py + 64);
    ctx.restore();
    ctx.fillStyle = COLORS.text;
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(
      state.loseReason === 'flames'
        ? 'Wisps snuffed the last lantern flame. Darkness wins this run.'
        : 'Dawn arrived with braziers still cold.',
      layout.width / 2, py + 92,
    );
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 34px Georgia, serif';
    ctx.fillText(`Score ${state.score}`, layout.width / 2, py + 150);
    ctx.fillStyle = COLORS.textDim;
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText(`Nights cleared: ${state.night - 1}/5  •  Wisps burned: ${state.wispsBurned}  •  Best combo: x${state.bestCombo}`, layout.width / 2, py + 182);
    ctx.fillText(`Best score: ${state.best}`, layout.width / 2, py + 206);
    let y = py + 224;
    ctx.strokeStyle = 'rgba(255, 201, 77, 0.3)';
    ctx.beginPath();
    ctx.moveTo(px + 40, y);
    ctx.lineTo(px + 600, y);
    ctx.stroke();
    y += 26;
    ctx.textAlign = 'left';
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('WHAT HAPPENED', px + 40, y);
    y += 22;
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px system-ui, sans-serif';
    const cold = 3 - state.braziersLit;
    const happened = state.loseReason === 'flames'
      ? 'Wisps slipped past the beam and snuffed the last flame.'
      : `Dawn arrived with ${cold} brazier${cold === 1 ? '' : 's'} still cold.`;
    y = wrapText(ctx, happened, px + 40, y, 560, 19);
    y += 30;
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 13px system-ui, sans-serif';
    ctx.fillText('TIP', px + 40, y);
    y += 22;
    ctx.fillStyle = COLORS.text;
    ctx.font = '14px system-ui, sans-serif';
    const tip = state.loseReason === 'flames'
      ? 'Keep the beam across wisp rows — FLARE [F] burns all in the light.'
      : 'Rotate mirrors early — a lit brazier is +1000, and dawn will not wait.';
    y = wrapText(ctx, tip, px + 40, y, 560, 19);
    ctx.textAlign = 'center';
    if (state.nightStats.length > 0) statsTable(ctx, state, layout, y + 26);
  }

  const btns = endButtons(layout, won, statsCount);
  const drawBtn = (b, label, primary) => {
    if (primary) {
      ctx.save();
      ctx.shadowColor = COLORS.accent;
      ctx.shadowBlur = 16;
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, '#ffd76a');
      g.addColorStop(1, '#f0a832');
      ctx.fillStyle = g;
      roundRect(ctx, b.x, b.y, b.w, b.h, 12);
      ctx.fill();
      ctx.restore();
    } else {
      const g = ctx.createLinearGradient(b.x, b.y, b.x, b.y + b.h);
      g.addColorStop(0, 'rgba(255,255,255,0.10)');
      g.addColorStop(1, 'rgba(255,255,255,0.04)');
      ctx.fillStyle = g;
      roundRect(ctx, b.x, b.y, b.w, b.h, 12);
      ctx.fill();
      ctx.strokeStyle = COLORS.panelEdge;
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
    ctx.fillStyle = primary ? '#241a05' : COLORS.text;
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(label, b.x + b.w / 2, b.y + 36);
  };
  if (won) {
    drawBtn(btns.again, '↻  RUN AGAIN', true);
    drawBtn(btns.seed, 'SAME SEED', false);
    drawBtn(btns.menu, 'MENU', false);
  } else {
    drawBtn(btns.retry, '↻  RETRY', true);
    drawBtn(btns.menu, 'MENU', false);
  }
}

function drawPause(ctx, layout) {
  ctx.fillStyle = 'rgba(11, 16, 38, 0.66)';
  ctx.fillRect(0, 0, layout.width, layout.height);
  ctx.textAlign = 'center';
  ctx.fillStyle = COLORS.text;
  ctx.font = 'bold 44px Georgia, serif';
  ctx.fillText('PAUSED', layout.width / 2, layout.height / 2 - 8);
  ctx.fillStyle = COLORS.textDim;
  ctx.font = '15px system-ui, sans-serif';
  ctx.fillText('Press P or click PAUSE to resume', layout.width / 2, layout.height / 2 + 26);
}

// ---------- gambar utama ----------
export function draw(ctx, world, layout, ui) {
  const state = world.state;
  const time = state.time;
  // Play screen: the moon lives in the right margin below the top bar,
  // clear of the score text and the right panel.
  const playMoon = state.screen === SCREEN_PLAY
    ? { x: layout.width - 56, y: 215, r: 34 } : undefined;
  drawSky(ctx, layout, time, playMoon);

  if (state.screen === SCREEN_TITLE) {
    drawTitle(ctx, state, layout, ui, time);
    return;
  }
  if (state.screen === SCREEN_BOON) {
    drawBoon(ctx, state, layout, time);
    return;
  }
  if (state.screen === SCREEN_WIN) {
    drawEnd(ctx, state, layout, true, time);
    return;
  }
  if (state.screen === SCREEN_LOSE) {
    drawEnd(ctx, state, layout, false, time);
    return;
  }

  // Play screen: terrace, beam, pieces, wisps, HUD.
  drawBoard(ctx, layout, time);
  for (let r = 0; r < GRID_ROWS; r += 1) {
    for (let c = 0; c < GRID_COLS; c += 1) {
      const cell = state.grid[r][c];
      if (cell.type === 'empty') {
        drawTileDecor(ctx, r, c, layout.boardX + c * layout.tile, layout.boardY + r * layout.tile, layout.tile);
      }
    }
  }
  drawLitWash(ctx, state, layout);
  drawBeam(ctx, state, layout, time);
  for (let r = 0; r < GRID_ROWS; r += 1) {
    for (let c = 0; c < GRID_COLS; c += 1) {
      const cell = state.grid[r][c];
      if (cell.type === 'empty') continue;
      const p = cellCenter(layout, r, c);
      const inBeam = state.beamCells.has(`${r},${c}`);
      if (cell.type === 'mirror') drawMirror(ctx, cell, p.x, p.y, layout.tile, time, `${r},${c}`, inBeam);
      else if (cell.type === 'brazier') drawBrazier(ctx, cell, p.x, p.y, layout.tile, time, r * 7 + c);
      else if (cell.type === 'wall') drawWall(ctx, p.x, p.y, layout.tile, time);
    }
  }
  for (const w of state.wisps) drawWisp(ctx, w, layout, time);
  drawParticles(ctx, state, layout);
  drawFog(ctx, layout, time);
  drawEmberMotes(ctx, layout, time);
  drawFloaters(ctx, state, layout);
  drawLantern(ctx, state, layout, time);

  drawTopBar(ctx, state, layout, world);
  drawRightPanel(ctx, state, layout, time);
  drawToolbar(ctx, state, layout, ui, world, time);
  drawVignette(ctx, layout);

  if (state.paused) drawPause(ctx, layout);
  else if (state.screen === SCREEN_PLAY && state.elapsed < 2) {
    // Spanduk pembuka malam.
    ctx.save();
    ctx.globalAlpha = Math.max(0, 1 - state.elapsed / 2);
    ctx.textAlign = 'center';
    ctx.fillStyle = COLORS.accent;
    ctx.font = 'bold 44px Georgia, serif';
    ctx.shadowColor = COLORS.accent;
    ctx.shadowBlur = 24;
    ctx.fillText(`NIGHT ${state.night}`, layout.boardX + layout.boardW / 2, layout.boardY + layout.boardH / 2);
    ctx.restore();
  }
}
