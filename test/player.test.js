// Stage 4 flow in a real browser (Edge: needs H.264) using ?preview= sample state (no network, nothing saved).
// Run: PLAYWRIGHT_PATH=<playwright> node test/player.test.js
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');
const root = path.join(__dirname, '..');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mp4': 'video/mp4', '.vtt': 'text/vtt', '.json': 'application/json', '.jpg': 'image/jpeg' };

const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  const size = fs.statSync(f).size, type = TYPES[path.extname(f)] || 'application/octet-stream', m = /bytes=(\d*)-(\d*)/.exec(req.headers.range || '');
  if (m) { const s = m[1] ? +m[1] : 0, e = m[2] ? +m[2] : size - 1;
    res.writeHead(206, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Range': `bytes ${s}-${e}/${size}`, 'Content-Length': e - s + 1 });
    return fs.createReadStream(f, { start: s, end: e }).pipe(res); }
  res.writeHead(200, { 'Content-Type': type, 'Accept-Ranges': 'bytes', 'Content-Length': size }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch({ channel: 'msedge' });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const external = []; ctx.on('request', rq => { if (!rq.url().startsWith(base) && !rq.url().startsWith('data:') && !rq.url().startsWith('blob:')) external.push(rq.url()); });
  const errors = [];
  const open = async (url) => { const p = await ctx.newPage(); p.on('pageerror', e => errors.push(e.message)); await p.goto(url); await p.waitForSelector('#detail:not([hidden]) .card'); return p; };
  const vid = p => p.locator('video');
  const playFast = async (p, rate = 4) => { await vid(p).evaluate((v, r) => { v.playbackRate = r; }, rate); await p.locator('button', { hasText: /^▶ Play$/ }).click(); };
  const answer = async (p, letter) => p.locator('.opt', { hasText: new RegExp('^' + letter + '\\s') }).click();

  // ── 1. New counselor: watch (no skipping) → check (retry) → rating ──
  let p = await open(`${base}?preview=0&path=new#/m/p2-texting`);
  assert(await p.locator('video').count() === 1, 'video shown');
  assert(await p.locator('.opt').count() === 0, 'check is locked until the video is watched');
  assert(await p.locator('track[kind=captions]').count() === 1, 'captions track present');
  assert(await p.locator('video[controls]').count() === 0, 'no native controls');
  assert(await p.locator('video[playsinline]').count() === 1, 'playsinline');
  await vid(p).evaluate(v => new Promise(r => v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true })));
  await vid(p).evaluate(v => { v.currentTime = 60; });
  await p.waitForTimeout(500);
  assert((await vid(p).evaluate(v => v.currentTime)) < 2, 'first viewing: cannot seek ahead');
  await playFast(p);
  await p.waitForSelector('.opt', { timeout: 40000 });
  console.log('new: video completed from real playback, check unlocked');
  await answer(p, 'A');                                           // wrong
  assert(await p.locator('.bad').count() === 1, 'wrong answer gets feedback');
  await answer(p, 'B');                                           // retry → right
  assert(await p.locator('.good').count() === 1);
  await p.locator('button', { hasText: 'Next question' }).click();
  await answer(p, 'B'); await p.locator('button', { hasText: 'Next question' }).click();
  await answer(p, 'B'); await p.locator('button', { hasText: 'Finish' }).click();
  await p.waitForSelector('text=Module complete');
  const st1 = await p.evaluate(() => 1);
  await p.locator('button', { hasText: 'Not really' }).click();
  await p.locator('textarea').fill('x'.repeat(600));
  assert((await p.locator('textarea').evaluate(t => t.value.length)) <= 500, 'comment capped at 500');
  await p.locator('button', { hasText: 'Send' }).click();
  await p.waitForSelector('text=Thanks for the feedback');
  await p.locator('button', { hasText: 'Watch the video again' }).click();
  await vid(p).first().evaluate(v => new Promise(r => v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true })));
  await vid(p).first().evaluate(v => { v.currentTime = 80; });
  await p.waitForTimeout(400);
  assert((await vid(p).first().evaluate(v => v.currentTime)) > 70, 'rewatch allows free seeking');
  await p.close();
  console.log('new path flow ok');

  // ── 2. Returning, perfect first try → only the NEW chapter is required ──
  p = await open(`${base}?preview=0&path=returning#/m/p2-texting`);
  assert(await p.locator('video').count() === 0, 'opens on the check, not the video');
  assert(/Show what you know/.test(await p.locator('.steps').innerText()));
  assert(await p.locator('.newbox').count() === 1, 'New for 2027 callout');
  assert(await p.locator('.tag', { hasText: 'New for 2027' }).count() >= 2, 'new question tagged');
  for (const [i, l] of ['B', 'B', 'B'].entries()) { await answer(p, l); await p.locator('button', { hasText: i < 2 ? 'Next question' : 'Finish' }).click(); }
  await p.waitForSelector('video');
  assert(/just the new part/.test(await p.locator('.panel').innerText()), 'chapter-only watch');
  await vid(p).evaluate(v => new Promise(r => v.readyState >= 1 ? r() : v.addEventListener('loadedmetadata', r, { once: true })));
  const t0 = await vid(p).evaluate(v => v.currentTime);
  assert(t0 > 40, 'starts at the new chapter, not 0:00 (' + t0 + ')');
  await playFast(p);
  await p.waitForSelector('text=Module complete', { timeout: 30000 });
  assert(/tested out/.test(await p.locator('.steps').innerText()), 'marked tested out');
  await p.close();
  console.log('returning test-out pass ok');

  // ── 3. Returning, one miss → full watch required, then retake ──
  p = await open(`${base}?preview=0&path=returning#/m/p2-texting`);
  await answer(p, 'A'); await p.locator('button', { hasText: 'Next question' }).click();
  await answer(p, 'B'); await p.locator('button', { hasText: 'Next question' }).click();
  await answer(p, 'B'); await p.locator('button', { hasText: 'Finish' }).click();
  await p.waitForSelector('text=Let’s watch the video first');
  await p.locator('button', { hasText: 'Watch the video' }).click();
  await p.waitForSelector('video');
  assert(!/just the new part/.test(await p.locator('.panel').innerText()), 'full video after a miss');
  await playFast(p);
  await p.waitForSelector('.opt', { timeout: 40000 });
  console.log('returning test-out miss ok');
  await p.close();

  assert.deepStrictEqual(external, [], 'external requests: ' + external);
  assert.deepStrictEqual(errors, [], 'page errors: ' + errors);
  await browser.close(); server.close();
  console.log('player tests passed');
})().catch(e => { console.error(e); process.exit(1); });
