// Stage 2 — staff-facing web app (Execute as: Dennis · Access: Anyone).
// Every response omits emails, phone numbers and hashes. Sessions are stateless signed tokens.

var SESSION_DAYS = 120;
var MAX_FAILS = 5;
var LOCK_MIN = 15;
var DAY_CAP = 20;
var GLOBAL_HOURLY_CAP = 600;

function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }

function doGet() { return json_({ ok: true }); }

function doPost(e) {
  var req;
  try { req = JSON.parse(e.postData.contents); } catch (x) { return json_({ ok: false, error: 'bad_request' }); }
  try { return json_(handle_(req || {})); }
  catch (err) { console.error('api error: ' + err.message); return json_({ ok: false, error: 'server_error' }); }
}

function handle_(req) {
  switch (req.action) {
    case 'exchange': return exchange_(req);
    case 'search':   return search_(req);
    case 'signin':   return signinLast4_(req);
    case 'me':       return me_(req);
    case 'open':     return openEvent_(req);
    case 'home':     return home_(req);
    case 'step':     return step_(req);
    case 'answer':   return answer_(req);
    case 'rate':     return rate_(req);
    default:         return { ok: false, error: 'unknown_action' };
  }
}

// ── pure logic (unit-tested offline) ──────────────────────

function evaluateLast4_(s, last4, nowMs, today) {
  var dayFails = s.dayKey === today ? (Number(s.dayFails) || 0) : 0;
  var lockUntil = Number(s.lockUntil) || 0;
  if (lockUntil > nowMs) return { ok: false, locked: true, minutes: Math.ceil((lockUntil - nowMs) / 60000), updates: {} };
  if (dayFails >= DAY_CAP) return { ok: false, locked: true, dayLocked: true, updates: {} };
  if (!s.last4Hash) return { ok: false, error: 'mismatch', updates: {} };
  if (/^\d{4}$/.test(String(last4)) && sha256Hex_(s.salt + String(last4)) === s.last4Hash) {
    return { ok: true, updates: { failCount: 0, lockUntil: 0 } };
  }
  var fails = (Number(s.failCount) || 0) + 1;
  dayFails++;
  var updates = { failCount: fails, dayKey: today, dayFails: dayFails };
  if (fails >= MAX_FAILS) {
    updates.failCount = 0;
    updates.lockUntil = nowMs + LOCK_MIN * 60000;
    return { ok: false, locked: true, minutes: LOCK_MIN, updates: updates };
  }
  return { ok: false, error: 'mismatch', updates: updates };
}

function matchNames_(staff, q) {
  var parts = String(q || '').trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (!parts.length || parts[0].length < 2) return [];
  return staff.filter(function (s) {
    if (s.active !== 'Yes') return false;
    var name = String(s.displayName).toLowerCase().split(/\s+/);
    var first = name[0] || '', last = name[name.length - 1] || '';
    if (first.indexOf(parts[0]) !== 0) return false;
    if (parts.length > 1 && last.charAt(0) !== parts[1].charAt(0)) return false;
    return true;
  }).slice(0, 10).map(function (s) {
    var n = String(s.displayName).split(/\s+/);
    var name = n[0] + (n.length > 1 ? ' ' + n[n.length - 1].charAt(0).toUpperCase() + '.' : '');
    var hasBus = s.bus && !/^(none|n\/a|na|-)$/i.test(String(s.bus).trim());
    return { id: s.staffId, label: hasBus ? name + ' · Bus ' + s.bus : name }; // bus # tells two "Sam K."s apart
  });
}

function b64url_(bytes) { return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, ''); }
function sessionSecret_() {
  var p = PropertiesService.getScriptProperties();
  var s = p.getProperty('SESSION_SECRET');
  if (!s) { s = newToken_() + newToken_(); p.setProperty('SESSION_SECRET', s); }
  return s;
}
function signSession_(staffId, ver, expMs) {
  var payload = staffId + '.' + ver + '.' + expMs;
  return payload + '.' + b64url_(Utilities.computeHmacSha256Signature(payload, sessionSecret_()));
}
function verifySession_(token) {
  var parts = String(token || '').split('.');
  if (parts.length !== 4) return null;
  var payload = parts.slice(0, 3).join('.');
  var want = b64url_(Utilities.computeHmacSha256Signature(payload, sessionSecret_()));
  if (want !== parts[3]) return null;
  if (Number(parts[2]) < Date.now()) return null;
  var s = readStaff_().filter(function (x) { return x.staffId === parts[0]; })[0];
  if (!s || s.active !== 'Yes' || String(s.sessionVer) !== parts[1]) return null;
  return s;
}

// ── handlers ──────────────────────────────────────────────

function todayKey_() { return Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd'); }

function globalThrottle_() {
  var c = CacheService.getScriptCache();
  var n = Number(c.get('g_attempts')) || 0;
  if (n >= GLOBAL_HOURLY_CAP) return false;
  c.put('g_attempts', String(n + 1), 3600);
  return true;
}

function logEvent_(staffId, type, moduleId, detail) {
  ss_().getSheetByName(TRAIN.TAB_EVENTS).appendRow([staffId, type, moduleId || '', new Date().toISOString(), detail || '']);
}

function sessionFor_(s) {
  var exp = Date.now() + SESSION_DAYS * 86400000;
  return { token: signSession_(s.staffId, s.sessionVer, exp), exp: exp };
}
function profile_(s) { return { name: s.displayName.split(/\s+/)[0], fullName: s.displayName, path: s.path, bus: s.bus }; }

function exchange_(req) {
  if (!globalThrottle_()) return { ok: false, error: 'busy' };
  var t = String(req.token || '');
  if (!/^[0-9a-f]{64}$/.test(t)) return { ok: false, error: 'invalid_link' };
  var h = sha256Hex_(t);
  var s = readStaff_().filter(function (x) { return x.tokenHash === h && x.active === 'Yes'; })[0];
  if (!s) return { ok: false, error: 'invalid_link' };
  logEvent_(s.staffId, 'signin');
  return Object.assign({ ok: true, session: sessionFor_(s) }, profile_(s));
}

function search_(req) {
  if (!globalThrottle_()) return { ok: false, error: 'busy' };
  return { ok: true, matches: matchNames_(readStaff_(), req.q) };
}

function signinLast4_(req) {
  if (!globalThrottle_()) return { ok: false, error: 'busy' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var staff = readStaff_();
    var s = staff.filter(function (x) { return x.staffId === String(req.id || '') && x.active === 'Yes'; })[0];
    if (!s) return { ok: false, error: 'mismatch' };
    var r = evaluateLast4_(s, req.last4, Date.now(), todayKey_());
    if (Object.keys(r.updates).length) { Object.assign(s, r.updates); writeStaff_(staff); }
    if (r.locked) return { ok: false, error: 'locked', minutes: r.minutes || null, dayLocked: !!r.dayLocked };
    if (!r.ok) return { ok: false, error: 'mismatch' };
    logEvent_(s.staffId, 'signin');
    return Object.assign({ ok: true, session: sessionFor_(s) }, profile_(s));
  } finally { lock.releaseLock(); }
}

function me_(req) {
  var s = verifySession_(req.session);
  return s ? Object.assign({ ok: true }, profile_(s)) : { ok: false, error: 'session' };
}

function readProgress_(staffId) {
  var sh = ss_().getSheetByName(TRAIN.TAB_PROGRESS);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, TRAIN.PROGRESS_HEADERS.length).getValues()
    .filter(function (r) { return String(r[0]) === staffId; })
    .map(function (r) { return { moduleId: String(r[1]), step: String(r[2]), status: String(r[3]), testedOut: String(r[4]),
      score: r[5] === '' ? null : Number(r[5]), attempts: Number(r[6]) || 0, completedAt: String(r[7]) }; });
}

function readConfig_() {
  var rows = ss_().getSheetByName(TRAIN.TAB_CONFIG).getDataRange().getValues().slice(1);
  var out = { dueDate: '2027-06-19', whatsnew: [] };
  rows.forEach(function (r) {
    if (r[0] === 'setting' && r[1] === 'dueDate' && /^\d{4}-\d{2}-\d{2}$/.test(String(r[2]))) out.dueDate = String(r[2]);
    if (r[0] === 'whatsnew' && r[1]) out.whatsnew.push({ item: String(r[1]), description: String(r[2]), moduleId: String(r[3]), section: String(r[4]) });
  });
  return out;
}

function home_(req) {
  var s = verifySession_(req.session);
  if (!s) return { ok: false, error: 'session' };
  var cfg = readConfig_();
  return Object.assign({ ok: true, progress: readProgress_(s.staffId), whatsnew: cfg.whatsnew, dueDate: cfg.dueDate,
    surveySubmitted: s.surveySubmitted === 'Yes' }, profile_(s));
}

// Marks one step done. Check steps also record score + attempts; watch/read can be flagged testedOut,
// which the server only allows after a perfect first-try check for that module.
function step_(req) {
  var s = verifySession_(req.session);
  if (!s) return { ok: false, error: 'session' };
  var moduleId = String(req.moduleId || ''), step = String(req.step || '');
  if (!/^[a-z0-9-]{2,30}$/.test(moduleId) || ['watch', 'read', 'check', 'do'].indexOf(step) < 0) return { ok: false, error: 'bad_request' };
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    var sh = ss_().getSheetByName(TRAIN.TAB_PROGRESS);
    var n = sh.getLastRow() - 1, at = new Date().toISOString();
    var vals = n > 0 ? sh.getRange(2, 1, n, TRAIN.PROGRESS_HEADERS.length).getValues() : [];
    var rowOf = function (st) {
      for (var i = 0; i < vals.length; i++) if (String(vals[i][0]) === s.staffId && String(vals[i][1]) === moduleId && String(vals[i][2]) === st) return i;
      return -1;
    };
    var testedOut = '';
    if (req.testedOut === true && (step === 'watch' || step === 'read')) {
      var c = rowOf('check');
      if (c < 0 || Number(vals[c][5]) !== 100) return { ok: false, error: 'not_eligible' };
      testedOut = 'Yes';
    }
    var score = '', attempts = '';
    if (step === 'check') {
      var sc = Number(req.score), at2 = Number(req.attempts);
      if (!(sc >= 0 && sc <= 100) || !(at2 >= 1 && at2 <= 50)) return { ok: false, error: 'bad_request' };
      score = Math.round(sc); attempts = Math.round(at2);
    }
    var i = rowOf(step);
    if (i < 0) {
      sh.appendRow([s.staffId, moduleId, step, 'done', testedOut, score, attempts, at]);
      logEvent_(s.staffId, moduleId === 'whatsnew' ? 'whatsnew' : 'step', moduleId, step + (testedOut ? ':testedOut' : ''));
    } else if (step === 'check') {
      // First score is kept; later retakes only add attempts.
      sh.getRange(i + 2, 7).setValue(String((Number(vals[i][6]) || 0) + attempts));
    }
  } finally { lock.releaseLock(); }
  return { ok: true };
}

function answer_(req) {
  var s = verifySession_(req.session);
  if (!s) return { ok: false, error: 'session' };
  var moduleId = String(req.moduleId || ''), qid = String(req.qid || ''), choice = String(req.choice || '');
  if (!/^[a-z0-9-]{2,30}$/.test(moduleId) || !/^q[0-9]{1,2}$/.test(qid) || !/^[A-D]$/.test(choice)) return { ok: false, error: 'bad_request' };
  logEvent_(s.staffId, 'answer', moduleId, qid + ':' + choice + ':' + (req.correct === true ? '1' : '0'));
  return { ok: true };
}

// Anonymous by design: no staffId is stored with a module rating.
function rate_(req) {
  var s = verifySession_(req.session);
  if (!s) return { ok: false, error: 'session' };
  var moduleId = String(req.moduleId || '');
  if (!/^[a-z0-9-]{2,30}$/.test(moduleId) || (req.clear !== 'Yes' && req.clear !== 'No')) return { ok: false, error: 'bad_request' };
  var comment = String(req.comment || '').slice(0, 500);
  ss_().getSheetByName(TRAIN.TAB_FB_MODULE).appendRow([new Date().toISOString(), moduleId, req.clear, comment, '']);
  return { ok: true };
}

function openEvent_(req) {
  var s = verifySession_(req.session);
  if (!s) return { ok: false, error: 'session' };
  logEvent_(s.staffId, 'open');
  return { ok: true };
}
