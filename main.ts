// Palm Sunset Cover Studio — hand-in program for gta6-cover-art-01.
// Node 22, standard library only. It copies the app (app/) and its screenshots
// (screenshots/) from beside this file into /output — or into the directory
// MAKEFUN_OUTPUT_DIR names when run outside the grader — and writes
// /output/dossier.json with buildDossier from the vendored make.fun library.
// The app itself is plain static files: index.html plus its scripts, styles,
// bundled OFL fonts and sample photos, nothing fetched over the network.
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-app.ts';

const here = fileURLToPath(new URL('.', import.meta.url));
const out = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(out, { recursive: true });
cpSync(join(here, 'app'), join(out, 'app'), { recursive: true });
mkdirSync(join(out, 'screenshots'), { recursive: true });
if (existsSync(join(here, 'screenshots'))) {
  cpSync(join(here, 'screenshots'), join(out, 'screenshots'), { recursive: true });
}

// Caps from the scorer's gate: the text budget shapes the dossier bytes, and
// the rest refuse an entry the scorer would refuse — at most 4 screenshots,
// each at most 256 KiB; at most 993 files and 48 MiB under app/; no app path
// longer than 1000 bytes. The whole of /output shares the platform's own
// 1000-entry, 64 MiB cap, so app/ plus screenshots/ plus dossier.json must
// leave room under it.
writeFileSync(
  join(out, 'dossier.json'),
  buildDossier(out, {
    text_max_bytes: 163840,
    screenshots: { max: 4, max_bytes: 262144 },
    app_max_files: 993,
    app_max_bytes: 50331648,
    app_path_max_bytes: 1000,
  }),
);
