#!/usr/bin/env node
// Prints deck/index.html to tully-pitch-deck.pdf with headless Chrome, one 16:9 page per slide.
// The PDF is committed and served as a static file; the last chapter of index.html links to it.
// deck/ itself is not deployed (.vercelignore).
//
//   npm run deck                      rebuild the PDF after changing deck/index.html or the images it uses
//
// Chrome: set CHROME to its binary, otherwise the usual install paths on macOS and Linux are tried.

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'deck', 'index.html');
const OUT = path.join(ROOT, 'tully-pitch-deck.pdf');

const CANDIDATES = [
  process.env.CHROME,
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome',
  '/usr/bin/google-chrome-stable',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const chrome = CANDIDATES.find((p) => fs.existsSync(p));
if (!chrome) {
  console.error('Chrome not found. Set CHROME=/path/to/chrome and run again.');
  process.exit(1);
}

try {
  execFileSync(chrome, [
    '--headless=new',
    '--disable-gpu',
    '--no-pdf-header-footer',
    '--allow-file-access-from-files', // the fonts and images are loaded from file:// around deck/
    '--virtual-time-budget=15000',    // let the web fonts and images finish loading before printing
    `--print-to-pdf=${OUT}`,
    pathToFileURL(SRC).href,
  ], { stdio: ['ignore', 'ignore', 'pipe'] });
} catch (e) {
  console.error(`Chrome failed:\n${e.stderr || e.message}`);
  process.exit(1);
}

const kb = Math.round(fs.statSync(OUT).size / 1024);
console.log(`${path.relative(ROOT, OUT)}  ${kb} KB`);
