#!/usr/bin/env node
// Renders the "Texting one family" explainer from the REAL bus app (read-only) against a fake server.
//   node video/render.js [--audio-dir <dir with scene1.m4a ... scene8.m4a>] [--out videos]
// Scenes with a recording in --audio-dir use it; the rest get a robotic scratch voice so pacing can be judged.
// Scene length follows the audio length, so re-run after re-recording any line.
const fs = require('fs'), path = require('path'), os = require('os');
const { execFileSync } = require('child_process');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const { createFakeServer } = require('./fakeserver');
const FX = require('./fx');
const script = require('./script.json');

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const PWA_DIR = path.resolve(process.env.PWA_DIR || 'C:/Users/Owner/bus-comms-test/bus-pwa');
const AUDIO_DIR = arg('audio-dir', null);
const OUT = path.resolve(arg('out', path.join(__dirname, '..', 'videos')));
const WORK = path.join(__dirname, 'work');
const LEAD = 0.6, TAIL = 0.9, MIN_SCENE = 3.0;

const findFfmpeg = (name) => {
  try { execFileSync(name, ['-version'], { stdio: 'ignore' }); return name; } catch (e) {}
  const base = path.join(process.env.LOCALAPPDATA || '', 'Microsoft/WinGet/Packages');
  for (const d of fs.existsSync(base) ? fs.readdirSync(base) : []) {
    if (!/ffmpeg/i.test(d)) continue;
    const walk = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(dir, e.name)) : [path.join(dir, e.name)]);
    const hit = walk(path.join(base, d)).find(f => path.basename(f).toLowerCase() === name + '.exe');
    if (hit) return hit;
  }
  throw new Error(name + ' not found');
};
const FFMPEG = findFfmpeg('ffmpeg'), FFPROBE = findFfmpeg('ffprobe');
const duration = f => parseFloat(execFileSync(FFPROBE, ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', f]).toString());
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ── narration audio: your recording if present, else scratch TTS ──
function audioFor(scene) {
  if (AUDIO_DIR) for (const ext of ['m4a', 'mp3', 'wav', 'aac', 'caf']) {
    const f = path.join(AUDIO_DIR, `scene${scene.n}.${ext}`);
    if (fs.existsSync(f)) return { file: f, real: true };
  }
  const wav = path.join(WORK, `scratch${scene.n}.wav`), txt = path.join(WORK, `scratch${scene.n}.txt`);
  fs.writeFileSync(txt, scene.text, 'utf8');
  execFileSync('powershell', ['-NoProfile', '-Command',
    `Add-Type -AssemblyName System.Speech; $s=New-Object System.Speech.Synthesis.SpeechSynthesizer; $s.SelectVoice('Microsoft Zira Desktop'); $s.Rate=-1; ` +
    `$s.SetOutputToWaveFile('${wav}'); $s.Speak([IO.File]::ReadAllText('${txt}')); $s.Dispose()`]);
  return { file: wav, real: false };
}

(async () => {
  fs.rmSync(WORK, { recursive: true, force: true }); fs.mkdirSync(WORK, { recursive: true }); fs.mkdirSync(OUT, { recursive: true });

  const scenes = script.scenes.map(s => {
    const a = audioFor(s), d = duration(a.file);
    return { ...s, audio: a.file, real: a.real, audioDur: d, dur: Math.max(MIN_SCENE, d + LEAD + TAIL) };
  });
  console.log(scenes.map(s => `scene ${s.n}: ${s.dur.toFixed(1)}s (${s.real ? 'your voice' : 'scratch voice'})`).join('\n'));

  const { server, state } = createFakeServer(PWA_DIR);
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}`;

  const browser = await chromium.launch();
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true,
    timezoneId: 'America/New_York', locale: 'en-US', serviceWorkers: 'block',
  });
  const external = [];
  const LOGO = '<svg xmlns="http://www.w3.org/2000/svg" width="240" height="80"><text x="120" y="52" font-family="Georgia,serif" font-size="38" font-weight="700" fill="#F5A623" text-anchor="middle">Deerkill</text></svg>';
  await ctx.route(u => !u.href.startsWith(base), r => {
    if (/typewriter\.imgix\.net/.test(r.request().url())) return r.fulfill({ contentType: 'image/svg+xml', body: LOGO }); // local stand-in for the header logo
    external.push(r.request().url()); r.abort();
  });
  await ctx.addInitScript(FX);
  await ctx.addInitScript(() => localStorage.setItem('dkSession', JSON.stringify({
    busNumber: '5', token: 'practice-token', staffName: 'Sam', role: 'Counselor', loginExpiry: Date.now() + 9e10 })));
  const page = await ctx.newPage();
  await page.clock.setFixedTime(new Date('2027-07-14T08:05:00-04:00'));
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base + '/');
  await page.waitForSelector('.contact-item');

  // ── helpers ──
  const center = async sel => { const b = await page.locator(sel).first().boundingBox(); return { x: b.x + b.width / 2, y: b.y + b.height / 2 }; };
  const tap = async sel => { const c = await center(sel); await page.evaluate(([x, y]) => window.__fx.tap(x, y), [c.x, c.y]); await sleep(260); await page.locator(sel).first().click(); };
  const ring = sel => page.evaluate(s => window.__fx.ring(s), sel);
  const pill = (html, top) => page.evaluate(([h, t]) => window.__fx.pill(h, t), [html, top]);
  const clear = () => page.evaluate(() => window.__fx.clear());
  const card = html => page.evaluate(h => window.__fx.card(h), html);
  const hideCard = () => page.evaluate(() => window.__fx.hideCard());
  const typeInto = async (sel, text, untilMs) => {
    await page.locator(sel).first().focus();
    const per = Math.min(95, Math.max(22, (untilMs - Date.now()) / text.length));
    await page.keyboard.type(text, { delay: per });
  };

  // ── screencast ──
  const cdp = await ctx.newCDPSession(page);
  const frames = []; let wall0 = null;
  cdp.on('Page.screencastFrame', ev => {
    if (wall0 === null) wall0 = Date.now();
    frames.push({ t: Date.now(), data: Buffer.from(ev.data, 'base64') });
    cdp.send('Page.screencastFrameAck', { sessionId: ev.sessionId }).catch(() => {});
  });
  await card(`<div class="big">🚌</div><h1>Texting one family</h1><p>Bus Counselor Training</p><p>Part 2 · Using Bus Comms</p><div class="row">☀️ 🌲 ⛺</div>`);
  await sleep(900);
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 92, everyNthFrame: 1 });
  while (wall0 === null) await sleep(20);

  // ── scenes ──
  const SCENES = {
    1: async (at) => { await at(0.88); await hideCard(); },
    2: async (at) => {
      await at(0.14); await ring('#searchInput'); await at(0.2); await tap('#searchInput');
      await typeInto('#searchInput', 'riv', Date.now() + 0.4 * 1000);
      await at(0.7); await clear(); await ring('.contact-item');
    },
    3: async (at) => {
      await at(0.1); await clear(); await tap('.contact-item');
      await at(0.45); await ring('#chatMessages', 0);
      await at(0.9); await clear();
    },
    4: async (at, dur) => {
      await at(0.08); await ring('.compose-bar');
      await at(0.14); await typeInto('#composeInput', "Hi! Maya's bus is running about ten minutes late. Everyone's okay!", wall + dur * 1000 * 0.82);
    },
    5: async (at) => {
      await at(0.2); await clear(); await ring('#sendBtn');
      await at(0.4); await tap('#sendBtn');
      await at(0.55); await clear(); await pill('<b>✓</b>Sent — it\'s on its way!', 54);
      await at(0.95); await clear();
    },
    6: async (at, dur) => {
      state.failReply = true;
      await at(0.06); await typeInto('#composeInput', "We're back in range! Arriving in about 5 minutes.", wall + dur * 1000 * 0.3);
      await at(0.36); await ring('#sendBtn'); await tap('#sendBtn');
      await at(0.5); await clear(); await ring('#composeInput'); await pill('<b>NEW</b>The text stays in the box', 54);
      await at(0.72); state.failReply = false; await clear(); await ring('#sendBtn'); await tap('#sendBtn');
      await at(0.9); await clear();
    },
    7: async (at) => {
      await at(0.12); await ring('#quickMsgBar');
      await at(0.45); await tap('.quick-msg-btn');
      await at(0.92); await clear();
    },
    8: async (at) => {
      await card(`<div class="big">⭐</div><h1>Thanks, counselor!</h1><p>Text families only through <b>Bus Comms</b>.</p><p>Never tap a phone number in CampInTouch — it calls from your own phone.</p><div class="row">🚌 💜 🏕️</div>`);
    },
  };

  let wall = 0;
  const starts = [];
  for (const sc of scenes) {
    wall = Date.now();
    starts.push((wall - wall0) / 1000);
    const at = async frac => { const t = wall + frac * sc.dur * 1000 - Date.now(); if (t > 0) await sleep(t); };
    await SCENES[sc.n](at, sc.dur);
    await at(1);
  }
  await sleep(400);
  const endWall = Date.now();
  await cdp.send('Page.stopScreencast');
  await browser.close(); server.close();
  if (external.length) console.warn('blocked external requests:', external);
  if (state.unknown.length) console.warn('unknown API calls:', [...new Set(state.unknown)]);
  if (errors.length) console.warn('page errors:', errors);

  // ── encode silent video from timed frames ──
  const fdir = path.join(WORK, 'frames'); fs.mkdirSync(fdir);
  let list = '';
  frames.forEach((f, i) => {
    fs.writeFileSync(path.join(fdir, `f${String(i).padStart(5, '0')}.jpg`), f.data);
    const next = i + 1 < frames.length ? frames[i + 1].t : endWall;
    list += `file 'frames/f${String(i).padStart(5, '0')}.jpg'\nduration ${Math.max(0.005, (next - f.t) / 1000).toFixed(4)}\n`;
  });
  list += `file 'frames/f${String(frames.length - 1).padStart(5, '0')}.jpg'\n`;
  fs.writeFileSync(path.join(WORK, 'frames.txt'), list);
  const total = (endWall - wall0) / 1000;
  const silent = path.join(WORK, 'silent.mp4');
  execFileSync(FFMPEG, ['-y', '-f', 'concat', '-safe', '0', '-i', path.join(WORK, 'frames.txt'),
    '-vf', 'fps=30,scale=trunc(iw/2)*2:trunc(ih/2)*2,format=yuv420p', '-t', total.toFixed(3),
    '-c:v', 'libx264', '-crf', '20', '-preset', 'medium', '-movflags', '+faststart', silent], { stdio: 'ignore' });

  // ── mix narration at each scene's start (+ lead-in) ──
  const inputs = ['-i', silent]; const filt = []; const labels = [];
  scenes.forEach((s, i) => {
    inputs.push('-i', s.audio);
    const ms = Math.round((starts[i] + LEAD) * 1000);
    filt.push(`[${i + 1}:a]aformat=sample_rates=44100:channel_layouts=mono,adelay=${ms}|${ms}[a${i}]`);
    labels.push(`[a${i}]`);
  });
  filt.push(`${labels.join('')}amix=inputs=${scenes.length}:normalize=0[aout]`);
  const mp4 = path.join(OUT, `${script.id}.mp4`);
  execFileSync(FFMPEG, ['-y', ...inputs, '-filter_complex', filt.join(';'), '-map', '0:v', '-map', '[aout]',
    '-c:v', 'copy', '-c:a', 'aac', '-b:a', '128k', '-t', total.toFixed(3), '-movflags', '+faststart', mp4], { stdio: 'ignore' });

  // ── captions ──
  const ts = s => { const h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = (s % 60).toFixed(3).padStart(6, '0'); return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${x}`; };
  let vtt = 'WEBVTT\n\n';
  scenes.forEach((s, i) => {
    const parts = s.text.match(/[^.!?]+[.!?]+['"]?\s*/g) || [s.text];
    const chars = parts.reduce((a, p) => a + p.length, 0);
    let t = starts[i] + LEAD;
    parts.forEach(p => { const d = s.audioDur * p.length / chars; vtt += `${ts(t)} --> ${ts(t + d)}\n${p.trim()}\n\n`; t += d; });
  });
  fs.writeFileSync(path.join(OUT, `${script.id}.vtt`), vtt);
  fs.writeFileSync(path.join(OUT, `${script.id}.poster.jpg`), frames[Math.min(frames.length - 1, 2)].data);
  console.log(`done: ${mp4}  (${total.toFixed(1)}s, ${scenes.every(s => s.real) ? 'your narration' : 'scratch narration'})`);
})().catch(e => { console.error(e); process.exit(1); });
