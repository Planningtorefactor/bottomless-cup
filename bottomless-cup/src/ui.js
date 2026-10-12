// Bottomless Cup - browser UI. Depends on Engine (src/engine.js).
(function () {
  const E = Engine;
  const SAVE_KEY = 'bottomless-cup-save-v1';
  const $ = id => document.getElementById(id);
  const fmt = E.fmt;

  // ---------- Save / load ----------
  function load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return Object.assign(E.newGame(), JSON.parse(raw));
    } catch (e) { /* storage blocked or corrupt: start fresh */ }
    return null;
  }
  function save() {
    S.lastSave = Date.now();
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(S)); } catch (e) { /* storage unavailable */ }
  }
  const exportSave = () => btoa(unescape(encodeURIComponent(JSON.stringify(S))));
  function importSave(str) {
    const data = JSON.parse(decodeURIComponent(escape(atob(str.trim()))));
    if (typeof data.cups !== 'number' || !data.owned) throw new Error('bad');
    S = Object.assign(E.newGame(), data);
    save();
  }

  const hot = window.claude && window.claude.hot;
  let S = (hot && hot.data && hot.data.state) || load() || E.newGame();
  if (hot && hot.snapshot) hot.snapshot(() => ({ state: S }));

  // ---------- Toast ----------
  let toastTimer;
  function toast(msg) {
    const t = $('toast'); t.textContent = msg; t.hidden = false;
    clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 3200);
  }

  const away = E.applyOffline(S);
  if (away.secs > 0) {
    const h = Math.floor(away.secs / 3600), m = Math.floor(away.secs % 3600 / 60);
    setTimeout(() => toast(`Welcome back. In ${h}h ${m}m away your café brewed ${fmt(away.cups)} cups.`), 400);
  }

  // ---------- Clicking ----------
  const brewBtn = $('brew');
  brewBtn.addEventListener('click', ev => {
    const got = E.click(S);
    const p = document.createElement('div');
    p.className = 'pop'; p.textContent = '+' + fmt(got);
    const rect = brewBtn.getBoundingClientRect();
    const x = ev.clientX ? ev.clientX - rect.left : rect.width / 2;
    const y = ev.clientY ? ev.clientY - rect.top : rect.height / 3;
    p.style.left = (x - 12) + 'px'; p.style.top = (y - 20) + 'px';
    brewBtn.appendChild(p); setTimeout(() => p.remove(), 900);
    pulse = 1;
  });
  let pulse = 0;

  // ---------- Tabs ----------
  let tab = 'build', buyMode = 1, confirmCafe = false, confirmGlobal = false, sig = '';
  // Testing toggle: buildings, upgrades and Legacy perks cost nothing (you still buy each one).
  // Not saved, so it is off after a reload.
  let freeBuys = false;
  const freeBtn = () => `<button class="ghost" data-act="free" aria-pressed="${freeBuys}">Free buying: ${freeBuys ? 'ON' : 'off'}</button>`;
  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    tab = b.dataset.tab; confirmCafe = confirmGlobal = false;
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t === b));
    render();
  });

  const STAGES = [
    { k: 'farm', title: 'Farms', unit: 'green beans/s', c: 'var(--green)' },
    { k: 'roast', title: 'Roasters', unit: 'roasted beans/s', c: 'var(--roast)' },
    { k: 'brew', title: 'Brewers', unit: 'beans brewed/s', c: 'var(--crema)' },
  ];

  function buyCount(id) {
    if (buyMode === 'max') return Math.max(1, E.maxAffordable(S, id));
    return buyMode;
  }

  function render() {
    const v = $('view');
    if (tab === 'build') {
      const m = E.mods(S);
      v.innerHTML = `<div class="toolbar"><p>Buy for your <b>bottleneck</b> stage first.</p>${freeBtn()}
        <div class="seg" role="group" aria-label="Buy amount">
          ${[1, 10, 'max'].map(n => `<button data-mode="${n}" aria-pressed="${buyMode === n}">${n === 'max' ? 'Max' : 'x' + n}</button>`).join('')}
        </div></div>` +
        STAGES.map(st => `<div class="group" style="--c:${st.c}"><h4>${st.title}</h4><div class="list">` +
          E.BUILDINGS.filter(b => b.stage === st.k).map(b => `
            <button class="item" data-buy="${b.id}">
              <span class="t">${b.name}<span class="own" data-own></span></span>
              <span class="p"><span data-cost></span><small data-cnt></small></span>
              <span class="d">${fmt(b.rate)} ${st.unit} each${b.yield ? ` · ${b.perk}` : ''}</span>
            </button>`).join('') + `</div></div>`).join('');
    } else if (tab === 'upg') {
      const list = E.UPGRADES.filter(u => E.upgradeAvailable(S, u, freeBuys)).sort((a, b) => a.cost - b.cost);
      sig = list.map(u => u.id).join();
      v.innerHTML = `<div class="toolbar"><p>One-time purchases. New ones appear as you grow.</p>${freeBtn()}</div>` +
        (list.length ? `<div class="list">` + list.map(u => `
          <button class="item" data-upg="${u.id}">
            <span class="t">${u.name}</span>
            <span class="p" data-cost>${fmt(u.cost)}</span>
            <span class="d">${u.desc}</span>
          </button>`).join('') + `</div>` : `<p class="empty">Nothing new yet. Keep brewing.</p>`);
    } else if (tab === 'beans') {
      v.innerHTML = `<div class="toolbar"><p>Equip one variety. Swap any time. New beans unlock from Reputation Stars earned.</p></div><div class="list">` +
        E.BEANS.map(b => {
          const open = S.beansUnlocked[b.id];
          return `<button class="item${S.bean === b.id ? ' sel' : ''}" data-bean="${b.id}" ${open ? '' : 'disabled'}>
            <span class="t">${open ? b.name : 'Locked variety'}</span>
            <span class="p">${S.bean === b.id ? 'Equipped' : open ? 'Equip' : `<small>needs</small>${b.stars} stars`}</span>
            <span class="d">${open ? b.desc : 'Earn more Reputation Stars to unlock.'}</span></button>`;
        }).join('') + `</div>`;
    } else if (tab === 'cafe') {
      v.innerHTML = `<div class="toolbar"><p>Prestige: sell this café and open a new one.</p></div>
        <div class="panel">
          <h3>Open a New Café</h3>
          <p>Resets cups, buildings, stockpiles and upgrades. Keeps Stars, bean unlocks and Legacy perks. Each Star adds <b data-perstar></b> to all production.</p>
          <div class="stat num" data-pending>0<small>Stars on reset</small></div>
          <p data-need></p>
          <div class="row"><button class="act" data-act="cafe"></button><button class="ghost" data-act="cancel" hidden>Keep brewing</button></div>
        </div>
        <div class="panel"><p>Stars held <b class="num">${S.stars}</b> · earned this ascension <b class="num">${S.starsEarned}</b> · cafés opened <b class="num">${S.prestiges}</b></p></div>`;
    } else if (tab === 'global') {
      v.innerHTML = `<div class="toolbar"><p>Ascension: trade every Star for Origin Tokens.</p>${freeBtn()}</div>
        <div class="panel">
          <h3>Go Global</h3>
          <p>Resets your run and all Reputation Stars${S.legacy.vault ? '' : ' and bean unlocks'}. Origin Tokens buy permanent Legacy perks below.</p>
          <div class="stat num" data-pending>0<small>Tokens on reset</small></div>
          <p data-need></p>
          <div class="row"><button class="act" data-act="global"></button><button class="ghost" data-act="cancel" hidden>Not yet</button></div>
        </div>
        <div class="group" style="--c:var(--ink)"><h4>Legacy perks · <span class="num" data-tokens></span> tokens</h4><div class="list">` +
        E.LEGACY.map(p => `<button class="item" data-legacy="${p.id}">
          <span class="t">${p.name}<span class="own" data-own></span></span>
          <span class="p" data-cost></span>
          <span class="d">${p.desc}</span></button>`).join('') + `</div></div>`;
    } else if (tab === 'save') {
      v.innerHTML = `<div class="toolbar"><p>Progress saves to this browser every 10 seconds.</p></div>
        <div class="panel"><h3>Export or import</h3>
          <p>Copy this code to move your save to another browser.</p>
          <textarea id="savebox" aria-label="Save code" spellcheck="false"></textarea>
          <div class="row"><button class="act" data-act="export">Show my save code</button><button class="ghost" data-act="copy">Copy</button><button class="ghost" data-act="import">Load code from box</button></div>
        </div>
        <div class="panel"><h3>Start over</h3><p>Erases everything, including Stars and Legacy perks.</p>
          <div class="row"><button class="ghost" data-act="wipe">Erase save</button></div></div>`;
    }
    refresh();
  }

  $('view').addEventListener('click', e => {
    const t = e.target.closest('button'); if (!t) return;
    if (t.dataset.mode) { buyMode = t.dataset.mode === 'max' ? 'max' : +t.dataset.mode; render(); return; }
    if (t.dataset.buy) { E.buy(S, t.dataset.buy, buyCount(t.dataset.buy), freeBuys); refresh(); return; }
    if (t.dataset.upg) { if (E.buyUpgrade(S, t.dataset.upg, freeBuys)) { toast('Upgrade bought.'); render(); } return; }
    if (t.dataset.bean) { E.setBean(S, t.dataset.bean); render(); return; }
    if (t.dataset.legacy) { if (E.buyLegacy(S, t.dataset.legacy, freeBuys)) { toast('Legacy perk bought.'); save(); render(); } return; }
    const a = t.dataset.act;
    if (a === 'free') { freeBuys = !freeBuys; toast(freeBuys ? 'Free buying on (testing).' : 'Free buying off.'); render(); return; }
    if (a === 'cancel') { confirmCafe = confirmGlobal = false; refresh(); }
    if (a === 'cafe') {
      if (!confirmCafe) { confirmCafe = true; refresh(); return; }
      const g = E.prestige(S); confirmCafe = false; save();
      toast(`New café open. +${g} Reputation Stars.`); render();
    }
    if (a === 'global') {
      if (!confirmGlobal) { confirmGlobal = true; refresh(); return; }
      const g = E.ascend(S); confirmGlobal = false; save();
      toast(`You went global. +${g} Origin Tokens.`); render();
    }
    if (a === 'export') { $('savebox').value = exportSave(); }
    if (a === 'copy') {
      const box = $('savebox'); if (!box.value) box.value = exportSave();
      navigator.clipboard.writeText(box.value).then(() => toast('Save code copied.'), () => { box.select(); toast('Press Ctrl+C to copy the selected code.'); });
    }
    if (a === 'import') {
      try { importSave($('savebox').value); toast('Save loaded.'); render(); }
      catch (err) { toast('That code could not be read. Paste the full save code and try again.'); }
    }
    if (a === 'wipe') {
      if (t.dataset.armed) { S = E.newGame(); save(); toast('Save erased.'); render(); }
      else { t.dataset.armed = '1'; t.textContent = 'Click again to erase everything'; t.classList.add('act', 'danger'); }
    }
  });

  // ---------- Per-frame refresh ----------
  let R = E.rates(S);
  function refresh() {
    R = E.rates(S);
    $('cups').textContent = fmt(S.cups);
    $('cps').textContent = fmt(R.cupsPerSec);
    $('runcups').textContent = fmt(S.runCups);
    $('clickpow').textContent = fmt(R.clickPower);
    $('m-stars').textContent = fmt(S.stars);
    $('m-tokens').textContent = fmt(S.tokens);
    $('m-bean').textContent = E.BEANS.find(b => b.id === S.bean).name;
    $('yield').textContent = R.yield.toFixed(2) + ' cups per roasted bean';

    // chain
    const max = Math.max(R.farm, R.roast, R.brew, 1e-9);
    const stock = { farm: S.green, roast: S.roasted };
    document.querySelectorAll('.stage').forEach(el => {
      const k = el.dataset.k;
      el.querySelector('.bar i').style.width = (R[k] / max * 100) + '%';
      el.querySelector('.cap').textContent = fmt(R[k]) + '/s';
      const sb = el.querySelector('.stock b'); if (sb) sb.textContent = fmt(stock[k]);
      const lim = R.bottleneck === k;
      el.classList.toggle('limit', lim);
      el.querySelector('.flag').innerHTML = lim ? '<span class="badge">Bottleneck</span>' : '';
    });

    // cup fill: shows progress toward the next 10x of cups this run, plus a click pulse
    const lg = S.runCups > 0 ? Math.log10(S.runCups) : 0;
    const frac = Math.min(1, (lg % 1) * 0.85 + pulse * 0.08);
    const y = 168 - frac * 112;
    $('fill').setAttribute('y', y); $('crema').setAttribute('y', y - 4);

    const v = $('view');
    if (tab === 'build') {
      v.querySelectorAll('[data-buy]').forEach(b => {
        const id = b.dataset.buy, n = buyCount(id), c = E.costOf(S, id, n);
        b.querySelector('[data-own]').textContent = S.owned[id];
        b.querySelector('[data-cost]').textContent = fmt(c);
        b.querySelector('[data-cnt]').textContent = 'buy ' + n;
        b.disabled = !freeBuys && c > S.cups;
      });
    } else if (tab === 'upg') {
      const now = E.UPGRADES.filter(u => E.upgradeAvailable(S, u, freeBuys)).sort((a, b) => a.cost - b.cost).map(u => u.id).join();
      if (now !== sig) return render();
      v.querySelectorAll('[data-upg]').forEach(b => { b.disabled = !freeBuys && E.UPGRADES.find(u => u.id === b.dataset.upg).cost > S.cups; });
    } else if (tab === 'cafe') {
      const p = E.pendingStars(S);
      const perStar = 2 + (S.legacy.starpower || 0);
      v.querySelector('[data-perstar]').textContent = perStar + '%';
      v.querySelector('[data-pending]').firstChild.textContent = '+' + fmt(p);
      v.querySelector('[data-need]').textContent = S.runCups < E.PRESTIGE_MIN
        ? `Brew ${fmt(E.PRESTIGE_MIN - S.runCups)} more cups this run to unlock.`
        : `Production after reset: x${(1 + perStar / 100 * (S.stars + p)).toFixed(2)} from Stars (now x${(1 + perStar / 100 * S.stars).toFixed(2)}).`;
      const btn = v.querySelector('[data-act="cafe"]');
      btn.disabled = p <= 0;
      btn.textContent = confirmCafe ? `Confirm: reset for ${fmt(p)} Stars` : 'Open a New Café';
      btn.classList.toggle('danger', confirmCafe);
      v.querySelector('[data-act="cancel"]').hidden = !confirmCafe;
    } else if (tab === 'global') {
      const p = E.pendingTokens(S);
      v.querySelector('[data-pending]').firstChild.textContent = '+' + fmt(p);
      v.querySelector('[data-need]').textContent = S.stars < E.ASCEND_MIN
        ? `Hold ${fmt(E.ASCEND_MIN)} Reputation Stars to unlock (you have ${fmt(S.stars)}).` : 'Ready when you are.';
      const btn = v.querySelector('[data-act="global"]');
      btn.disabled = p <= 0;
      btn.textContent = confirmGlobal ? `Confirm: reset for ${fmt(p)} tokens` : 'Go Global';
      btn.classList.toggle('danger', confirmGlobal);
      v.querySelector('[data-act="cancel"]').hidden = !confirmGlobal;
      v.querySelector('[data-tokens]').textContent = S.tokens;
      v.querySelectorAll('[data-legacy]').forEach(b => {
        const p2 = E.LEGACY.find(x => x.id === b.dataset.legacy), lvl = S.legacy[p2.id] || 0;
        b.querySelector('[data-own]').textContent = p2.max > 1 ? `${lvl}/${p2.max}` : (lvl ? 'owned' : '');
        b.querySelector('[data-cost]').textContent = lvl >= p2.max ? 'Maxed' : p2.cost + ' tok';
        b.disabled = lvl >= p2.max || (!freeBuys && S.tokens < p2.cost);
      });
    }
    // dot on Upgrades tab when something is affordable
    $('upgdot').hidden = !E.UPGRADES.some(u => E.upgradeAvailable(S, u, freeBuys) && (freeBuys || u.cost <= S.cups));
  }

  // ---------- Game loop ----------
  let last = performance.now(), acc = 0, saveAcc = 0;
  function frame(now) {
    const dt = Math.min(1, (now - last) / 1000); last = now;
    E.tick(S, dt);
    pulse = Math.max(0, pulse - dt * 3);
    acc += dt; saveAcc += dt;
    if (acc > 0.1) { acc = 0; refresh(); }
    if (saveAcc > 10) { saveAcc = 0; save(); }
    requestAnimationFrame(frame);
  }
  // catch up time the tab spent hidden (browsers pause requestAnimationFrame)
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) save();
    else { const got = E.applyOffline(S); if (got.cups > 0) toast(`While the tab was hidden you brewed ${fmt(got.cups)} cups.`); last = performance.now(); }
  });
  window.addEventListener('beforeunload', save);

  // ---------- Dev helpers (open DevTools console: Ctrl+Shift+I) ----------
  // BC.give(1e6) adds cups, BC.skip(3600) fast-forwards an hour, BC.state() shows the save.
  // BC.free() toggles free buying (same as the button on the Build, Upgrades and Go Global tabs).
  window.BC = {
    state: () => S,
    give: n => { S.cups += n; S.runCups += n; S.lifetimeCups += n; render(); },
    skip: secs => { for (let i = 0; i < secs; i++) E.tick(S, 1); render(); },
    stars: n => { S.stars += n; S.starsEarned += n; E.BEANS.forEach(b => { if (S.starsEarned >= b.stars) S.beansUnlocked[b.id] = true; }); render(); },
    tokens: n => { S.tokens += n; render(); },
    free: (on = !freeBuys) => { freeBuys = on; render(); return freeBuys; },
  };

  render();
  requestAnimationFrame(frame);
})();
