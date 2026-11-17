// BEAMKEEPER, entri best-game-01 (Node 22, hanya stdlib): game-nya adalah
// folder game/ di sebelah file ini — file statis yang dimuat browser desktop
// tanpa jaringan (game/index.html dan modul ES-nya, tanpa pustaka luar) —
// dan program ini menyerahkannya. Ia menyalin game/ dan screenshots/ ke
// /output (atau ke MAKEFUN_OUTPUT_DIR di luar container grader) lalu menulis
// /output/dossier.json, ringkasan yang dibaca juri, lewat pustaka make.fun
// yang di-vendor.
//
// Mainkan lokal dengan `node serve.ts`, lalu buka http://localhost:8080.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'game'), join(out, 'game'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });

// Batas dari reference/gate.json si penilai: hanya text_max_bytes yang
// membentuk byte dossier; sisanya menolak entri yang memang akan ditolak
// penilai (lebih dari 4 screenshot atau satu di atas 256 KiB; game/ lebih
// dari 993 file atau 48 MiB, atau ada path di bawah game/ lebih dari 1000
// byte: game/ dihitung berdampingan dengan cap 1000 entri /output sendiri,
// screenshots/-nya, dan dossier.json).
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    game_max_files: 993,
    game_max_bytes: 50331648,
    game_path_max_bytes: 1000,
  }),
);
