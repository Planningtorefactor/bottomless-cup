// Bottomless Cup - game engine (pure logic, no DOM).
// Runs in the browser and in Node (for balance simulations).

const GROWTH = 1.15; // each copy of a building costs 15% more than the last

const BUILDINGS = [
  // Farms: produce green beans per second
  { id: 'bush',       stage: 'farm',   name: 'Backyard Bush',        cost: 10,      rate: 0.5 },
  { id: 'farm',       stage: 'farm',   name: 'Family Farm',          cost: 120,     rate: 4 },
  { id: 'plantation', stage: 'farm',   name: 'Plantation',           cost: 1500,    rate: 30 },
  { id: 'estate',     stage: 'farm',   name: 'Highland Estate',      cost: 20000,   rate: 220 },
  { id: 'coop',       stage: 'farm',   name: 'Cloud Forest Co-op',   cost: 300000,  rate: 1600 },
  // Roasters: roast green beans per second (capacity)
  { id: 'pan',        stage: 'roast',  name: 'Pan Roaster',          cost: 15,      rate: 0.6 },
  { id: 'drum',       stage: 'roast',  name: 'Drum Roaster',         cost: 180,     rate: 5 },
  { id: 'fluid',      stage: 'roast',  name: 'Fluid-Bed Roaster',    cost: 2200,    rate: 36 },
  { id: 'roastery',   stage: 'roast',  name: 'Industrial Roastery',  cost: 30000,   rate: 260 },
  { id: 'lab',        stage: 'roast',  name: 'Smart Roast Lab',      cost: 450000,  rate: 1900 },
  // Brewers: brew roasted beans per second (capacity), each with its own yield and perk
  { id: 'drip',       stage: 'brew',   name: 'Drip Machine',         cost: 20,      rate: 0.6,  yield: 1.0,
    perk: 'Reliable and cheap.' },
  { id: 'press',      stage: 'brew',   name: 'French Press',         cost: 240,     rate: 5,    yield: 1.1,
    perk: '1.1 cups per roasted bean.' },
  { id: 'pourover',   stage: 'brew',   name: 'Pour-Over Bar',        cost: 3000,    rate: 36,   yield: 1.25,
    perk: '1.25 cups per roasted bean.' },
  { id: 'espresso',   stage: 'brew',   name: 'Espresso Machine',     cost: 40000,   rate: 260,  yield: 1.0,
    perk: '+2% click power each.' },
  { id: 'coldbrew',   stage: 'brew',   name: 'Cold Brew Tower',      cost: 600000,  rate: 1900, yield: 1.4,
    perk: '1.4 yield, +1% offline efficiency each (max +50%).' },
];

// Production runs in cycles, like AdVenture Capitalist. Each building type has a fixed cycle
// time (cheap tiers are quick); owning more makes each batch bigger, not the bar faster.
// A batch is rate * cycle, so the average output per second matches the rate above.
const CYCLE_BY_TIER = [1, 3, 6, 12, 24];   // seconds, tier 1..5 within each stage
const MANAGER_MULT = 20;                    // manager price = building base cost * this
for (const st of ['farm', 'roast', 'brew']) {
  BUILDINGS.filter(b => b.stage === st).forEach((b, i) => {
    b.cycle = CYCLE_BY_TIER[i];
    b.manager = b.cost * MANAGER_MULT;
  });
}

const BEANS = [
  { id: 'arabica',     name: 'Arabica',     stars: 0,   desc: '+10% brew yield. The balanced starter.',
    mods: { yield: 1.10 } },
  { id: 'robusta',     name: 'Robusta',     stars: 5,   desc: 'x2 farm output, -10% brew yield.',
    mods: { farm: 2, yield: 0.9 } },
  { id: 'liberica',    name: 'Liberica',    stars: 25,  desc: 'x2 roaster capacity, -10% farm output.',
    mods: { roast: 2, farm: 0.9 } },
  { id: 'yirgacheffe', name: 'Yirgacheffe', stars: 75,  desc: '+40% brew yield, -25% click power.',
    mods: { yield: 1.4, click: 0.75 } },
  { id: 'geisha',      name: 'Geisha',      stars: 200, desc: 'x3 click power, +25% everything.',
    mods: { click: 3, all: 1.25 } },
];

// One-time upgrades. Global ones are listed here; per-building ones are generated below.
const UPGRADES = [
  { id: 'grinder',   name: 'Burr Grinder',       cost: 100,     desc: 'Click power x2.',            mods: { click: 2 } },
  { id: 'apprentice',name: 'Barista Apprentice', cost: 1000,    desc: 'Clicks also add 1% of your cups/sec.', mods: { clickPct: 0.01 } },
  { id: 'fairtrade', name: 'Fair Trade Contracts', cost: 5000,  desc: 'Farms +50%.',                mods: { farm: 1.5 } },
  { id: 'thermal',   name: 'Thermal Sensors',    cost: 8000,    desc: 'Roasters +50%.',             mods: { roast: 1.5 } },
  { id: 'filter',    name: 'Water Filtration',   cost: 12000,   desc: 'Brewers +50%, yield +10%.',  mods: { brew: 1.5, yield: 1.1 } },
  { id: 'latteart',  name: 'Latte Art',          cost: 50000,   desc: 'Click power x3.',            mods: { click: 3 } },
  { id: 'loyalty',   name: 'Loyalty Cards',      cost: 250000,  desc: 'All production x1.5.',       mods: { all: 1.5 } },
  { id: 'drivethru', name: 'Drive-Thru Window',  cost: 5e6,     desc: 'All production x2.',         mods: { all: 2 } },
  { id: 'subscript', name: 'Bean Subscriptions', cost: 1e8,     desc: 'All production x2.',         mods: { all: 2 } },
];
for (const b of BUILDINGS) {
  UPGRADES.push({ id: b.id + '_10', name: b.name + ' Tune-up', cost: b.cost * 40, need: { id: b.id, n: 10 },
    desc: b.name + ' cycles twice as fast (needs 10).', mods: { speed: { [b.id]: 2 } } });
  UPGRADES.push({ id: b.id + '_25', name: b.name + ' Mastery', cost: b.cost * 400, need: { id: b.id, n: 25 },
    desc: b.name + ' cycles twice as fast (needs 25).', mods: { speed: { [b.id]: 2 } } });
}

// Ascension perks bought with Origin Tokens. max = how many levels.
const LEGACY = [
  { id: 'headstart', name: 'Head Start',          cost: 1, max: 1, desc: 'Every run starts with 5 Bushes, 5 Pan Roasters, 5 Drip Machines.' },
  { id: 'academy',   name: 'Barista Academy',     cost: 1, max: 5, desc: 'Click power x2 per level.' },
  { id: 'vault',     name: 'Seed Vault',          cost: 2, max: 1, desc: 'Bean varieties stay unlocked when you Go Global.' },
  { id: 'nightshift',name: 'Night Shift',         cost: 2, max: 1, desc: 'Offline production 50% -> 100%.' },
  { id: 'starpower', name: 'Star Power',          cost: 2, max: 5, desc: 'Each Reputation Star gives +1% more per level.' },
  { id: 'supply',    name: 'Global Supply Chain', cost: 3, max: 3, desc: 'All production x2 per level.' },
  { id: 'staff',     name: 'Loyal Staff',         cost: 3, max: 1, desc: 'Managers stay hired when you Open a New Cafe or Go Global.' },
  { id: 'autobuy',   name: 'Operations Manager',  cost: 4, max: 1, desc: 'Auto-buys a building for your bottleneck stage every 2 seconds.' },
];

const PRESTIGE_MIN = 1e6;   // cups this run needed to Open a New Cafe
const ASCEND_MIN = 1000;    // Stars needed to Go Global

function newRun(state) {
  state.cups = 0;
  state.runCups = 0;
  state.green = 0;
  state.roasted = 0;
  state.owned = {};
  for (const b of BUILDINGS) state.owned[b.id] = 0;
  state.upgrades = {};
  state.progress = {};   // seconds into the current cycle, per building
  state.running = {};    // unmanaged buildings started by a click (run one cycle)
  state.fill = {};       // share of the last batch a roaster/brewer actually got (1 = full)
  if (!(state.legacy || {}).staff || !state.managers) state.managers = {};
  if ((state.legacy || {}).headstart) {
    state.owned.bush = 5; state.owned.pan = 5; state.owned.drip = 5;
  }
  return state;
}

function newGame() {
  const s = {
    version: 1,
    lifetimeCups: 0,
    stars: 0,            // Reputation Stars held (reset on ascension)
    starsEarned: 0,      // total earned this ascension, unlocks beans
    bean: 'arabica',
    beansUnlocked: { arabica: true },
    tokens: 0,           // unspent Origin Tokens
    legacy: {},          // legacy perk levels
    prestiges: 0,
    ascensions: 0,
    managers: {},        // building id -> true once a manager is hired
    lastSave: Date.now(),
    autoTimer: 0,
  };
  return newRun(s);
}

function bld(id) { return BUILDINGS.find(b => b.id === id); }

function costOf(s, id, n = 1) {
  const b = bld(id), k = s.owned[id];
  // sum of a geometric series: base * r^k * (r^n - 1) / (r - 1)
  return b.cost * Math.pow(GROWTH, k) * (Math.pow(GROWTH, n) - 1) / (GROWTH - 1);
}

function maxAffordable(s, id) {
  const b = bld(id), k = s.owned[id];
  const n = Math.floor(Math.log(s.cups * (GROWTH - 1) / (b.cost * Math.pow(GROWTH, k)) + 1) / Math.log(GROWTH));
  return Math.max(0, n);
}

// Collect every multiplier from upgrades, bean, prestige and legacy.
// speed = per-building cycle speed (2 means cycles take half as long).
function mods(s) {
  const m = { farm: 1, roast: 1, brew: 1, yield: 1, click: 1, all: 1, clickPct: 0, speed: {} };
  const apply = src => {
    for (const k in src) {
      if (k === 'speed') for (const id in src.speed) m.speed[id] = (m.speed[id] || 1) * src.speed[id];
      else if (k === 'clickPct') m.clickPct += src[k];
      else m[k] *= src[k];
    }
  };
  for (const u of UPGRADES) if (s.upgrades[u.id]) apply(u.mods);
  apply(BEANS.find(b => b.id === s.bean).mods);
  const L = s.legacy;
  const perStar = 0.02 + 0.01 * (L.starpower || 0);
  m.all *= 1 + perStar * s.stars;
  m.all *= Math.pow(2, L.supply || 0);
  m.click *= Math.pow(2, L.academy || 0);
  m.click *= 1 + 0.02 * s.owned.espresso;
  return m;
}

// Seconds per cycle for a building type, and what one cycle of all its copies handles.
function cycleTime(s, id, m = mods(s)) { return bld(id).cycle / (m.speed[id] || 1); }
function batch(s, id, m = mods(s)) {
  const b = bld(id);
  return s.owned[id] * b.rate * b.cycle * m[b.stage] * m.all;
}

// Average capacity per stage (batch / cycle time), already multiplied.
// Brewer yield is a capacity-weighted average.
// cupsPerSec only counts managed buildings: that is what runs on its own (and offline).
function rates(s) {
  const m = mods(s);
  const r = { farm: 0, roast: 0, brew: 0, yieldWeighted: 0 };
  const auto = { farm: 0, roast: 0, brew: 0, yieldWeighted: 0 };
  for (const b of BUILDINGS) {
    const out = s.owned[b.id] * b.rate * (m.speed[b.id] || 1) * m[b.stage] * m.all;
    r[b.stage] += out;
    if (b.stage === 'brew') r.yieldWeighted += out * b.yield;
    if (s.managers[b.id]) {
      auto[b.stage] += out;
      if (b.stage === 'brew') auto.yieldWeighted += out * b.yield;
    }
  }
  r.yield = (r.brew > 0 ? r.yieldWeighted / r.brew : 1) * m.yield;
  const autoYield = (auto.brew > 0 ? auto.yieldWeighted / auto.brew : 1) * m.yield;
  r.cupsPerSec = Math.min(auto.farm, auto.roast, auto.brew) * autoYield; // steady state
  r.bottleneck = r.cupsPerSec === 0 && r.farm + r.roast + r.brew === 0 ? null
    : (r.farm <= r.roast && r.farm <= r.brew ? 'farm' : r.roast <= r.brew ? 'roast' : 'brew');
  r.clickPower = m.click + m.clickPct * r.cupsPerSec;
  return r;
}

function addCups(s, n) { s.cups += n; s.runCups += n; s.lifetimeCups += n; }

// A building finished `n` cycles. Farms make green beans; roasters and brewers take
// whatever their input stockpile has, up to a full batch each.
function finishCycles(s, b, n, m) {
  const want = batch(s, b.id, m) * n;
  if (b.stage === 'farm') { s.green += want; return; }
  const from = b.stage === 'roast' ? 'green' : 'roasted';
  const used = Math.min(s[from], want);
  s[from] -= used;
  s.fill[b.id] = want > 0 ? used / want : 1;
  if (b.stage === 'roast') s.roasted += used;
  else addCups(s, used * b.yield * m.yield);
}

// Click an unmanaged building to run one cycle.
function runBuilding(s, id) {
  if (!s.owned[id] || s.managers[id] || s.running[id]) return false;
  s.running[id] = true; s.progress[id] = 0; return true;
}

function buyManager(s, id, free = false) {
  const b = bld(id);
  if (!b || s.managers[id] || (!free && s.cups < b.manager)) return false;
  if (!free) s.cups -= b.manager;
  s.managers[id] = true; s.running[id] = false; return true;
}

// Advance the simulation by dt seconds. Buildings run in list order: farms, roasters, brewers.
// Returns rates plus `done`: building id -> cycles finished this tick (the UI animates these).
function tick(s, dt) {
  const r = rates(s), m = mods(s);
  r.done = {};
  for (const b of BUILDINGS) {
    const id = b.id, managed = s.managers[id];
    if (!s.owned[id] || (!managed && !s.running[id])) continue;
    const ct = cycleTime(s, id, m);
    s.progress[id] = (s.progress[id] || 0) + dt;
    let n = Math.floor(s.progress[id] / ct);
    if (n < 1) continue;
    if (managed) s.progress[id] -= n * ct;
    else { n = 1; s.running[id] = false; s.progress[id] = 0; }
    finishCycles(s, b, n, m);
    r.done[id] = n;
  }
  // Operations Manager legacy perk
  if (s.legacy.autobuy) {
    s.autoTimer += dt;
    if (s.autoTimer >= 2) {
      s.autoTimer = 0;
      const stage = r.bottleneck || 'farm';
      const best = BUILDINGS.filter(b => b.stage === stage && costOf(s, b.id) <= s.cups)
        .sort((x, y) => y.rate / costOf(s, y.id) - x.rate / costOf(s, x.id))[0];
      if (best) buy(s, best.id, 1);
    }
  }
  return r;
}

function click(s) { const r = rates(s); addCups(s, r.clickPower); return r.clickPower; }

function buy(s, id, n = 1, free = false) {
  const c = costOf(s, id, n);
  if (n < 1 || (!free && c > s.cups)) return false;
  if (!free) s.cups -= c;
  s.owned[id] += n; return true;
}

// free = testing mode: ignore cost. Requirements (building counts, max levels) still apply.
function upgradeAvailable(s, u, free = false) {
  if (s.upgrades[u.id]) return false;
  if (u.need && s.owned[u.need.id] < u.need.n) return false;
  return free || s.runCups >= u.cost * 0.5 || s.cups >= u.cost; // reveal once you are close
}

function buyUpgrade(s, id, free = false) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || s.upgrades[id] || (!free && s.cups < u.cost)) return false;
  if (u.need && s.owned[u.need.id] < u.need.n) return false;
  if (!free) s.cups -= u.cost;
  s.upgrades[id] = true; return true;
}

function setBean(s, id) { if (s.beansUnlocked[id]) s.bean = id; }

// ---- Prestige: Open a New Cafe ----
function pendingStars(s) { return s.runCups < PRESTIGE_MIN ? 0 : Math.floor(10 * Math.cbrt(s.runCups / 1e6)); }

function prestige(s) {
  const gain = pendingStars(s);
  if (gain <= 0) return 0;
  s.stars += gain; s.starsEarned += gain; s.prestiges++;
  for (const b of BEANS) if (s.starsEarned >= b.stars) s.beansUnlocked[b.id] = true;
  newRun(s);
  return gain;
}

// ---- Ascension: Go Global ----
function pendingTokens(s) { return s.stars < ASCEND_MIN ? 0 : Math.floor(5 * Math.sqrt(s.stars / ASCEND_MIN)); }

function ascend(s) {
  const gain = pendingTokens(s);
  if (gain <= 0) return 0;
  s.tokens += gain; s.ascensions++;
  s.stars = 0; s.starsEarned = 0;
  if (!s.legacy.vault) { s.beansUnlocked = { arabica: true }; s.bean = 'arabica'; }
  newRun(s);
  return gain;
}

function buyLegacy(s, id, free = false) {
  const p = LEGACY.find(x => x.id === id), lvl = s.legacy[id] || 0;
  if (!p || lvl >= p.max || (!free && s.tokens < p.cost)) return false;
  if (!free) s.tokens -= p.cost;
  s.legacy[id] = lvl + 1; return true;
}

// ---- Offline progress ----
function offlineEfficiency(s) {
  if (s.legacy.nightshift) return 1;
  return 0.5 + Math.min(0.5, 0.01 * s.owned.coldbrew);
}

function applyOffline(s, now = Date.now()) {
  const secs = Math.min(8 * 3600, Math.max(0, (now - s.lastSave) / 1000));
  if (secs < 10) return { secs: 0, cups: 0 };
  const r = rates(s);
  const cups = r.cupsPerSec * secs * offlineEfficiency(s);
  addCups(s, cups);
  return { secs, cups };
}

// ---- Number formatting ----
const SUFFIX = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];
function fmt(n) {
  if (!isFinite(n)) return '0';
  if (n < 1000) return n < 10 && n % 1 ? n.toFixed(1) : Math.floor(n).toString();
  const e = Math.floor(Math.log10(n) / 3);
  if (e < SUFFIX.length) return (n / Math.pow(1000, e)).toFixed(2) + SUFFIX[e];
  return n.toExponential(2);
}

const Engine = {
  GROWTH, BUILDINGS, BEANS, UPGRADES, LEGACY, PRESTIGE_MIN, ASCEND_MIN,
  newGame, newRun, costOf, maxAffordable, mods, cycleTime, batch, rates, tick, click, buy, runBuilding, buyManager,
  upgradeAvailable, buyUpgrade,
  setBean, pendingStars, prestige, pendingTokens, ascend, buyLegacy, offlineEfficiency, applyOffline, fmt,
};
if (typeof module !== 'undefined') module.exports = Engine;
