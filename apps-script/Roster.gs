// Stage 1 — roster, links and the "Training" menu. Bound to the BusCounselorTraining spreadsheet.
// Reads BusCounselors A–F; writes only G (TrainingLink), H (LinkCreated), I (EmailSent), J (TextSent).
// Never touches the StaffData or Dates tabs.

var TRAIN = {
  ROSTER_TAB: 'BusCounselors',
  TAB_STAFF: 'T_Staff',
  TAB_PROGRESS: 'T_Progress',
  TAB_EVENTS: 'T_Events',
  TAB_CONFIG: 'T_Config',
  TAB_FB_MODULE: 'T_FeedbackModule',
  TAB_FB_SURVEY: 'T_FeedbackSurvey',
  TAB_FB_CHECKIN: 'T_FeedbackCheckin',
  STAFF_HEADERS: ['staffId', 'email', 'displayName', 'bus', 'staffYears', 'path', 'tokenHash', 'last4Hash',
    'salt', 'active', 'createdAt', 'sessionVer', 'failCount', 'lockUntil', 'dayKey', 'dayFails', 'surveySubmitted'],
  PROGRESS_HEADERS: ['staffId', 'moduleId', 'step', 'status', 'testedOut', 'score', 'attempts', 'completedAt'],
  EVENTS_HEADERS: ['staffId', 'type', 'moduleId', 'at'],
  CONFIG_HEADERS: ['kind', 'item', 'description', 'moduleId', 'section'],
  FB_MODULE_HEADERS: ['at', 'moduleId', 'clear', 'comment', 'staffId'],
  FB_SURVEY_HEADERS: ['at', 'q1', 'q2', 'q3', 'q4', 'q5', 'q6', 'q7', 'followUp', 'staffId'],
  FB_CHECKIN_HEADERS: ['at', 'q1', 'q2', 'q3'],
};

// ── pure helpers ──────────────────────────────────────────

function sha256Hex_(s) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, s, Utilities.Charset.UTF_8);
  return bytes.map(function (b) { return (b < 0 ? b + 256 : b).toString(16).padStart(2, '0'); }).join('');
}
function newToken_() { return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, ''); }
function normalizeEmail_(v) { return String(v || '').trim().toLowerCase(); }
function isValidEmail_(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e); }
function last4FromPhone_(v) {
  var d = String(v || '').replace(/\D/g, '');
  if (d.length === 11 && d.charAt(0) === '1') d = d.slice(1);
  return d.length === 10 ? d.slice(-4) : '';
}
function pathFromYears_(y) { return parseInt(y, 10) >= 2 ? 'returning' : 'new'; }
function makeLink_(base, token) { return base.replace(/\/?$/, '/') + '#k=' + token; }
function tokenFromLink_(link) {
  var m = /#k=([0-9a-f]{64})(?![0-9a-f])/.exec(String(link || ''));
  return m ? m[1] : '';
}
function sameBlock_(a, b) {
  return a.link === b.link && a.created === b.created && a.emailSent === b.emailSent && a.textSent === b.textSent;
}

function newStaff_(r, email, ctx, plan) {
  var token = newToken_();
  var salt = newToken_().slice(0, 32);
  var last4 = last4FromPhone_(r.phone);
  var s = {
    staffId: 's' + newToken_().slice(0, 10), email: email,
    displayName: (r.first + ' ' + r.last).trim(), bus: String(r.bus || '').trim(),
    staffYears: String(r.years || '').trim(), path: pathFromYears_(r.years),
    tokenHash: sha256Hex_(token), last4Hash: last4 ? sha256Hex_(salt + last4) : '', salt: salt,
    active: 'Yes', createdAt: ctx.now, sessionVer: 1, failCount: 0, lockUntil: 0,
    dayKey: '', dayFails: 0, surveySubmitted: 'No',
  };
  plan.newTokens[s.staffId] = token;
  plan.added.push(s.staffId);
  return s;
}

// rows: [{row, first, last, bus, email, phone, years, link, created, emailSent, textSent}]
// staff: existing T_Staff records. Returns a plan; touches nothing.
function planReconcile_(rows, staff, ctx) {
  var plan = { staff: staff.map(function (s) { return Object.assign({}, s); }),
    added: [], placements: [], corrections: [], warnings: [], newTokens: {} };
  var byEmail = {};
  plan.staff.forEach(function (s) { byEmail[s.email] = s; });

  var seen = {}, processed = [];
  rows.forEach(function (r) {
    var email = normalizeEmail_(r.email);
    if (!email) return;
    if (!isValidEmail_(email)) { plan.warnings.push('Row ' + r.row + ': email is not valid — skipped'); return; }
    if (seen[email]) { plan.warnings.push('Row ' + r.row + ': same email as row ' + seen[email] + ' — skipped'); return; }
    seen[email] = r.row;
    var s = byEmail[email];
    if (!s) {
      s = newStaff_(r, email, ctx, plan);
      plan.staff.push(s); byEmail[email] = s;
    } else {
      s.displayName = (r.first + ' ' + r.last).trim();
      s.bus = String(r.bus || '').trim();
      s.staffYears = String(r.years || '').trim();
      s.path = pathFromYears_(r.years);
      s.active = 'Yes';
      var l4 = last4FromPhone_(r.phone);
      if (l4) {
        var h = sha256Hex_(s.salt + l4);
        if (h !== s.last4Hash) s.last4Hash = h;
      }
    }
    if (!s.last4Hash) plan.warnings.push('Row ' + r.row + ' (' + s.displayName + '): no valid phone — name + last-4 sign-in unavailable for them');
    if (!/^\d+$/.test(s.staffYears)) plan.warnings.push('Row ' + r.row + ' (' + s.displayName + '): StaffYears is blank or not a number — treated as new');
    processed.push({ r: r, s: s });
  });

  plan.staff.forEach(function (s) {
    if (!seen[s.email] && s.active === 'Yes') { s.active = 'No'; plan.warnings.push(s.displayName + ' is no longer on the roster — marked inactive'); }
  });

  // Every existing link cell, wherever it sits, keyed by the staff member it belongs to.
  var hashToStaff = {};
  plan.staff.forEach(function (s) { hashToStaff[s.tokenHash] = s; });
  var found = {};
  rows.forEach(function (r) {
    var t = tokenFromLink_(r.link);
    if (!t) return;
    var s = hashToStaff[sha256Hex_(t)];
    if (s && !found[s.staffId]) found[s.staffId] = { link: r.link, created: r.created, emailSent: r.emailSent, textSent: r.textSent };
  });

  var processedRows = {};
  processed.forEach(function (p) {
    var r = p.r, s = p.s, block;
    processedRows[r.row] = true;
    if (plan.newTokens[s.staffId]) {
      block = { link: makeLink_(ctx.base, plan.newTokens[s.staffId]), created: ctx.now, emailSent: '', textSent: '' };
    } else if (found[s.staffId]) {
      block = found[s.staffId];
    } else {
      var t = newToken_();
      s.tokenHash = sha256Hex_(t);
      s.sessionVer = (Number(s.sessionVer) || 1) + 1;
      plan.newTokens[s.staffId] = t;
      block = { link: makeLink_(ctx.base, t), created: ctx.now, emailSent: '', textSent: '' };
      plan.warnings.push('Row ' + r.row + ' (' + s.displayName + '): their link could not be found anywhere in column G — reissued (the old link no longer works)');
    }
    var cur = { link: r.link, created: r.created, emailSent: r.emailSent, textSent: r.textSent };
    if (sameBlock_(cur, block)) return;
    plan.placements.push({ row: r.row, link: block.link, created: block.created, emailSent: block.emailSent, textSent: block.textSent });
    if (r.link && !plan.newTokens[s.staffId]) plan.corrections.push({ row: r.row, name: s.displayName });
  });

  // A link left behind on a row that isn't a person (blank/invalid/duplicate email) must not stay live.
  rows.forEach(function (r) {
    if (processedRows[r.row]) return;
    var t = tokenFromLink_(r.link);
    if (t && hashToStaff[sha256Hex_(t)]) {
      plan.placements.push({ row: r.row, link: '', created: '', emailSent: '', textSent: '' });
      plan.warnings.push('Row ' + r.row + ': held a working link but has no usable email — cleared');
    }
  });
  return plan;
}

// ── sheet I/O ─────────────────────────────────────────────

function ss_() { return SpreadsheetApp.getActiveSpreadsheet(); }
function nowStr_() { return Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HH:mm'); }
function siteBase_() {
  var b = PropertiesService.getScriptProperties().getProperty('SITE_BASE');
  if (!b) throw new Error('Set Script Property SITE_BASE (e.g. https://superpickle83.github.io/bus-training/) first.');
  return b;
}

function ensureTab_(name, headers) {
  var sh = ss_().getSheetByName(name);
  if (!sh) {
    sh = ss_().insertSheet(name);
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
    sh.setFrozenRows(1);
    sh.getRange(1, 1, sh.getMaxRows(), headers.length).setNumberFormat('@'); // keep hashes as text
  }
  return sh;
}
function ensureTabs_() {
  ensureTab_(TRAIN.TAB_STAFF, TRAIN.STAFF_HEADERS);
  ensureTab_(TRAIN.TAB_PROGRESS, TRAIN.PROGRESS_HEADERS);
  ensureTab_(TRAIN.TAB_EVENTS, TRAIN.EVENTS_HEADERS);
  ensureTab_(TRAIN.TAB_FB_MODULE, TRAIN.FB_MODULE_HEADERS);
  ensureTab_(TRAIN.TAB_FB_SURVEY, TRAIN.FB_SURVEY_HEADERS);
  ensureTab_(TRAIN.TAB_FB_CHECKIN, TRAIN.FB_CHECKIN_HEADERS);
  var cfg = ensureTab_(TRAIN.TAB_CONFIG, TRAIN.CONFIG_HEADERS);
  if (cfg.getLastRow() < 2) cfg.appendRow(['setting', 'dueDate', '2027-06-19', '', '']);
}

function readRoster_() {
  var sh = ss_().getSheetByName(TRAIN.ROSTER_TAB);
  if (!sh) throw new Error('Tab "' + TRAIN.ROSTER_TAB + '" not found.');
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  var v = sh.getRange(2, 1, n, 10).getDisplayValues();
  return v.map(function (x, i) {
    return { row: i + 2, last: x[0], first: x[1], bus: x[2], email: x[3], phone: x[4], years: x[5],
      link: x[6], created: x[7], emailSent: x[8], textSent: x[9] };
  });
}
function readStaff_() {
  var sh = ss_().getSheetByName(TRAIN.TAB_STAFF);
  var n = sh.getLastRow() - 1;
  if (n < 1) return [];
  return sh.getRange(2, 1, n, TRAIN.STAFF_HEADERS.length).getValues().map(function (row) {
    var o = {};
    TRAIN.STAFF_HEADERS.forEach(function (h, i) { o[h] = row[i] === '' ? '' : String(row[i]); });
    return o;
  });
}
function writeStaff_(staff) {
  var sh = ss_().getSheetByName(TRAIN.TAB_STAFF);
  var old = Math.max(sh.getLastRow() - 1, 0);
  if (old) sh.getRange(2, 1, old, TRAIN.STAFF_HEADERS.length).clearContent();
  if (!staff.length) return;
  var data = staff.map(function (s) { return TRAIN.STAFF_HEADERS.map(function (h) { return String(s[h] === undefined ? '' : s[h]); }); });
  sh.getRange(2, 1, data.length, TRAIN.STAFF_HEADERS.length).setNumberFormat('@').setValues(data);
}
function writeBlock_(row, b) {
  ss_().getSheetByName(TRAIN.ROSTER_TAB).getRange(row, 7, 1, 4).setValues([[b.link, b.created, b.emailSent, b.textSent]]);
}

// Idempotent: creates links for new rows AND repairs any row whose link belongs to someone else.
function reconcileLinks_() {
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    ensureTabs_();
    var plan = planReconcile_(readRoster_(), readStaff_(), { base: siteBase_(), now: nowStr_() });
    writeStaff_(plan.staff);
    plan.placements.forEach(function (p) { writeBlock_(p.row, p); });
    return plan;
  } finally { lock.releaseLock(); }
}

function summarize_(plan, title) {
  var lines = [title, 'New links created: ' + plan.added.length];
  if (plan.corrections.length) {
    lines.push('', 'Corrected ' + plan.corrections.length + ' row(s) whose link belonged to someone else:');
    plan.corrections.forEach(function (c) { lines.push('  Row ' + c.row + ' — ' + c.name); });
  }
  if (plan.warnings.length) { lines.push('', 'Heads up:'); plan.warnings.forEach(function (w) { lines.push('  ' + w); }); }
  if (!plan.added.length && !plan.corrections.length && !plan.warnings.length) lines.push('Nothing needed changing.');
  return lines.join('\n');
}

// ── menu ──────────────────────────────────────────────────

function onOpen() {
  SpreadsheetApp.getUi().createMenu('Training')
    .addItem('Create links for new rows', 'menuCreateLinks')
    .addItem('Reset link for selected row', 'menuResetLink')
    .addItem('Rebuild all links for the current address', 'menuRebuildLinks')
    .addItem('Unlock selected person (sign-in lockout)', 'menuUnlock')
    .addItem("Add starting 'What's new' items", 'menuSeedWhatsNew')
    .addToUi();
}

function menuUnlock() {
  var ui = SpreadsheetApp.getUi();
  var sh = ss_().getActiveSheet();
  var row = sh.getActiveCell().getRow();
  if (sh.getName() !== TRAIN.ROSTER_TAB || row < 2) { ui.alert('Select a counselor row on the ' + TRAIN.ROSTER_TAB + ' tab first.'); return; }
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var r = readRoster_().filter(function (x) { return x.row === row; })[0];
    var staff = readStaff_();
    var s = staff.filter(function (x) { return x.email === normalizeEmail_(r && r.email); })[0];
    if (!s) { ui.alert('That row has no training record yet. Run "Create links for new rows" first.'); return; }
    s.failCount = 0; s.lockUntil = 0; s.dayFails = 0; s.dayKey = '';
    writeStaff_(staff);
    ui.alert(s.displayName + ' can try signing in again.');
  } finally { lock.releaseLock(); }
}

// Starting list from the course plan — Dennis edits/extends it in the T_Config tab.
function menuSeedWhatsNew() {
  var ui = SpreadsheetApp.getUi();
  ensureTabs_();
  var sh = ss_().getSheetByName(TRAIN.TAB_CONFIG);
  var existing = sh.getDataRange().getValues().filter(function (r) { return r[0] === 'whatsnew'; });
  if (existing.length) { ui.alert('T_Config already has ' + existing.length + " 'What's new' item(s). Edit them there."); return; }
  var rows = [
    ['whatsnew', '"All Done" button', 'Tap it at the end of the afternoon run, once you are off the bus and the last camper is dropped off.', 'p2-alldone', ''],
    ['whatsnew', '"What if..?" help tool', 'Quick answers for problems on the bus, right inside the app.', 'p2-whatif', ''],
    ['whatsnew', 'Staff absence procedure', 'Always fill out the absence form. Under 24 hours, ALSO call or text camp.', 'p1-welcome', ''],
    ['whatsnew', 'Failed texts stay in the box', 'If a text does not send, it stays in the box so you can resend it.', 'p2-texting', ''],
    ['whatsnew', 'Training link by text', 'Camp now texts you your personal training link.', 'p1-welcome', ''],
  ];
  sh.getRange(sh.getLastRow() + 1, 1, rows.length, 5).setNumberFormat('@').setValues(rows);
  ui.alert('Added ' + rows.length + " starting items to T_Config. Edit or add rows there; 'moduleId' decides which module gets the New for 2027 badge.");
}

function menuCreateLinks() {
  var plan = reconcileLinks_();
  SpreadsheetApp.getUi().alert(summarize_(plan, 'Create links'));
}

function menuResetLink() {
  var ui = SpreadsheetApp.getUi();
  var sh = ss_().getActiveSheet();
  var row = sh.getActiveCell().getRow();
  if (sh.getName() !== TRAIN.ROSTER_TAB || row < 2) { ui.alert('Select a counselor row on the ' + TRAIN.ROSTER_TAB + ' tab first.'); return; }
  reconcileLinks_();
  var lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    var r = readRoster_().filter(function (x) { return x.row === row; })[0];
    var staff = readStaff_();
    var s = staff.filter(function (x) { return x.email === normalizeEmail_(r && r.email); })[0];
    if (!s) { ui.alert('That row has no usable email, so there is no link to reset.'); return; }
    if (ui.alert('Reset link for ' + s.displayName + '? Their old link stops working.', ui.ButtonSet.YES_NO) !== ui.Button.YES) return;
    var t = newToken_();
    s.tokenHash = sha256Hex_(t);
    s.sessionVer = (Number(s.sessionVer) || 1) + 1;
    writeStaff_(staff);
    writeBlock_(row, { link: makeLink_(siteBase_(), t), created: nowStr_(), emailSent: '', textSent: '' });
  } finally { lock.releaseLock(); }
  ui.alert('Link reset for row ' + row + '.');
}

function menuRebuildLinks() {
  var plan = reconcileLinks_();
  var base = siteBase_(), changed = 0;
  var staff = readStaff_();
  var byHash = {};
  staff.forEach(function (s) { byHash[s.tokenHash] = s; });
  readRoster_().forEach(function (r) {
    var t = tokenFromLink_(r.link);
    if (!t || !byHash[sha256Hex_(t)] || byHash[sha256Hex_(t)].active !== 'Yes') return;
    var want = makeLink_(base, t);
    if (want !== r.link) {
      ss_().getSheetByName(TRAIN.ROSTER_TAB).getRange(r.row, 7).setValue(want);
      changed++;
    }
  });
  SpreadsheetApp.getUi().alert(summarize_(plan, 'Rebuild all links') + '\n\nLinks rewritten for the current address: ' + changed);
}
