#!/usr/bin/env node
// Records the loops the roadmap cards play (img/stage-*.mp4 and their posters img/stage-*.webp) from the simulation model:
// the story page runs in headless Chrome on a virtual clock, so every frame advances exactly 1/30 s however slowly it renders,
// the lab (window.__lab in story.js) holds one stage, and each frame is read straight off the canvas.
//
//   npm run stages                    record all three (a few minutes: the model renders in software)
//   npm run stages -- --preview       one still per stage in the system temp folder, to check the framing
//
// Needs Chrome (CHROME=... to point at it) and ffmpeg with libx264 and libwebp.

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import http from 'node:http';
import { spawn, execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PREVIEW = process.argv.includes('--preview');
const FPS = 30, WARM = +(process.env.WARM || 75), FRAMES = 180;         // 2.5 s to settle into the stage, then a 6 s loop
const W = 1024, H = 448, OUT_W = 512;               // the cards are about 2.3 : 1
// camera per stage, in the machine's frame (x along its travel, y up, z across the alley, metres); the camera sways
// sideways by `sway` radians and back over the loop, so the loop has no jump in the view
const STAGES = {
  thin:    { shot: { p: [5.0, 3.0, .3], t: [0, 1.75, 0] }, sway: .2 },
  harvest: { shot: { p: [-5.2, 3.2, .3], t: [0, 1.65, 0] }, sway: .2 },
  fleet:   { shot: { p: [-11, 10, -11], t: [5, 0, 7] }, sway: .12 },
};

const CHROMES = [process.env.CHROME, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium',
  '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'].filter(Boolean);
const chromeBin = CHROMES.find((p) => fs.existsSync(p));
if (!chromeBin) { console.error('Chrome not found. Set CHROME=/path/to/chrome and run again.'); process.exit(1); }

// the page's clock: performance.now and requestAnimationFrame only move when __vtick(ms) is called
const SHIM = `(()=>{ let vt=0; const q=[]; performance.now=()=>vt;
  window.requestAnimationFrame=cb=>{ q.push(cb); return q.length; }; window.cancelAnimationFrame=()=>{};
  window.__vtick=ms=>{ vt+=ms; for(const cb of q.splice(0)) cb(vt); }; })();`;

// ---------------- a plain static server for the site (no login gate)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.woff2': 'font/woff2', '.webp': 'image/webp', '.png': 'image/png', '.mp4': 'video/mp4', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  const p = path.normalize(decodeURIComponent(new URL(req.url, 'http://x').pathname)).replace(/^([/\\])+/, '');
  const f = path.join(ROOT, p || 'index.html');
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const site = `http://127.0.0.1:${server.address().port}/index.html`;

// the GPU where headless Chrome can reach it (Metal on macOS); software WebGL elsewhere, many times slower
const GL = process.platform === 'darwin' ? ['--use-angle=metal'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'tully-stages-'));
const port = 9500 + Math.floor(Math.random() * 400);
const chrome = spawn(chromeBin, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${path.join(tmp, 'profile')}`,
  '--window-size=1280,900', '--hide-scrollbars', ...GL, 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

let ws, id = 0; const pending = new Map();
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, { res, rej }); ws.send(JSON.stringify({ id: i, method, params })); });
async function run(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true });
  if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description || r.exceptionDetails.text);
  return r.result.value;
}

try {
  let target;
  for (let k = 0; k < 80 && !target; k++) { await sleep(150); try { target = (await (await fetch(`http://127.0.0.1:${port}/json/list`)).json()).find((t) => t.type === 'page'); } catch {} }
  if (!target) throw new Error('Chrome did not start');
  ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => (ws.onopen = r));
  ws.onmessage = (m) => { const d = JSON.parse(m.data); const p = d.id && pending.get(d.id); if (p) { pending.delete(d.id); d.error ? p.rej(new Error(d.error.message)) : p.res(d.result); } };
  await send('Page.enable'); await send('Runtime.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.addScriptToEvaluateOnNewDocument', { source: SHIM });
  await send('Page.navigate', { url: site });

  // let the page load and the model warm up: frames on the virtual clock, real time for the network
  process.stdout.write('loading the model');
  for (let k = 0; ; k++) {
    if (k > 1500) throw new Error('the model did not come up (WebGL?)');
    const ok = await run(`typeof __vtick==='function'&&(__vtick(33.334), !!(window.__lab&&__lab.ready()))`).catch(() => false);
    if (ok) break; if (k % 20 === 0) process.stdout.write('.'); await sleep(30);
  }
  console.log(' ready');
  await run(`(()=>{ const h=document.createElement('div'); h.id='rec'; h.style.cssText='position:fixed;left:0;top:0;width:${W}px;height:${H}px;z-index:99';
    const st=document.createElement('style'); st.textContent='#rec canvas{display:block;width:100%!important;height:100%!important}';
    document.head.append(st); document.body.append(h); __E.renderer.setPixelRatio(1); return __lab.open(h,'thin'); })()`);

  for (const [stage, cfg] of Object.entries(STAGES)) {
    await run(`(()=>{ __lab.stage(${JSON.stringify(stage)},${JSON.stringify(cfg.shot)}); __lab.speed(1.5); __lab.night(false); })()`);
    const t0 = Date.now(); for (let k = 0; k < WARM; k++) await run('__vtick(1000/30)');
    if (PREVIEW) console.log(`${stage}: ${Math.round((Date.now() - t0) / WARM)} ms a frame`);
    // the sway: the camera's offset from its target, turned about the vertical
    await run(`(()=>{ const C=__E.controls, c=__E.camera; window.__off=c.position.clone().sub(C.target); })()`);
    const dir = path.join(tmp, stage); fs.mkdirSync(dir, { recursive: true });
    const n = PREVIEW ? 1 : FRAMES;
    for (let i = 0; i < n; i++) {
      const a = cfg.sway * Math.sin(2 * Math.PI * i / FRAMES);
      const url = await run(`(()=>{ const C=__E.controls, o=__off.clone().applyAxisAngle(new THREE.Vector3(0,1,0),${a});
        __E.camera.position.copy(C.target).add(o); __vtick(1000/30); return document.querySelector('#rec canvas').toDataURL('image/jpeg',.92); })()`);
      fs.writeFileSync(path.join(dir, String(i).padStart(4, '0') + '.jpg'), Buffer.from(url.split(',')[1], 'base64'));
      if (i % 30 === 29) process.stdout.write(`\r${stage}: ${i + 1}/${n} frames`);
    }
    if (PREVIEW) { const f = path.join(tmp, `${stage}.jpg`); fs.renameSync(path.join(dir, '0000.jpg'), f); console.log(`${stage}: ${f}`); continue; }
    const mp4 = path.join(ROOT, 'img', `stage-${stage}.mp4`), webp = path.join(ROOT, 'img', `stage-${stage}.webp`);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(FPS), '-i', path.join(dir, '%04d.jpg'), '-vf', `scale=${OUT_W}:-2`,
      '-c:v', 'libx264', '-preset', 'slow', '-crf', '30', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', mp4]);
    execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', path.join(dir, '0000.jpg'), '-vf', `scale=${OUT_W}:-2`, '-quality', '80', webp]);
    console.log(`\r${stage}: ${path.relative(ROOT, mp4)} ${Math.round(fs.statSync(mp4).size / 1024)} KB, ${path.relative(ROOT, webp)}`);
  }
} finally {
  chrome.kill(); server.close();
  if (!PREVIEW) fs.rmSync(tmp, { recursive: true, force: true });
}
