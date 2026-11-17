// Module player: Watch (completion from real playback) → Check → rating, with returning-counselor test-out.
(function () {
  'use strict';
  const fmt = s => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
  const UI = {}; // per-module, in-memory state that survives re-renders (e.g. a missed test-out)
  window.TrainPlayer = { render };

  async function loadMeta(id) {
    try { const r = await fetch(`videos/${id}.json`); return r.ok ? await r.json() : null; } catch (e) { return null; }
  }

  function render(host, env) {
    const { h, mod, st } = env;
    const content = (window.TRAIN_CONTENT || {})[mod.id];
    const ui = (UI[mod.id] = UI[mod.id] || {});
    const row = step => st.progress.find(r => r.moduleId === mod.id && r.step === step);
    const done = step => !!row(step) && row(step).status === 'done';
    const mediaStep = mod.steps.includes('watch') ? 'watch' : 'read';
    const items = st.whatsnew.filter(w => w.moduleId === mod.id);
    const wholeChanged = items.some(w => !w.section);
    const sections = items.filter(w => w.section).map(w => w.section);
    const returning = st.path === 'returning';
    const eligible = returning && mod.testOut && !wholeChanged;
    const mediaDone = done(mediaStep), checkDone = done('check');
    const chaptersOnly = returning && checkDone && !mediaDone && sections.length > 0 && Number((row('check') || {}).score) === 100;
    const testFirst = eligible && !mediaDone && !checkDone && !ui.failedTestOut;
    const complete = mod.steps.every(done);

    host.textContent = '';
    host.append(h('button', { class: 'link', onclick: () => env.go('/') }, '← Back to my training'));
    const card = h('div', { class: 'card' });
    host.append(card);
    card.append(h('h2', {}, mod.title), h('div', { class: 'note' }, `About ${mod.minutes} min`));

    if (!content) { card.append(h('p', { class: 'note' }, 'This module is still being built. It will appear here once its video, check questions and practice are ready.')); return; }

    if (items.length) {
      card.append(h('div', { class: 'newbox' }, h('span', { class: 'tag' }, 'New for 2027'),
        items.map(w => h('div', {}, h('b', {}, w.item + ': '), w.description))));
    }
    const stepsBar = h('div', { class: 'steps' }, mod.steps.map(s => h('span', { class: 'st' + (done(s) ? ' done' : '') },
      (done(s) ? '✓ ' : '') + (s === 'check' && testFirst ? 'Show what you know' : s[0].toUpperCase() + s.slice(1)) +
      (done(s) && row(s).testedOut === 'Yes' ? ' (tested out)' : ''))));
    card.append(stepsBar);
    const body = h('div', { class: 'panel' }); card.append(body);

    if (complete) return completePanel(body, env, mod);
    if (testFirst) return checkPanel(body, env, content, { mode: 'testout', sections, wholeChanged, eligible, mediaStep, sectionsList: sections, ui });
    if (!mediaDone) return watchPanel(body, env, mod, { chaptersOnly, sections, mediaStep });
    return checkPanel(body, env, content, { mode: 'normal', sections, wholeChanged, mediaStep, ui });
  }

  // ── Watch ─────────────────────────────────────────────
  function watchPanel(body, env, mod, o) {
    const { h } = env;
    const base = (window.TRAIN_CONTENT[mod.id] || {}).video;
    if (o.mediaStep === 'read') { body.append(h('p', { class: 'note' }, 'The reading cards for this module are still being built.')); return; }
    body.append(h('div', { class: 'note' }, 'Loading video…'));
    loadMeta(mod.id).then(meta => {
      body.textContent = '';
      if (!meta) { body.append(h('p', { class: 'note' }, 'This video isn’t available yet.')); return; }
      const ranges = o.chaptersOnly
        ? meta.scenes.filter(s => o.sections.includes(s.id)).map(s => [s.start, s.end])
        : [[0, meta.duration]];
      if (o.chaptersOnly) body.append(h('p', {}, 'Nice work! You passed the check. Please watch just the new part of this module:'));
      body.append(videoPlayer(env, base, ranges, async () => {
        const res = await env.api('step', { moduleId: mod.id, step: o.mediaStep, testedOut: o.chaptersOnly });
        if (res.ok) env.rerender(); else body.append(h('div', { class: 'err' }, 'Couldn’t save your progress — check your connection and play again.'));
      }, true));
    });
  }

  // Plays `ranges` in order. Completion needs >=95% of every range actually played; no skipping ahead on first viewing.
  function videoPlayer(env, base, ranges, onComplete, enforce) {
    const { h } = env;
    const video = h('video', { playsinline: true, 'webkit-playsinline': true, preload: 'metadata', poster: base + '.poster.jpg',
      disablepictureinpicture: true, controlslist: 'nodownload noremoteplayback nofullscreen', style: 'width:100%;border-radius:10px;background:#000;display:block' },
      h('source', { src: base + '.mp4', type: 'video/mp4' }),
      h('track', { kind: 'captions', src: base + '.vtt', srclang: 'en', label: 'English', default: true }));
    const played = ranges.map(() => new Set());
    let ri = 0, furthest = ranges[0][0], last = null, finished = false;
    const total = r => Math.max(1, r[1] - r[0]);
    const covered = i => [...played[i]].filter(s => s >= Math.floor(ranges[i][0]) && s < ranges[i][1]).length;
    const ok = i => covered(i) >= 0.95 * total(ranges[i]);

    const play = h('button', { class: 'primary', style: 'margin:8px 0 0', 'aria-label': 'Play' }, '▶ Play');
    const bar = h('div', { class: 'vbar', role: 'slider', 'aria-label': 'Video progress', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': '0', tabindex: '0' }, h('i', {}));
    const time = h('span', { class: 'note' }, '');
    const cc = h('button', { class: 'link', 'aria-pressed': 'true' }, 'Captions: on');
    const wrap = h('div', {}, video, bar, h('div', { class: 'vrow' }, time, cc), play);

    const range = () => ranges[ri];
    const update = () => {
      const [a, b] = range(); const t = video.currentTime;
      bar.firstChild.style.width = Math.max(0, Math.min(100, 100 * (t - a) / total(range()))) + '%';
      bar.setAttribute('aria-valuenow', String(Math.round(100 * (t - a) / total(range()))));
      time.textContent = `${fmt(Math.max(0, t - a))} / ${fmt(b - a)}` + (ranges.length > 1 ? ` · part ${ri + 1} of ${ranges.length}` : '');
    };
    video.addEventListener('loadedmetadata', () => { video.currentTime = range()[0]; update(); });
    video.addEventListener('timeupdate', () => {
      const t = video.currentTime;
      if (!video.paused && !video.seeking && last !== null && t >= last && t - last <= 2.5 * Math.max(1, video.playbackRate)) {
        for (let s = Math.floor(last); s <= Math.floor(t); s++) played[ri].add(s);
        furthest = Math.max(furthest, t);
      }
      last = t;
      if (t >= range()[1] - 0.15 || video.ended) {
        video.pause();
        if (ok(ri)) {
          if (ri + 1 < ranges.length) { ri++; furthest = range()[0]; last = null; video.currentTime = range()[0]; }
          else if (!finished) { finished = true; onComplete(); }
        } else if (!finished) { video.currentTime = range()[0]; last = null; }
      }
      update();
    });
    video.addEventListener('seeking', () => {
      const [a, b] = range(), t = video.currentTime;
      if (t < a) video.currentTime = a;
      else if (t > b) video.currentTime = b - 0.2;
      else if (enforce && t > furthest + 0.6) video.currentTime = furthest; // no skipping ahead
      last = video.currentTime;
    });
    const sync = () => { play.textContent = video.paused ? '▶ Play' : '⏸ Pause'; play.setAttribute('aria-label', video.paused ? 'Play' : 'Pause'); };
    video.addEventListener('play', sync); video.addEventListener('pause', sync);
    const toggle = () => { video.paused ? video.play() : video.pause(); };
    play.addEventListener('click', toggle); video.addEventListener('click', toggle);
    const seekTo = clientX => { const r = bar.getBoundingClientRect(); const f = Math.max(0, Math.min(1, (clientX - r.left) / r.width)); video.currentTime = range()[0] + f * total(range()); };
    bar.addEventListener('click', e => seekTo(e.clientX));
    bar.addEventListener('keydown', e => { if (e.key === 'ArrowLeft') video.currentTime = Math.max(range()[0], video.currentTime - 5); if (e.key === 'ArrowRight') video.currentTime += 5; });
    cc.addEventListener('click', () => {
      const tr = video.textTracks[0]; if (!tr) return;
      const on = tr.mode !== 'showing'; tr.mode = on ? 'showing' : 'hidden';
      cc.textContent = 'Captions: ' + (on ? 'on' : 'off'); cc.setAttribute('aria-pressed', String(on));
    });
    wrap.__test = { video, played };
    return wrap;
  }

  // ── Check ─────────────────────────────────────────────
  function checkPanel(body, env, content, o) {
    const { h, mod } = env;
    const qs = content.checks; let qi = 0, firstTry = 0, answers = 0, wrongThisQ = false, missed = 0;
    const testout = o.mode === 'testout';
    body.append(h('p', { class: 'note' }, testout
      ? 'You’ve done this before — get every question right on the first try and you can skip the video. Miss one and we’ll watch together first.'
      : 'A few quick questions. Wrong answers are okay — you can try again.'));
    const q = h('div', {}); body.append(q);

    function show() {
      q.textContent = ''; wrongThisQ = false;
      const item = qs[qi], tagged = item.section && (o.sections.includes(item.section));
      q.append(h('div', { class: 'note' }, `Question ${qi + 1} of ${qs.length}`),
        h('h3', { style: 'margin:4px 0 8px' }, item.text, tagged ? h('span', { class: 'tag', style: 'margin-left:8px' }, 'New for 2027') : null));
      const fb = h('div', { role: 'status', 'aria-live': 'polite', style: 'margin-top:8px' });
      const opts = item.options.map(op => {
        const b = h('button', { class: 'opt', onclick: () => pick(op, b, fb, opts, item) }, h('b', {}, op.k + '  '), op.t);
        return b;
      });
      q.append(h('div', {}, opts), fb);
    }

    async function pick(op, btn, fb, opts, item) {
      answers++;
      const right = op.k === item.correct;
      env.api('answer', { moduleId: mod.id, qid: item.id, choice: op.k, correct: right });
      fb.textContent = '';
      if (right) {
        if (!wrongThisQ) firstTry++;
        btn.classList.add('right'); opts.forEach(b => (b.disabled = true));
        fb.append(h('div', { class: 'good' }, '✓ ' + item.why),
          h('button', { class: 'primary', onclick: next }, qi + 1 < qs.length ? 'Next question' : 'Finish'));
      } else {
        wrongThisQ = true; btn.classList.add('wrong'); btn.disabled = true;
        if (testout) {
          missed++; opts.forEach(b => (b.disabled = true));
          opts.find(b => b.textContent.trim().startsWith(item.correct)).classList.add('right');
          fb.append(h('div', { class: 'bad' }, (op.note || 'Not quite.') + ' The right answer: ' + item.why),
            h('button', { class: 'primary', onclick: next }, qi + 1 < qs.length ? 'Next question' : 'Finish'));
        } else {
          fb.append(h('div', { class: 'bad' }, 'Not quite — ' + (op.note || 'try another answer.')));
        }
      }
    }

    async function next() {
      if (++qi < qs.length) return show();
      q.textContent = '';
      const score = Math.round(100 * firstTry / qs.length);
      if (testout && missed > 0) {
        o.ui.failedTestOut = true;
        q.append(h('p', {}, `You got ${firstTry} of ${qs.length} on the first try. Let’s watch the video first, then try the questions again.`),
          h('button', { class: 'primary', onclick: env.rerender }, 'Watch the video'));
        return;
      }
      const res = await env.api('step', { moduleId: mod.id, step: 'check', score, attempts: answers });
      if (!res.ok) { q.append(h('div', { class: 'err' }, 'Couldn’t save your progress — check your connection and tap Finish again.'), h('button', { class: 'primary', onclick: next }, 'Try saving again')); qi = qs.length - 1; return; }
      if (testout && !o.sections.length) await env.api('step', { moduleId: mod.id, step: o.mediaStep, testedOut: true });
      env.rerender();
    }
    show();
  }

  // ── Done + rating ─────────────────────────────────────
  function completePanel(body, env, mod) {
    const { h } = env;
    body.append(h('div', { class: 'good' }, '🎉 Module complete!'));
    const key = 'dkTrain_rated_' + mod.id;
    if (!localStorage.getItem(key)) {
      const box = h('div', { class: 'wn' }, h('b', {}, 'Was this module clear?'));
      const thanks = () => { localStorage.setItem(key, '1'); box.textContent = 'Thanks for the feedback!'; };
      const send = (clear, comment) => { env.api('rate', { moduleId: mod.id, clear, comment: comment || '' }); thanks(); };
      box.append(h('div', { class: 'seg' },
        h('button', { onclick: () => send('Yes') }, 'Yes'),
        h('button', { onclick: () => {
          box.textContent = '';
          const ta = h('textarea', { maxlength: '500', rows: '3', style: 'width:100%;font:inherit;padding:8px;border:2px solid var(--border);border-radius:8px', 'aria-label': 'What was confusing?', placeholder: 'What was confusing? (optional)' });
          box.append(h('b', {}, 'What was confusing?'), ta, h('button', { class: 'primary', onclick: () => send('No', ta.value) }, 'Send'));
        } }, 'Not really')));
      body.append(box);
    }
    const hasVideo = mod.steps.includes('watch') && (window.TRAIN_CONTENT[mod.id] || {}).video;
    if (hasVideo) {
      const again = h('div', {});
      body.append(h('button', { class: 'link', onclick: async () => {
        const meta = await loadMeta(mod.id);
        if (meta) { again.textContent = ''; again.append(videoPlayer(env, window.TRAIN_CONTENT[mod.id].video, [[0, meta.duration]], () => {}, false)); }
      } }, done_(env, mod) ? 'Watch anyway' : 'Watch the video again'), again);
    }
    body.append(h('button', { class: 'primary', onclick: () => env.go('/') }, 'Back to my training'));
  }
  const done_ = (env, mod) => { const r = env.st.progress.find(x => x.moduleId === mod.id && x.step === 'watch'); return !!r && r.testedOut === 'Yes'; };
})();
