// BEAMKEEPER — bip WebAudio sederhana, tanpa aset luar.
// Semua suara disintesis dari osilator; aman dipanggil sebelum interaksi
// pengguna (AudioContext dibuat malas dan dibungkus try/catch).

let ctx = null;
let muted = false;

export function isMuted() {
  return muted;
}

export function toggleMute() {
  muted = !muted;
  return muted;
}

function ensureCtx() {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    } catch {
      return null;
    }
  }
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => {});
  }
  return ctx;
}

function beep(freq, seconds, type, volume, when = 0) {
  if (muted) return;
  const audio = ensureCtx();
  if (!audio) return;
  try {
    const t0 = audio.currentTime + when;
    const osc = audio.createOscillator();
    const gain = audio.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(volume, t0 + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + seconds);
    osc.connect(gain).connect(audio.destination);
    osc.start(t0);
    osc.stop(t0 + seconds + 0.05);
  } catch {
    // Suara tidak pernah boleh mematikan permainan.
  }
}

export const sfx = {
  rotate() { beep(520, 0.07, 'triangle', 0.12); },
  lit() { beep(660, 0.12, 'sine', 0.16); beep(990, 0.18, 'sine', 0.14, 0.08); },
  burn() { beep(300, 0.1, 'sawtooth', 0.08); beep(180, 0.14, 'sawtooth', 0.07, 0.05); },
  flameLost() { beep(220, 0.25, 'square', 0.1); beep(147, 0.3, 'square', 0.09, 0.12); },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => beep(f, 0.22, 'sine', 0.16, i * 0.11));
  },
  lose() {
    [392, 330, 262, 196].forEach((f, i) => beep(f, 0.28, 'triangle', 0.12, i * 0.14));
  },
  click() { beep(700, 0.05, 'sine', 0.1); },
};
