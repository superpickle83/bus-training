// Stage 3 gate, in a real browser at 390x844 using ?preview= sample data (no network, no sign-in).
// Run: PLAYWRIGHT_PATH=<path to playwright-core> node test/home.layout.test.js
const http = require('http'), fs = require('fs'), path = require('path'), assert = require('assert');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || 'playwright');

const root = path.join(__dirname, '..');
const server = http.createServer((req, res) => {
  const f = path.join(root, decodeURIComponent(req.url.split('?')[0]).replace(/^\/$/, '/index.html'));
  if (!f.startsWith(root) || !fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'Content-Type': f.endsWith('.js') ? 'text/javascript' : 'text/html' }); res.end(fs.readFileSync(f));
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const base = `http://localhost:${server.address().port}/`;
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const external = [];
  ctx.on('request', rq => { if (!rq.url().startsWith(base) && !rq.url().startsWith('data:')) external.push(rq.url()); });
  const page = await ctx.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  const shots = path.join(__dirname, '..', '_private'); fs.mkdirSync(shots, { recursive: true });

  for (const p of ['new', 'returning']) for (const s of ['0', 'mid', 'full']) {
    await page.goto(`${base}?preview=${s}&path=${p}`); await page.waitForSelector('#home:not([hidden])');
    const m = await page.evaluate(() => ({ sh: Math.round(document.querySelector('.foot').getBoundingClientRect().bottom) + 16, ih: innerHeight,
      small: [...document.querySelectorAll('#home button, #home a')].filter(e => e.offsetParent && e.getBoundingClientRect().height < 43.5 && !e.classList.contains('link')).map(e => e.textContent.trim()),
      prog: document.getElementById('progText').textContent, due: document.getElementById('dueText').textContent,
      chip: !!document.querySelector('.chip') }));
    await page.screenshot({ path: path.join(shots, `home-${p}-${s}.png`) });
    console.log(`${p}/${s}: content ends at ${m.sh} of ${m.ih}  ${m.prog}  | ${m.due}  chip=${m.chip}  small=${JSON.stringify(m.small)}`);
    assert(m.sh <= m.ih, `${p}/${s} does not fit one screen (${m.sh} > ${m.ih})`);
    assert.deepStrictEqual(m.small, [], `touch targets under 44px: ${m.small}`);
    assert.strictEqual(m.chip, p === 'returning');
    if (s === '0') assert(/^0 of (14|15) required$/.test(m.prog), m.prog);
    if (s === 'full') {
      assert(/^(14|15) of \1 required$/.test(m.prog), m.prog);
      assert(await page.locator('text=View my certificate').count() === 1, 'certificate button at full');
    } else assert(await page.locator('text=View my certificate').count() === 0, 'no certificate before complete');
  }

  // certificate only when complete
  await page.goto(`${base}?preview=mid&path=new#/certificate`);
  await page.waitForSelector('#home:not([hidden])');
  await page.goto(`${base}?preview=full&path=new#/certificate`);
  await page.waitForSelector('.cert');
  assert(/14 of 14/.test(await page.locator('.cert').innerText()) && /Alex Sample/.test(await page.locator('.cert').innerText()));
  await page.screenshot({ path: path.join(shots, 'certificate.png') });

  // keyboard toggles (collapsed groups open with Enter, aria-expanded flips)
  await page.goto(`${base}?preview=mid&path=new`); await page.waitForSelector('#home:not([hidden])');
  const more = page.locator('button.partline', { hasText: 'more modules' });
  assert.strictEqual(await more.getAttribute('aria-expanded'), 'false');
  await more.focus(); await page.keyboard.press('Enter');
  assert.strictEqual(await page.locator('button.partline', { hasText: 'fewer modules' }).getAttribute('aria-expanded'), 'true');
  const completed = page.locator('button.partline', { hasText: 'completed' });
  await completed.focus(); await page.keyboard.press('Space');
  assert.strictEqual(await page.locator('button.partline', { hasText: 'completed' }).getAttribute('aria-expanded'), 'true');

  // absence panel
  await page.goto(`${base}?preview=0&path=new`); await page.waitForSelector('#home:not([hidden])');
  const btn = page.locator('#absentBtn');
  assert.strictEqual(await btn.getAttribute('aria-expanded'), 'false');
  await btn.click();
  assert.strictEqual(await btn.getAttribute('aria-expanded'), 'true');
  assert.strictEqual(await page.locator('#absentSheet a.formbtn').getAttribute('href'), 'https://superpickle83.github.io/staffattendance/');
  assert.strictEqual(await page.locator('#absentSheet a.formbtn').getAttribute('target'), '_blank');
  assert.strictEqual(await page.locator('a[href^="tel:"]').count(), 0, 'no call button when 24+ hours');
  await page.locator('#absentSheet .seg button', { hasText: 'Under 24' }).click();
  assert.strictEqual(await page.locator('a[href="tel:8453541466"]').count(), 1);
  assert.strictEqual(await page.locator('a[href="sms:8454183337"]').count(), 1);
  assert.strictEqual(await page.locator('a[href="mailto:directors@deerkilldaycamp.com"]').count(), 1);
  const txt = await page.locator('#absentSheet').innerText();
  assert(/ALSO call or text camp/.test(txt) && /doesn’t replace the form/.test(txt));
  await page.screenshot({ path: path.join(shots, 'absent-open.png') });

  // returning: What's new first, is required, can't be skipped past
  await page.goto(`${base}?preview=0&path=returning`); await page.waitForSelector('#home:not([hidden])');
  assert(/What's new since last summer/.test(await page.locator('.card.next h2').innerText()));
  assert.strictEqual(await page.locator('.card.next .primary').innerText(), 'Start');

  assert.deepStrictEqual(external, [], 'external requests: ' + external);
  assert.deepStrictEqual(errors, [], 'page errors: ' + errors);
  await browser.close(); server.close();
  console.log('home layout tests passed');
})().catch(e => { console.error(e); process.exit(1); });
