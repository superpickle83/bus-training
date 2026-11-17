// On-screen effects injected into the page being recorded: tap ripples, highlight rings, pills and full-screen cards.
module.exports = `
(() => {
  const css = \`
  .fx-ring{position:fixed;z-index:99990;border:3px solid #F5A623;border-radius:12px;pointer-events:none;box-shadow:0 0 0 4px rgba(245,166,35,.28);animation:fxp 1s ease-in-out infinite}
  @keyframes fxp{0%,100%{box-shadow:0 0 0 3px rgba(245,166,35,.25)}50%{box-shadow:0 0 0 9px rgba(245,166,35,.10)}}
  .fx-pill{position:fixed;z-index:99991;left:50%;transform:translateX(-50%);background:#462770;color:#fff;font:700 15px/1.25 Inter,system-ui,sans-serif;padding:8px 14px;border-radius:18px;border:2px solid #F5A623;box-shadow:0 4px 14px rgba(0,0,0,.3);pointer-events:none;max-width:88%;text-align:center;animation:fxin .25s ease-out}
  .fx-pill b{background:#F5A623;color:#462770;border-radius:8px;padding:1px 7px;margin-right:6px;font-size:12px}
  @keyframes fxin{from{opacity:0;transform:translateX(-50%) translateY(8px)}to{opacity:1;transform:translateX(-50%)}}
  .fx-tap{position:fixed;z-index:99992;width:46px;height:46px;margin:-23px 0 0 -23px;border-radius:50%;background:rgba(245,166,35,.55);border:3px solid #F5A623;pointer-events:none;animation:fxt .55s ease-out forwards}
  @keyframes fxt{from{transform:scale(.4);opacity:1}to{transform:scale(1.5);opacity:0}}
  .fx-card{position:fixed;inset:0;z-index:99999;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:28px;
    background:radial-gradient(circle at 50% 30%,#5C3690,#1E1040 75%);color:#fff;font-family:Inter,system-ui,sans-serif;opacity:0;transition:opacity .5s}
  .fx-card.on{opacity:1}
  .fx-card .big{font-size:84px;line-height:1}
  .fx-card h1{color:#F5A623;font-size:34px;margin:14px 0 8px;line-height:1.1}
  .fx-card p{font-size:17px;opacity:.9;margin:6px 0;max-width:300px;line-height:1.35}
  .fx-card .tag{margin-top:18px;background:#F5A623;color:#462770;font-weight:800;border-radius:16px;padding:6px 16px;font-size:15px}
  .fx-card .row{font-size:34px;letter-spacing:10px;margin-top:20px}
  \`;
  const mount = () => { const s = document.createElement('style'); s.textContent = css; document.head.appendChild(s); };
  document.readyState === 'loading' ? document.addEventListener('DOMContentLoaded', mount) : mount();
  const rect = t => typeof t === 'string' ? document.querySelector(t).getBoundingClientRect() : t;
  window.__fx = {
    ring(t, pad = 4) { const r = rect(t); const d = document.createElement('div'); d.className = 'fx-ring';
      Object.assign(d.style, { left: r.left - pad + 'px', top: r.top - pad + 'px', width: r.width + pad * 2 + 'px', height: r.height + pad * 2 + 'px' }); document.body.appendChild(d); },
    pill(html, top) { const d = document.createElement('div'); d.className = 'fx-pill'; d.style.top = top + 'px'; d.innerHTML = html; document.body.appendChild(d); },
    tap(x, y) { const d = document.createElement('div'); d.className = 'fx-tap'; d.style.left = x + 'px'; d.style.top = y + 'px'; document.body.appendChild(d); setTimeout(() => d.remove(), 700); },
    clear() { document.querySelectorAll('.fx-ring,.fx-pill').forEach(e => e.remove()); },
    card(html) { let c = document.querySelector('.fx-card'); if (!c) { c = document.createElement('div'); c.className = 'fx-card'; document.body.appendChild(c); }
      c.innerHTML = html; requestAnimationFrame(() => requestAnimationFrame(() => c.classList.add('on'))); },
    hideCard() { const c = document.querySelector('.fx-card'); if (c) { c.classList.remove('on'); setTimeout(() => c.remove(), 600); } },
  };
})();
`;
