#!/usr/bin/env node
// Fails (exit 1) if any tracked file contains an email, phone number, key or token.
// The repo is PUBLIC (GitHub Pages) — runs before every push (pre-push hook).
// Allowed camp contacts: directors@deerkilldaycamp.com, 845-354-1466, 845-418-3337.
// Exits 2 (also a failed push) if the scan itself cannot run — it must never pass by accident.
const { execSync } = require('child_process');
const fs = require('fs'), path = require('path');

const root = execSync('git rev-parse --show-toplevel').toString().trim();
process.chdir(root);
const SKIP = [/^scripts\/secret-scan\.js$/, /^test\//, /\.(mp4|vtt|png|jpe?g|svg|woff2?)$/i];
const files = execSync('git ls-files -z').toString().split('\0').filter(f => f && !SKIP.some(re => re.test(f)));

const ALLOW_EMAIL = /^directors@deerkilldaycamp\.com$/i;
const ALLOW_PHONE = /845\)?[-. ]?354[-. ]?1466|845\)?[-. ]?418[-. ]?3337/;

const RULES = [
  { label: 'email address', re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, ok: m => ALLOW_EMAIL.test(m[0]) },
  { label: 'phone-number-like value', re: /(?<![0-9a-fA-F])\(?[2-9][0-9]{2}\)?[-. ]?[0-9]{3}[-. ]?[0-9]{4}(?![0-9a-fA-F])/g, ok: m => ALLOW_PHONE.test(m[0]) },
  { label: 'key/credential pattern', re: /AKIA[0-9A-Z]{16}|-----BEGIN [A-Z ]*PRIVATE KEY|xox[baprs]-[0-9A-Za-z-]+|AIza[0-9A-Za-z_-]{35}|ghp_[0-9A-Za-z]{36}/g },
  { label: 'API_KEY is not the placeholder', re: /API_KEY\s*=\s*['"](?!REPLACE_WITH_API_SECRET)[^'"]+['"]/g },
  { label: 'personal link token / session secret', re: /#k=[0-9a-f]{64}|SESSION_SECRET\s*[=:]\s*["'][0-9a-f]{20,}/g },
];

function scan(text, rules = RULES) {
  const hits = [];
  text.split('\n').forEach((line, i) => {
    for (const r of rules) {
      r.re.lastIndex = 0;
      for (const m of line.matchAll(r.re)) if (!(r.ok && r.ok(m))) hits.push({ line: i + 1, label: r.label });
    }
  });
  return hits;
}

if (process.argv[2] === '--selftest') {
  const bad = 'x="a@b.com"; y="845-555-0199"; window.API_KEY = "abc"; z=AKIA' + 'A'.repeat(16) + '#k=' + 'a'.repeat(64);
  const labels = new Set(scan(bad).map(h => h.label));
  const good = 'directors@deerkilldaycamp.com 845-354-1466 (845) 418-3337 window.API_KEY = "REPLACE_WITH_API_SECRET"';
  if (labels.size !== RULES.length || scan(good).length) { console.error('secret-scan selftest FAILED', [...labels]); process.exit(2); }
  console.log('secret-scan selftest ok'); process.exit(0);
}

let failed = false;
try {
  // Refuse to pass if the detector itself is broken.
  if (new Set(scan('a@b.com 845-555-0199').map(h => h.label)).size !== 2) throw new Error('detector self-check failed');
  for (const f of files) {
    const hits = scan(fs.readFileSync(f, 'utf8'));
    for (const h of hits) { console.log(`SECRET-SCAN: ${h.label} — ${f}:${h.line}`); failed = true; }
  }
} catch (e) { console.error('SECRET-SCAN: scan could not run: ' + e.message); process.exit(2); }
if (failed) process.exit(1);
console.log(`secret-scan: clean (${files.length} files)`);
