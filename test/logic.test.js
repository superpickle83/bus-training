// Offline test of the pure Apps Script logic (Roster.gs / Api.gs) with a stubbed Utilities.
const fs = require('fs'), vm = require('vm'), crypto = require('crypto'), assert = require('assert');

const ctx = vm.createContext({
  console,
  Utilities: {
    DigestAlgorithm: { SHA_256: 'sha256' }, Charset: { UTF_8: 'utf8' },
    computeDigest: (_a, s) => [...crypto.createHash('sha256').update(s, 'utf8').digest()].map(b => (b > 127 ? b - 256 : b)),
    getUuid: () => crypto.randomUUID(),
    computeHmacSha256Signature: (p, k) => [...crypto.createHmac('sha256', k).update(p).digest()],
    base64EncodeWebSafe: bytes => Buffer.from(bytes.map(b => (b < 0 ? b + 256 : b))).toString('base64url'),
  },
});
for (const f of ['Roster.gs', 'Api.gs']) vm.runInContext(fs.readFileSync(__dirname + '/../apps-script/' + f, 'utf8'), ctx);
const run = (code) => vm.runInContext(code, ctx);
const BASE = 'https://example.github.io/bus-training/';
const NOW = '2027-01-05 10:00';

const mk = (row, first, last, email, phone, years) =>
  ({ row, first, last, bus: '7', email, phone, years, link: '', created: '', emailSent: '', textSent: '' });
const apply = (rows, plan) => {
  plan.placements.forEach(p => Object.assign(rows.find(r => r.row === p.row), { link: p.link, created: p.created, emailSent: p.emailSent, textSent: p.textSent }));
};
const plan = (rows, staff) => { ctx.__r = rows; ctx.__s = staff; ctx.__c = { base: BASE, now: NOW }; return run('planReconcile_(__r, __s, __c)'); };

let rows = [
  mk(2, 'Ann', 'Adams', 'ann@x.org', '(845) 555-0101', '1'),
  mk(3, 'Bo', 'Brown', 'Bo@x.org ', '1-845-555-0102', '3'),
  mk(4, 'Cy', 'Cole', 'cy@x.org', '845.555.0103', '2'),
];

// Gate 1a: first run creates one link each
let p = plan(rows, []);
assert.strictEqual(p.added.length, 3);
assert.strictEqual(p.placements.length, 3);
apply(rows, p);
let staff = p.staff;
assert.deepStrictEqual(staff.map(s => s.path), ['new', 'returning', 'returning']);
assert(rows.every(r => /#k=[0-9a-f]{64}$/.test(r.link)));

// Gate 1b: second run changes nothing
p = plan(rows, staff);
assert.strictEqual(p.placements.length, 0); assert.strictEqual(p.corrections.length, 0); assert.strictEqual(p.added.length, 0);

// Gate 1c: no plain token or phone digits in the staff records
const blob = JSON.stringify(staff);
for (const r of rows) assert(!blob.includes(r.link.split('#k=')[1]), 'plain token stored');
for (const d of ['0101', '0102', '0103']) assert(!blob.includes(d), 'phone digits stored');

// Gate 1d: sort A–F only (G–J stay put) → corrections, and links end up with the right person
const linksByEmail = Object.fromEntries(rows.map(r => [r.email.trim().toLowerCase(), r.link]));
const sorted = [rows[2], rows[0], rows[1]].map((r, i) => ({ ...r, row: i + 2 }));
const oldG = rows.map(r => ({ link: r.link, created: r.created }));
sorted.forEach((r, i) => Object.assign(r, { link: oldG[i].link, created: oldG[i].created }));
p = plan(sorted, staff);
assert.strictEqual(p.corrections.length, 3);
apply(sorted, p);
for (const r of sorted) assert.strictEqual(r.link, linksByEmail[r.email.trim().toLowerCase()]);
p = plan(sorted, staff);
assert.strictEqual(p.placements.length, 0, 'second run after repair should be clean');

// sent-flags travel with the link
sorted[0].textSent = 'sent'; // row of Cy
const cyLink = sorted[0].link;
const sorted2 = [sorted[1], sorted[2], sorted[0]].map((r, i) => ({ ...r, row: i + 2 }));
sorted2.forEach((r, i) => { const src = [sorted[0], sorted[1], sorted[2]][i]; r.link = src.link; r.created = src.created; r.emailSent = src.emailSent; r.textSent = src.textSent; });
p = plan(sorted2, staff); apply(sorted2, p);
assert.strictEqual(sorted2.find(r => r.link === cyLink).textSent, 'sent');
assert.strictEqual(sorted2.find(r => r.link === cyLink).email, 'cy@x.org');

// Late hire anywhere, removed row, duplicate email, pasted row
const rows3 = sorted2.map(r => ({ ...r }));
rows3.splice(1, 0, mk(0, 'Dee', 'Dunn', 'dee@x.org', '845-555-0104', '1'));
rows3.forEach((r, i) => (r.row = i + 2));
p = plan(rows3, staff);
assert.strictEqual(p.added.length, 1);
apply(rows3, p);
const rows4 = rows3.filter(r => r.email !== 'cy@x.org').map((r, i) => ({ ...r, row: i + 2 }));
rows4.push(mk(99, 'Ann', 'Again', 'ann@x.org', '', '1'));
p = plan(rows4, p.staff);
assert(p.staff.find(s => s.email === 'cy@x.org').active === 'No', 'removed row → inactive');
assert(p.warnings.some(w => /same email/.test(w)));

// Stage 2: lockout
const s0 = staff[0];
const L4 = '0101';
assert.strictEqual(vm.runInContext(`evaluateLast4_(${JSON.stringify(s0)}, '${L4}', 1000, 'd1').ok`, ctx), true);
let cur = { ...s0 };
let res;
for (let i = 1; i <= 5; i++) {
  ctx.__s0 = cur;
  res = run(`evaluateLast4_(__s0, '9999', ${1000 + i}, 'd1')`);
  Object.assign(cur, res.updates);
}
assert(res.locked && res.minutes === 15, '5th failure locks 15 min');
ctx.__s0 = cur;
assert(run(`evaluateLast4_(__s0, '${L4}', 60000, 'd1')`).locked, 'correct code still refused while locked');
assert(run(`evaluateLast4_(__s0, '${L4}', ${1005 + 15 * 60000 + 1}, 'd1')`).ok, 'unlocks after 15 min');
// daily cap
cur = { ...s0, dayKey: 'd1', dayFails: 20, lockUntil: 0 }; ctx.__s0 = cur;
assert(run(`evaluateLast4_(__s0, '${L4}', 5000, 'd1')`).dayLocked, 'daily cap');
assert(run(`evaluateLast4_(__s0, '${L4}', 5000, 'd2')`).ok, 'cap resets next day');

// name search: first name + last initial only
ctx.__st = staff;
const m = run(`matchNames_(__st, 'an a')`);
assert.deepStrictEqual(m.map(x => x.label), ['Ann A.']);
assert.strictEqual(run(`matchNames_(__st, 'a')`).length, 0, 'one letter returns nothing');
assert(!JSON.stringify(m).includes('@'), 'no email in search results');

console.log('all logic tests passed');
