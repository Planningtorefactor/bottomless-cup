// Bottomless Cup - browser UI. Depends on Engine (src/engine.js).
(function () {
  const E = Engine;
  // v3 = farms -> roasters -> packing -> trucks. Older saves (v1 cups, v2 farms/trucks) are not loaded.
  const SAVE_KEY = 'bottomless-cup-save-v3';
  const $ = id => document.getElementById(id);
  const fmt = E.fmt, money = E.money;

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
    if (typeof data.money !== 'number' || !data.owned) throw new Error('bad');
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
    setTimeout(() => toast(`Welcome back. In ${h}h ${m}m away your managers earned ${money(away.money)}.`), 400);
  }

  // ---------- Clicking ----------
  const brewBtn = $('brew');
  brewBtn.addEventListener('click', ev => {
    const got = E.click(S);
    const p = document.createElement('div');
    p.className = 'pop'; p.textContent = '+' + money(got);
    const rect = brewBtn.getBoundingClientRect();
    const x = ev.clientX ? ev.clientX - rect.left : rect.width / 2;
    const y = ev.clientY ? ev.clientY - rect.top : rect.height / 3;
    p.style.left = (x - 12) + 'px'; p.style.top = (y - 20) + 'px';
    brewBtn.appendChild(p); setTimeout(() => p.remove(), 900);
    pulse = 1;
  });
  let pulse = 0;
  // The cup label jumps to the Sell tab (most useful once you can prestige).
  $('goal').addEventListener('click', () => document.querySelector('.tab[data-tab="sell"]').click());

  // ---------- Tabs ----------
  let tab = 'build', buyMode = 1, confirmSell = false, confirmGlobal = false, sig = '';
  // Testing toggle: buildings, upgrades and Legacy perks cost nothing (you still buy each one).
  // Not saved, so it is off after a reload.
  let freeBuys = false;
  let bars = [];   // building rows' cycle bars, filled in by render()
  let wasReady = S.runMoney >= E.prestigeCost(S);   // celebrate only when this flips during play
  const freeBtn = () => `<button class="ghost" data-act="free" aria-pressed="${freeBuys}">Free buying: ${freeBuys ? 'ON' : 'off'}</button>`;
  document.querySelector('.tabs').addEventListener('click', e => {
    const b = e.target.closest('.tab'); if (!b) return;
    tab = b.dataset.tab; confirmSell = confirmGlobal = false;
    document.querySelectorAll('.tab').forEach(t => t.setAttribute('aria-selected', t === b));
    render();
  });

  const STAGES = [
    { k: 'grow', title: 'Farms', unit: 'lb of green beans/s per plant', c: 'var(--green)' },
    { k: 'roast', title: 'Roasters', unit: 'lb/s roasted', c: 'var(--roast)' },
    { k: 'pack', title: 'Packing', unit: 'lb/s packed', c: 'var(--crema)' },
    { k: 'ship', title: 'Trucks', unit: 'lb per truck', c: 'var(--ink)' },
    { k: 'brew', title: 'Coffee Shops', unit: 'lb/s brewed', c: 'var(--ok)' },
  ];
  // Upgrades tab sections, in this order. Each upgrade's `group` in the engine says where it goes.
  const UPG_GROUPS = [
    { k: 'click', title: 'Clicking', c: 'var(--muted)' },
    ...STAGES.map(st => ({ k: st.k, title: st.title, c: st.c })),
    { k: 'sales', title: 'Sales', c: 'var(--ok)' },
    { k: 'all', title: 'Whole business', c: 'var(--ink)' },
  ];
  const lb = n => fmt(n) + ' lb';
  const bname = id => E.BUILDINGS.find(x => x.id === id).name;
  const ownedTxt = (b, n) => b.stage === 'grow' ? `${n}/${E.FARM_SIZE} plants` : n;

  // Which tiers are open; render() rebuilds the Buildings/Expansion tabs when this changes.
  const unlockSig = () => E.BUILDINGS.filter(b => E.isUnlocked(S, b.id)).map(b => b.id).join() + '|' + Object.keys(S.dist).join() + '|' + S.bag;
  // Dashed row under a stage's buildings pointing at its next locked tier.
  function nextTier(stage) {
    const b = E.BUILDINGS.find(x => x.stage === stage && !E.isUnlocked(S, x.id));
    return b ? `<button class="next" data-next="${b.id}" data-goto="expand">
      <span>Next: <b>${b.name}</b> · unlock in Expansion</span><small data-next-txt></small></button>` : '';
  }

  // Star upgrades appear once you have sold a business at least once.
  const starList = () => S.starsEarned > 0 || freeBuys ? E.STAR_UPGRADES.filter(u => !S.starUpgrades[u.id]) : [];
  const upgSig = () => E.UPGRADES.filter(u => E.upgradeAvailable(S, u, freeBuys)).map(u => u.id).join() + '|' + starList().map(u => u.id).join();

  function buyCount(id) {
    if (buyMode === 'max') return Math.max(1, E.maxAffordable(S, id));
    return Math.max(1, Math.min(buyMode, E.room(S, id)));
  }

  function render() {
    const v = $('view');
    if (tab === 'build') {
      v.innerHTML = `<div class="toolbar"><p>Grow, roast, bag, then truck it to the buyer. Buy for your <b>bottleneck</b>.</p>${freeBtn()}
        <div class="seg" role="group" aria-label="Buy amount">
          ${[1, 10, 'max'].map(n => `<button data-mode="${n}" aria-pressed="${buyMode === n}">${n === 'max' ? 'Max' : 'x' + n}</button>`).join('')}
        </div></div>` +
        STAGES.map(st => `<div class="group" style="--c:${st.c}"><h4>${st.title}</h4><div class="list">` +
          (st.k === 'brew' && !E.shopsOpen(S) ? `<p class="empty">Your first Go Global opens coffee shops: brew your own beans into cups that sell for much more.</p>` :
          E.BUILDINGS.filter(b => b.stage === st.k && E.isUnlocked(S, b.id)).map(b => `
            <div class="bld" data-id="${b.id}">
              <button class="run" data-run="${b.id}" title="${b.perk || ''}">
                <span class="t">${b.name}<span class="own" data-own></span></span>
                <span class="cyc"><i></i></span>
                <span class="d"><span data-batch></span><small data-state></small></span>
              </button>
              <button class="buy" data-buy="${b.id}"><span data-cost></span><small data-cnt></small></button>
              <button class="mgr" data-mgr="${b.id}"></button>
            </div>`).join('') + nextTier(st.k)) + `</div></div>`).join('');
      sig = unlockSig();
      bars = [...v.querySelectorAll('.bld')].map(el => ({ id: el.dataset.id, i: el.querySelector('.cyc i') }));
    } else if (tab === 'expand') {
      v.innerHTML = `<div class="toolbar"><p>Fill a farm (${E.FARM_SIZE} plants) to buy the next one. Bigger roasters, packers, trucks and shops need ${E.UNLOCK_NEED} of the tier below. All of this resets when you sell the business.</p>${freeBtn()}</div>` +
        STAGES.filter(st => st.k !== 'brew' || E.shopsOpen(S)).map(st => {
          const b = E.BUILDINGS.find(x => x.stage === st.k && !E.isUnlocked(S, x.id));
          return `<div class="group" style="--c:${st.c}"><h4>${st.title}</h4>` + (b ? `
            <div class="panel unl">
              <div class="row" style="justify-content:space-between"><h3>${b.name}</h3><span class="num">tier ${b.tier}</span></div>
              <p>${b.stage === 'ship' ? `Carries ${lb(b.cap)}, ${b.cycle}s round trip.` : `${fmt(b.rate)} ${st.unit}, every ${b.cycle}s.`}${b.perk ? ' ' + b.perk : ''}</p>
              <div class="need"><span data-need-txt></span><span class="cyc"><i data-need-bar></i></span></div>
              <button class="act" data-unl="${b.id}"></button>
            </div>` : `<p class="empty">Every tier is unlocked.</p>`) + `</div>`;
        }).join('') +
        `<div class="group" style="--c:var(--crema)"><h4>Bag size</h4><div class="list">` +
        E.BAGS.slice(1).map((g, i) => `<button class="item" data-bag="${i + 1}">
          <span class="t">${g.name}<span class="own" data-own></span></span>
          <span class="p" data-cost></span>
          <span class="d">Bigger bags fill faster: each packing cycle handles ${g.output}x as much as with 8 oz bags (${E.BAGS[i].name}s: ${E.BAGS[i].output}x).</span></button>`).join('') + `</div></div>` +
        `<div class="group" style="--c:var(--ink)"><h4>Own your distribution</h4><div class="list">` +
        E.DISTRIBUTION.map(d => `<button class="item" data-dist="${d.id}">
          <span class="t">${d.name}<span class="own" data-own></span></span>
          <span class="p" data-cost></span>
          <span class="d">${d.desc} Needs ${lb(d.lbs)} delivered this run.</span></button>`).join('') + `</div></div>`;
      sig = unlockSig();
    } else if (tab === 'upg') {
      const list = E.UPGRADES.filter(u => E.upgradeAvailable(S, u, freeBuys)).sort((a, b) => a.cost - b.cost);
      const stars = starList();
      sig = upgSig();
      v.innerHTML = `<div class="toolbar"><p>One-time purchases. New ones appear as you grow.</p>${freeBtn()}</div>` +
        (stars.length ? `<div class="group" style="--c:var(--crema)"><h4>Reputation · <span class="num" data-stars></span> Stars</h4>
          <p class="empty">Bought with Stars. They stay when you sell the business and reset when you Go Global. Each Star you spend stops giving its <b data-perstar></b> production bonus.</p>
          <div class="list">` + stars.map(u => `
            <button class="item" data-star="${u.id}">
              <span class="t">${u.name}</span>
              <span class="p">${fmt(u.stars)} Stars</span>
              <span class="d">${u.desc}</span>
            </button>`).join('') + `</div></div>` : '') +
        (list.length ? UPG_GROUPS.map(g => {
          const here = list.filter(u => u.group === g.k);
          return here.length ? `<div class="group" style="--c:${g.c}"><h4>${g.title}</h4><div class="list">` + here.map(u => `
            <button class="item" data-upg="${u.id}">
              <span class="t">${u.name}</span>
              <span class="p" data-cost>${money(u.cost)}</span>
              <span class="d">${u.desc}</span>
            </button>`).join('') + `</div></div>` : '';
        }).join('') : stars.length ? '' : `<p class="empty">Nothing new yet. Keep growing.</p>`);
    } else if (tab === 'beans') {
      v.innerHTML = `<div class="toolbar"><p>Choose which variety your farms grow. Swap any time. New beans unlock from Reputation Stars earned.</p>${freeBtn()}</div><div class="list">` +
        E.BEANS.map(b => {
          const open = S.beansUnlocked[b.id], show = open || freeBuys;
          return `<button class="item${S.bean === b.id ? ' sel' : ''}" data-bean="${b.id}" ${show ? '' : 'disabled'}>
            <span class="t">${show ? b.name : 'Locked variety'}</span>
            <span class="p">${S.bean === b.id ? 'Growing' : open ? 'Grow' : freeBuys ? '<small>free</small>Unlock' : `<small>needs</small>${b.stars} stars`}</span>
            <span class="d">${show ? b.desc : 'Earn more Reputation Stars to unlock.'}</span></button>`;
        }).join('') + `</div>`;
    } else if (tab === 'sell') {
      v.innerHTML = `<div class="toolbar"><p>Prestige: sell the business and start over with a better reputation.</p></div>
        <div class="panel">
          <h3>Sell the Business</h3>
          <p>Needs <b class="num">${money(E.prestigeCost(S))}</b> earned this run. Each sale needs twice as much as the last, until you Go Global.</p>
          <p>Resets money, plants, roasters, packers, trucks, bag size, unlocks, distribution, managers and upgrades. Keeps Stars, Star upgrades, bean varieties and Legacy perks. Each Star adds <b data-perstar></b> to all production.</p>
          <div class="stat num" data-pending>0<small>Stars on sale</small></div>
          <p data-need></p>
          <div class="row"><button class="act" data-act="sell"></button><button class="ghost" data-act="cancel" hidden>Keep growing</button></div>
        </div>
        <div class="panel"><p>Stars held <b class="num">${S.stars}</b> · earned this ascension <b class="num">${S.starsEarned}</b> · businesses sold <b class="num">${S.prestiges}</b></p></div>`;
    } else if (tab === 'global') {
      v.innerHTML = `<div class="toolbar"><p>Ascension: trade every Star for Origin Tokens.</p>${freeBtn()}</div>
        <div class="panel">
          <h3>Go Global</h3>
          <p>${E.shopsOpen(S) ? '' : '<b>Your first Go Global opens coffee shops.</b> '}Resets your run, Reputation Stars${S.legacy.vault ? ' and' : ','} Star upgrades${S.legacy.vault ? '' : ' and bean varieties'}. Origin Tokens buy permanent Legacy perks below.</p>
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
    if (t.dataset.bag) {
      if (+t.dataset.bag === S.bag + 1 && E.buyBag(S, freeBuys)) { burst(t); toast(`Now packing ${E.BAGS[S.bag].name}s.`); render(); }
      return;
    }
    if (t.dataset.dist) {
      const d = E.DISTRIBUTION.find(x => x.id === t.dataset.dist);
      if (E.buyDist(S, d.id, freeBuys)) { burst(t); toast(`${d.name} built. Coffee now sells for ${money(E.lbPrice(S))} per lb.`); render(); }
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
    if (t.dataset.star) {
      const u = E.STAR_UPGRADES.find(x => x.id === t.dataset.star);
      if (E.buyStarUpgrade(S, u.id, freeBuys)) { burst(t); toast(`${u.name} bought. ${u.desc}`); save(); render(); }
      return;
    }
    if (t.dataset.bean) { E.setBean(S, t.dataset.bean, freeBuys); render(); return; }
    if (t.dataset.legacy) { if (E.buyLegacy(S, t.dataset.legacy, freeBuys)) { toast('Legacy perk bought.'); save(); render(); } return; }
    const a = t.dataset.act;
    if (a === 'free') { freeBuys = !freeBuys; toast(freeBuys ? 'Free buying on (testing).' : 'Free buying off.'); render(); return; }
    if (a === 'cancel') { confirmSell = confirmGlobal = false; refresh(); }
    if (a === 'sell') {
      if (!confirmSell) { confirmSell = true; refresh(); return; }
      const g = E.prestige(S); confirmSell = false; save();
      toast(`Business sold. +${g} Reputation Stars.`); render();
    }
    if (a === 'global') {
      if (!confirmGlobal) { confirmGlobal = true; refresh(); return; }
      const first = !E.shopsOpen(S), g = E.ascend(S); confirmGlobal = false; save();
      toast(first ? `You went global. +${g} Origin Tokens, and coffee shops are open.` : `You went global. +${g} Origin Tokens.`); render();
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
    $('money').textContent = money(S.money);
    $('mps').textContent = money(R.moneyPerSec);
    $('runmoney').textContent = money(S.runMoney);
    $('clickpow').textContent = money(R.clickPower);
    $('m-stars').textContent = fmt(S.stars);
    $('m-tokens').textContent = fmt(S.tokens);
    $('m-bean').textContent = E.BEANS.find(b => b.id === S.bean).name;
    $('prices').textContent = `${money(R.lbPrice)} per lb · ${E.BAGS[S.bag].name}s` + (E.shopsOpen(S) ? ` · ${money(R.cupPrice)} per cup` : '');

    // chain: farms -> roasters -> packing -> trucks
    const max = Math.max(R.grow, R.roast, R.pack, R.ship, 1e-9);
    const onRoad = E.BUILDINGS.filter(b => b.stage === 'ship').reduce((n, b) => n + (S.cargo[b.id] || 0), 0);
    const stock = { grow: lb(S.green), roast: lb(S.roasted), pack: `${fmt(S.packed / E.bagLb(S))} (${lb(S.packed)})`, ship: lb(onRoad) };
    document.querySelectorAll('.stage').forEach(el => {
      const k = el.dataset.k;
      el.querySelector('.bar i').style.width = (R[k] / max * 100) + '%';
      el.querySelector('.cap').textContent = lb(R[k]) + '/s';
      const sb = el.querySelector('.stock b'); if (sb) sb.textContent = stock[k];
      const lim = R.bottleneck === k;
      el.classList.toggle('limit', lim);
      el.querySelector('.flag').innerHTML = lim ? '<span class="badge">Bottleneck</span>' : '';
    });

    // cup fill: percent of the way to Sell the Business (prestigeCost money this run).
    // 50% of the money means half full. The click pulse can't fill it to the rim before you're ready.
    const goalMoney = E.prestigeCost(S), ready = S.runMoney >= goalMoney;
    const pct = Math.min(1, S.runMoney / goalMoney);
    const frac = ready ? 1 : Math.min(0.98, pct + pulse * 0.04);
    const y = 168 - frac * 112;
    $('fill').setAttribute('y', y); $('crema').setAttribute('y', y - 4);
    brewBtn.classList.toggle('ready', ready);
    const goal = $('goal');
    goal.classList.toggle('ready', ready);
    goal.textContent = ready ? `Ready to sell the business · +${fmt(E.pendingStars(S))} Stars →`
      : `Sell the business: ${Math.floor(pct * 100)}% · ${money(S.runMoney)} / ${money(goalMoney)} this run`;
    if (ready && !wasReady) { burst(brewBtn); toast('Your cup is full: you can sell the business for Reputation Stars.'); }
    wasReady = ready;

    const v = $('view');
    if ((tab === 'build' || tab === 'expand') && unlockSig() !== sig) return render();
    if (tab === 'build') {
      const m = E.mods(S);
      v.querySelectorAll('[data-next]').forEach(el => {
        const b = E.BUILDINGS.find(x => x.id === el.dataset.next);
        el.querySelector('[data-next-txt]').textContent = `${Math.min(S.owned[b.prev], b.need)}/${b.need} ${b.stage === 'grow' ? 'plants on ' : ''}${bname(b.prev)}`;
        el.classList.toggle('ready', E.canUnlock(S, b.id, freeBuys));
      });
      v.querySelectorAll('.bld').forEach(row => {
        const id = row.dataset.id, b = E.BUILDINGS.find(x => x.id === id);
        const full = E.room(S, id) < 1;
        const n = buyCount(id), c = E.costOf(S, id, n), ct = E.cycleTime(S, id, m);
        const owned = S.owned[id], managed = !!S.managers[id], active = managed || S.running[id];
        const truck = b.stage === 'ship', road = truck && S.trip[id] > 0, loaded = truck ? S.load[id] || 0 : 0;
        const starved = !truck && active && b.stage !== 'grow' && owned > 0 && (S.fill[id] ?? 1) < 0.75;
        const fast = !truck && managed && ct < 0.25;
        row.querySelector('[data-own]').textContent = ownedTxt(b, owned);
        const out = E.batch(S, id, m);
        row.querySelector('[data-batch]').textContent = !owned ? (truck ? `${lb(b.cap)} each, ${secs(ct)} trip` : `${secs(ct)} cycle`)
          : truck ? (road ? `On the road with ${lb(S.cargo[id])} (${money(S.cargo[id] * E.lbPrice(S, m))}) · back in ${secs(S.trip[id])}`
            : `Loading ${lb(loaded)} / ${lb(out)} (${money(loaded * E.lbPrice(S, m))}) · ${secs(ct)} trip`)
          : b.stage === 'pack' ? `+${fmt(out / E.bagLb(S))} ${E.BAGS[S.bag].name}s (${lb(out)}) every ${secs(ct)}`
          : b.stage === 'brew' ? `+${fmt(out * E.CUPS_PER_LB * b.yield * m.yield)} cups every ${secs(ct)}`
          : `+${lb(out)} every ${secs(ct)}`;
        row.querySelector('[data-state]').textContent = !owned ? 'Buy one to start'
          : truck ? (road ? (managed ? 'Managed' : 'Driving') : loaded > 0 ? (managed ? 'Leaves when full' : 'Click to send') : 'Waiting for bags')
          : starved ? 'Waiting for coffee' : fast ? 'Nonstop' : managed ? 'Managed' : active ? 'Running' : 'Click to run';
        row.classList.toggle('road', road);
        row.classList.toggle('none', !owned);
        row.classList.toggle('managed', managed);
        row.classList.toggle('idle', owned > 0 && (truck ? !managed && !road && loaded > 0 : !active));
        row.classList.toggle('starved', starved);
        row.classList.toggle('fast', fast);
        row.querySelector('[data-run]').disabled = !owned;
        const buyBtn = row.querySelector('[data-buy]');
        buyBtn.querySelector('[data-cost]').textContent = full ? 'Farm full' : money(c);
        buyBtn.querySelector('[data-cnt]').textContent = full ? 'unlock the next farm' : 'buy ' + n + (b.stage === 'grow' ? ' plant' + (n > 1 ? 's' : '') : '');
        buyBtn.disabled = full || (!freeBuys && c > S.money);
        const mgr = row.querySelector('[data-mgr]');
        mgr.textContent = managed ? 'Manager hired' : `Hire manager ${money(b.manager)}`;
        mgr.disabled = managed || (!freeBuys && b.manager > S.money);
      });
    } else if (tab === 'expand') {
      v.querySelectorAll('[data-unl]').forEach(btn => {
        const b = E.BUILDINGS.find(x => x.id === btn.dataset.unl), have = S.owned[b.prev];
        const prevName = bname(b.prev), row = btn.closest('.unl');
        row.querySelector('[data-need-txt]').textContent = b.stage === 'grow'
          ? `Fill ${prevName}: ${Math.min(have, b.need)}/${b.need} plants` : `Own ${b.need} ${prevName}: ${Math.min(have, b.need)}/${b.need}`;
        row.querySelector('[data-need-bar]').style.transform = `scaleX(${Math.min(1, have / b.need)})`;
        btn.textContent = have < b.need ? (b.stage === 'grow' ? `Plant ${b.need - have} more on ${prevName}` : `Needs ${b.need - have} more ${prevName}`) : `Buy for ${money(b.unlock)}`;
        btn.disabled = !E.canUnlock(S, b.id, freeBuys);
      });
      v.querySelectorAll('[data-bag]').forEach(btn => {
        const i = +btn.dataset.bag, g = E.BAGS[i];
        btn.querySelector('[data-own]').textContent = i === S.bag ? 'packing now' : '';
        btn.querySelector('[data-cost]').innerHTML = i <= S.bag ? 'Owned' : i > S.bag + 1 ? `<small>after</small>${E.BAGS[i - 1].name}` : money(g.cost);
        btn.disabled = i !== S.bag + 1 || !E.canBuyBag(S, freeBuys);
      });
      v.querySelectorAll('[data-dist]').forEach(btn => {
        const i = E.DISTRIBUTION.findIndex(x => x.id === btn.dataset.dist), d = E.DISTRIBUTION[i], have = S.dist[d.id];
        btn.querySelector('[data-own]').textContent = have ? 'owned' : '';
        btn.querySelector('[data-cost]').innerHTML = have ? 'Built' : S.delivered < d.lbs ? `<small>delivered</small>${fmt(S.delivered)}/${lb(d.lbs)}`
          : i > 0 && !S.dist[E.DISTRIBUTION[i - 1].id] ? `<small>after</small>${E.DISTRIBUTION[i - 1].name}` : money(d.cost);
        btn.disabled = !!have || !E.canBuyDist(S, d.id, freeBuys);
      });
    } else if (tab === 'upg') {
      if (upgSig() !== sig) return render();
      v.querySelectorAll('[data-upg]').forEach(b => { b.disabled = !freeBuys && E.UPGRADES.find(u => u.id === b.dataset.upg).cost > S.money; });
      v.querySelectorAll('[data-star]').forEach(b => { b.disabled = !E.canBuyStarUpgrade(S, b.dataset.star, freeBuys); });
      const st = v.querySelector('[data-stars]'); if (st) st.textContent = fmt(S.stars);
      const ps = v.querySelector('[data-perstar]'); if (ps) ps.textContent = (2 + (S.legacy.starpower || 0)) + '%';
    } else if (tab === 'sell') {
      const p = E.pendingStars(S);
      const perStar = 2 + (S.legacy.starpower || 0);
      v.querySelector('[data-perstar]').textContent = perStar + '%';
      v.querySelector('[data-pending]').firstChild.textContent = '+' + fmt(p);
      v.querySelector('[data-need]').textContent = S.runMoney < E.prestigeCost(S)
        ? `Earn ${money(E.prestigeCost(S) - S.runMoney)} more this run to sell.`
        : `Production after the sale: x${(1 + perStar / 100 * (S.stars + p)).toFixed(2)} from Stars (now x${(1 + perStar / 100 * S.stars).toFixed(2)}).`;
      const btn = v.querySelector('[data-act="sell"]');
      btn.disabled = p <= 0;
      btn.textContent = confirmSell ? `Confirm: sell for ${fmt(p)} Stars` : 'Sell the Business';
      btn.classList.toggle('danger', confirmSell);
      v.querySelector('[data-act="cancel"]').hidden = !confirmSell;
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
    // dots on tabs when something there is affordable
    $('upgdot').hidden = !E.UPGRADES.some(u => E.upgradeAvailable(S, u, freeBuys) && (freeBuys || u.cost <= S.money))
      && !starList().some(u => E.canBuyStarUpgrade(S, u.id, freeBuys));
    $('expdot').hidden = !E.BUILDINGS.some(b => E.canUnlock(S, b.id, freeBuys)) && !E.DISTRIBUTION.some(d => E.canBuyDist(S, d.id, freeBuys)) && !E.canBuyBag(S, freeBuys);
  }

  // ---------- Game loop ----------
  // Cycle bars move every frame (refresh only runs 10 times a second).
  function drawBars() {
    if (tab !== 'build') return;
    const m = E.mods(S);
    for (const { id, i } of bars) {
      const ct = E.cycleTime(S, id, m), managed = S.managers[id];
      let f;
      if (E.BUILDINGS.find(b => b.id === id).stage === 'ship') {
        // loading: how full the truck is; on the road: how far along the trip is
        f = S.trip[id] > 0 ? 1 - S.trip[id] / ct : Math.min(1, (S.load[id] || 0) / Math.max(1e-9, E.capacity(S, id, m)));
      } else f = managed && ct < 0.25 ? 1 : managed || S.running[id] ? Math.min(1, (S.progress[id] || 0) / ct) : 0;
      i.style.transform = `scaleX(${f})`;
    }
  }

  // Bean flow: a bean drops down the pipe when a farm, roaster or packer finishes a batch,
  // and the cup pulses when a truck gets paid or a shop sells cups. Throttled so fast cycles
  // don't flood it.
  const lastBean = {};
  function beanFlow(done, now) {
    for (const id in done) {
      const b = E.BUILDINGS.find(x => x.id === id);
      if (b.stage === 'ship') { pulse = 1; continue; }
      if (b.stage !== 'grow' && !(S.fill[id] > 0)) continue;
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
  // A small burst of sparks from a button (manager hired, distribution built).
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
    else { const got = E.applyOffline(S); if (got.money > 0) toast(`While the tab was hidden your managers earned ${money(got.money)}.`); last = performance.now(); }
  });
  window.addEventListener('beforeunload', save);

  // ---------- Dev helpers (open DevTools console: Ctrl+Shift+I) ----------
  // BC.give(1e6) adds money, BC.skip(3600) fast-forwards an hour, BC.state() shows the save.
  // BC.free() toggles free buying (same as the button on the Buildings, Expansion, Upgrades, Beans and Go Global tabs; also makes Star upgrades free).
  // BC.beans() unlocks every bean variety.
  window.BC = {
    state: () => S,
    give: n => { S.money += n; S.runMoney += n; S.lifetimeMoney += n; render(); },
    skip: secs => { for (let i = 0; i < secs; i++) E.tick(S, 1); render(); },
    stars: n => { S.stars += n; S.starsEarned += n; E.BEANS.forEach(b => { if (S.starsEarned >= b.stars) S.beansUnlocked[b.id] = true; }); render(); },
    tokens: n => { S.tokens += n; render(); },
    beans: () => { E.BEANS.forEach(b => { S.beansUnlocked[b.id] = true; }); render(); },
    free: (on = !freeBuys) => { freeBuys = on; render(); return freeBuys; },
  };

  render();
  requestAnimationFrame(frame);
})();
