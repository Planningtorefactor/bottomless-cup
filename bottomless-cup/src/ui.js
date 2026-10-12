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
  // The cup label jumps to the New Cafe tab (most useful once you can prestige).
  $('goal').addEventListener('click', () => document.querySelector('.tab[data-tab="cafe"]').click());

  // ---------- Tabs ----------
  let tab = 'build', buyMode = 1, confirmCafe = false, confirmGlobal = false, sig = '';
  // Testing toggle: buildings, upgrades and Legacy perks cost nothing (you still buy each one).
  // Not saved, so it is off after a reload.
  let freeBuys = false;
  let bars = [];   // building rows' cycle bars, filled in by render()
  let wasReady = S.runCups >= E.prestigeCost(S);   // celebrate only when this flips during play
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

  // Which tiers are open; render() rebuilds the Buildings/Expansion tabs when this changes.
  const unlockSig = () => E.BUILDINGS.filter(b => E.isUnlocked(S, b.id)).map(b => b.id).join();
  // Dashed row under a stage's buildings pointing at its next locked tier.
  function nextTier(stage) {
    const b = E.BUILDINGS.find(x => x.stage === stage && !E.isUnlocked(S, x.id));
    return b ? `<button class="next" data-next="${b.id}" data-goto="expand">
      <span>Next: <b>${b.name}</b> · unlock in Expansion</span><small data-next-txt></small></button>` : '';
  }

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
          E.BUILDINGS.filter(b => b.stage === st.k && E.isUnlocked(S, b.id)).map(b => `
            <div class="bld" data-id="${b.id}">
              <button class="run" data-run="${b.id}" title="${b.perk || ''}">
                <span class="t">${b.name}<span class="own" data-own></span></span>
                <span class="cyc"><i></i></span>
                <span class="d"><span data-batch></span><small data-state></small></span>
              </button>
              <button class="buy" data-buy="${b.id}"><span data-cost></span><small data-cnt></small></button>
              <button class="mgr" data-mgr="${b.id}"></button>
            </div>`).join('') + nextTier(st.k) + `</div></div>`).join('');
      sig = unlockSig();
      bars = [...v.querySelectorAll('.bld')].map(el => ({ id: el.dataset.id, i: el.querySelector('.cyc i') }));
    } else if (tab === 'expand') {
      v.innerHTML = `<div class="toolbar"><p>Unlock bigger buildings. Each needs ${E.UNLOCK_NEED} of the tier below. Unlocks reset when you open a new café.</p>${freeBtn()}</div>` +
        STAGES.map(st => {
          const b = E.BUILDINGS.find(x => x.stage === st.k && !E.isUnlocked(S, x.id));
          return `<div class="group" style="--c:${st.c}"><h4>${st.title}</h4>` + (b ? `
            <div class="panel unl" data-unl-row="${b.id}">
              <div class="row" style="justify-content:space-between"><h3>${b.name}</h3><span class="num">tier ${b.tier}</span></div>
              <p>${fmt(b.rate)} ${st.unit} each, every ${b.cycle}s.${b.perk ? ' ' + b.perk : ''}</p>
              <div class="need"><span data-need-txt></span><span class="cyc"><i data-need-bar></i></span></div>
              <button class="act" data-unl="${b.id}"></button>
            </div>` : `<p class="empty">Every ${st.title.toLowerCase().slice(0, -1)} tier is unlocked.</p>`) + `</div>`;
        }).join('');
      sig = unlockSig();
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
          <p>Costs <b class="num">${fmt(E.prestigeCost(S))}</b> cups brewed this run. Each new café costs twice as much as the last, until you Go Global.</p>
          <p>Resets cups, buildings, building unlocks, managers, stockpiles and upgrades. Keeps Stars, bean unlocks and Legacy perks. Each Star adds <b data-perstar></b> to all production.</p>
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
    if (t.dataset.unl) {
      const b = E.BUILDINGS.find(x => x.id === t.dataset.unl);
      if (E.unlock(S, b.id, freeBuys)) { toast(`${b.name} unlocked. Find it in Buildings.`); render(); }
      return;
    }
    if (t.dataset.goto) { document.querySelector(`.tab[data-tab="${t.dataset.goto}"]`).click(); return; }
    if (t.dataset.run) { if (E.runBuilding(S, t.dataset.run)) refresh(); return; }
    if (t.dataset.buy) {
      if (E.buy(S, t.dataset.buy, buyCount(t.dataset.buy), freeBuys)) {
        const row = t.closest('.bld'); replay(row, 'bump'); replay(row.querySelector('.own'), 'tick');
      }
      refresh(); return;
    }
    if (t.dataset.mgr) {
      const b = E.BUILDINGS.find(x => x.id === t.dataset.mgr);
      if (E.buyManager(S, b.id, freeBuys)) { replay(t.closest('.bld'), 'hired'); burst(t); toast(`Manager hired: ${b.name} now runs on its own.`); }
      refresh(); return;
    }
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

    // cup fill: percent of the way to Open a New Cafe (prestigeCost cups this run).
    // 50% of the cups means half full. The click pulse can't fill it to the rim before you're ready.
    const goalCups = E.prestigeCost(S), ready = S.runCups >= goalCups;
    const pct = Math.min(1, S.runCups / goalCups);
    const frac = ready ? 1 : Math.min(0.98, pct + pulse * 0.04);
    const y = 168 - frac * 112;
    $('fill').setAttribute('y', y); $('crema').setAttribute('y', y - 4);
    brewBtn.classList.toggle('ready', ready);
    const goal = $('goal');
    goal.classList.toggle('ready', ready);
    goal.textContent = ready ? `Ready to open a new café · +${fmt(E.pendingStars(S))} Stars →`
      : `New café: ${Math.floor(pct * 100)}% · ${fmt(S.runCups)} / ${fmt(goalCups)} cups this run`;
    if (ready && !wasReady) { burst(brewBtn); toast('Your cup is full: you can Open a New Café for Reputation Stars.'); }
    wasReady = ready;

    const v = $('view');
    if ((tab === 'build' || tab === 'expand') && unlockSig() !== sig) return render();
    if (tab === 'build') {
      const m = E.mods(S);
      v.querySelectorAll('[data-next]').forEach(el => {
        const b = E.BUILDINGS.find(x => x.id === el.dataset.next);
        el.querySelector('[data-next-txt]').textContent = `${Math.min(S.owned[b.prev], E.UNLOCK_NEED)}/${E.UNLOCK_NEED} ${E.BUILDINGS.find(x => x.id === b.prev).name}`;
        el.classList.toggle('ready', E.canUnlock(S, b.id, freeBuys));
      });
      v.querySelectorAll('.bld').forEach(row => {
        const id = row.dataset.id, b = E.BUILDINGS.find(x => x.id === id);
        const n = buyCount(id), c = E.costOf(S, id, n), ct = E.cycleTime(S, id, m);
        const owned = S.owned[id], managed = !!S.managers[id], active = managed || S.running[id];
        const starved = active && b.stage !== 'farm' && owned > 0 && (S.fill[id] ?? 1) < 0.75;
        const fast = managed && ct < 0.25;
        row.querySelector('[data-own]').textContent = owned;
        let out = E.batch(S, id, m), unit = b.stage === 'farm' ? 'green beans' : 'roasted beans';
        if (b.stage === 'brew') { out *= b.yield * m.yield; unit = 'cups'; }
        row.querySelector('[data-batch]').textContent = owned ? `+${fmt(out)} ${unit} every ${secs(ct)}` : `${secs(ct)} cycle`;
        row.querySelector('[data-state]').textContent = !owned ? 'Buy one to start' : starved ? 'Waiting for beans'
          : fast ? 'Nonstop' : managed ? 'Managed' : active ? 'Running' : 'Click to run';
        row.classList.toggle('none', !owned);
        row.classList.toggle('managed', managed);
        row.classList.toggle('idle', owned > 0 && !active);
        row.classList.toggle('starved', starved);
        row.classList.toggle('fast', fast);
        row.querySelector('[data-run]').disabled = !owned;
        const buyBtn = row.querySelector('[data-buy]');
        buyBtn.querySelector('[data-cost]').textContent = fmt(c);
        buyBtn.querySelector('[data-cnt]').textContent = 'buy ' + n;
        buyBtn.disabled = !freeBuys && c > S.cups;
        const mgr = row.querySelector('[data-mgr]');
        mgr.textContent = managed ? 'Manager hired' : `Hire manager ${fmt(b.manager)}`;
        mgr.disabled = managed || (!freeBuys && b.manager > S.cups);
      });
    } else if (tab === 'expand') {
      v.querySelectorAll('[data-unl]').forEach(btn => {
        const b = E.BUILDINGS.find(x => x.id === btn.dataset.unl), have = S.owned[b.prev];
        const prevName = E.BUILDINGS.find(x => x.id === b.prev).name, row = btn.closest('.unl');
        row.querySelector('[data-need-txt]').textContent = `Own ${E.UNLOCK_NEED} ${prevName}: ${Math.min(have, E.UNLOCK_NEED)}/${E.UNLOCK_NEED}`;
        row.querySelector('[data-need-bar]').style.transform = `scaleX(${Math.min(1, have / E.UNLOCK_NEED)})`;
        btn.textContent = have < E.UNLOCK_NEED ? `Needs ${E.UNLOCK_NEED - have} more ${prevName}` : `Unlock for ${fmt(b.unlock)} cups`;
        btn.disabled = !E.canUnlock(S, b.id, freeBuys);
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
      v.querySelector('[data-need]').textContent = S.runCups < E.prestigeCost(S)
        ? `Brew ${fmt(E.prestigeCost(S) - S.runCups)} more cups this run to unlock.`
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
    $('expdot').hidden = !E.BUILDINGS.some(b => E.canUnlock(S, b.id, freeBuys));
  }

  // ---------- Game loop ----------
  // Cycle bars move every frame (refresh only runs 10 times a second).
  function drawBars() {
    if (tab !== 'build') return;
    const m = E.mods(S);
    for (const { id, i } of bars) {
      const ct = E.cycleTime(S, id, m), managed = S.managers[id];
      const f = managed && ct < 0.25 ? 1 : managed || S.running[id] ? Math.min(1, (S.progress[id] || 0) / ct) : 0;
      i.style.transform = `scaleX(${f})`;
    }
  }

  // Bean flow: a bean drops down the pipe when a farm or roaster cycle delivers,
  // and the cup pulses when a brewer delivers. Throttled so fast cycles don't flood it.
  const lastBean = {};
  function beanFlow(done, now) {
    for (const id in done) {
      const b = E.BUILDINGS.find(x => x.id === id);
      if (b.stage !== 'farm' && !(S.fill[id] > 0)) continue;
      if (now - (lastBean[b.stage] || 0) < 120) continue;
      lastBean[b.stage] = now;
      if (b.stage === 'brew') { pulse = Math.max(pulse, 0.6); continue; }
      const pipe = document.querySelector(`.pipe[data-from="${b.stage}"]`);
      const d = document.createElement('i');
      d.className = 'bean'; d.style.left = (40 + Math.random() * 20) + '%';
      pipe.appendChild(d); setTimeout(() => d.remove(), 600);
    }
  }

  // Restart a CSS animation on an element (purchase feedback).
  function replay(el, cls) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); }
  // A small burst of sparks from a button (manager hired).
  function burst(el) {
    for (let k = 0; k < 12; k++) {
      const sp = document.createElement('i'), a = k / 12 * Math.PI * 2, r = 28 + Math.random() * 16;
      sp.className = 'spark';
      sp.style.setProperty('--dx', Math.cos(a) * r + 'px'); sp.style.setProperty('--dy', Math.sin(a) * r + 'px');
      el.appendChild(sp); setTimeout(() => sp.remove(), 650);
    }
  }
  const secs = t => t >= 10 ? Math.round(t) + 's' : t >= 1 ? t.toFixed(1) + 's' : t.toFixed(2) + 's';

  let last = performance.now(), acc = 0, saveAcc = 0;
  function frame(now) {
    const dt = Math.min(1, (now - last) / 1000); last = now;
    const r = E.tick(S, dt);
    beanFlow(r.done, now);
    drawBars();
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
