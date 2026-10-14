// Bottomless Cup - game engine (pure logic, no DOM).
// Runs in the browser and in Node (for balance simulations).
//
// The chain, all in pounds (lb) of coffee:
//   plants on your farms grow green beans -> roasters roast them -> packers fill bags
//   -> trucks load the bags and drive them to the buyer, who pays on delivery.
// After your first Go Global, coffee shops brew some of the bagged coffee into cups first,
// which earns much more per pound.

const GROWTH = 1.15;        // each roaster, packer, truck or shop costs 15% more than the last
const PLANT_GROWTH = 1.015; // plants are cheap and many: each costs 1.5% more than the last
const FARM_SIZE = 250;      // plants per farm

const BUILDINGS = [
  // Farms: you buy plants one at a time. Rate = lb of green beans per second per plant.
  { id: 'family',     stage: 'grow',  name: 'Family Farm',        cost: 3,      rate: 0.3 },
  { id: 'hillside',   stage: 'grow',  name: 'Hillside Farm',      cost: 60,     rate: 2 },
  { id: 'plantation', stage: 'grow',  name: 'Plantation',         cost: 900,    rate: 15 },
  { id: 'estate',     stage: 'grow',  name: 'Highland Estate',    cost: 14000,  rate: 110 },
  { id: 'coop',       stage: 'grow',  name: 'Cloud Forest Co-op', cost: 220000, rate: 800 },
  // Roasters: roast green beans. Rate = lb per second each.
  { id: 'home',       stage: 'roast', name: 'Home Roaster',       cost: 15,     rate: 0.6 },
  { id: 'shoproast',  stage: 'roast', name: 'Shop Roaster',       cost: 180,    rate: 5 },
  { id: 'drum',       stage: 'roast', name: 'Drum Roaster',       cost: 2200,   rate: 36 },
  { id: 'industrial', stage: 'roast', name: 'Industrial Roaster', cost: 300000, rate: 1900 },
  // Packing: fill bags with roasted coffee. Rate = lb per second each; bigger bags pack more per cycle.
  { id: 'table',      stage: 'pack',  name: 'Packing Table',      cost: 10,     rate: 0.5 },
  { id: 'bagger',     stage: 'pack',  name: 'Bagging Machine',    cost: 400,    rate: 6 },
  { id: 'autoline',   stage: 'pack',  name: 'Automated Line',     cost: 20000,  rate: 120 },
  // Coffee shops (open after your first Go Global): brew bagged coffee into cups. Rate = lb/s brewed.
  { id: 'cart',       stage: 'brew',  name: 'Coffee Cart',        cost: 200,    rate: 0.6,  yield: 1.0,
    perk: '16 cups per lb.' },
  { id: 'kiosk',      stage: 'brew',  name: 'Espresso Kiosk',     cost: 2400,   rate: 5,    yield: 1.1,
    perk: '10% more cups per lb, +2% click power each.' },
  { id: 'cafe',       stage: 'brew',  name: 'Corner Café',        cost: 30000,  rate: 36,   yield: 1.25,
    perk: '25% more cups per lb.' },
  { id: 'flagship',   stage: 'brew',  name: 'Flagship Store',     cost: 400000, rate: 260,  yield: 1.4,
    perk: '40% more cups per lb, +1% offline efficiency each (max +50%).' },
  // Trucks: load bags until full (cap, lb each), then drive to the buyer (trip, seconds).
  // They run last each tick, after shops have taken what they need.
  { id: 'pickup',     stage: 'ship',  name: 'Pickup Truck',       cost: 15,     cap: 1000,   trip: 20 },
  { id: 'van',        stage: 'ship',  name: 'Cargo Van',          cost: 5000,   cap: 3000,   trip: 30 },
  { id: 'boxtruck',   stage: 'ship',  name: 'Box Truck',          cost: 60000,  cap: 10000,  trip: 45 },
  { id: 'semi',       stage: 'ship',  name: 'Semi Truck',         cost: 800000, cap: 40000,  trip: 60 },
  { id: 'rail',       stage: 'ship',  name: 'Freight Rail Car',   cost: 1.2e7,  cap: 200000, trip: 120 },
];
const STAGE_ORDER = ['grow', 'roast', 'pack', 'ship', 'brew'];

const LB_PRICE = 1.75;       // money per lb the buyer pays on delivery
const CUPS_PER_LB = 16;   // cups a shop brews from one lb (before its yield bonus)
const CUP_PRICE = 0.25;   // money per cup sold in your shops

// Bag sizes, bought in order in the Expansion tab. Filling one big sack is quicker than filling
// lots of small bags, so each size makes every packer handle more per cycle (output 2 = twice the lb).
// The cycle time itself stays the same, so packing keeps its pace relative to farms and roasters.
const BAGS = [
  { name: '8 oz bag',   lb: 0.5, output: 1,    cost: 0 },
  { name: '1 lb bag',   lb: 1,   output: 1.25, cost: 150 },
  { name: '2 lb bag',   lb: 2,   output: 1.5,  cost: 2000 },
  { name: '5 lb bag',   lb: 5,   output: 2,    cost: 30000 },
  { name: '25 lb sack', lb: 25,  output: 3,    cost: 500000 },
  { name: '50 lb sack', lb: 50,  output: 4,    cost: 8e6 },
];

// Production runs in cycles, like AdVenture Capitalist. Each building type has a fixed cycle
// time (cheap tiers are quick); owning more makes each batch bigger, not the bar faster.
// A batch is rate * cycle, so the average output per second matches the rate above.
// Trucks are different: their "cycle" is the trip, and their batch is however much they loaded.
const CYCLE_BY_TIER = [1, 3, 6, 12, 24];   // seconds, tier 1..5 within each stage
// Each stage's cycles take this many times as long as the farm cycle of the same tier.
// Speed upgrades multiply every building the same way, so these ratios hold when maxed.
const CYCLE_MULT = { grow: 1, roast: 2, pack: 2.5, brew: 1 };
const MANAGER_MULT = 10;                    // manager price = building base cost * this
// Only tier 1 of each stage is open at the start of a run. Higher tiers are unlocked in the
// Expansion tab for money, once you own enough of the tier below: a full farm (250 plants)
// for the next farm, UNLOCK_NEED of the tier below for everything else.
const UNLOCK_MULT = 2;                      // unlock price = building base cost * this
const UNLOCK_NEED = 10;
for (const st of STAGE_ORDER) {
  BUILDINGS.filter(b => b.stage === st).forEach((b, i, list) => {
    const farm = st === 'grow';
    if (st === 'ship') { b.cycle = b.trip; b.rate = b.cap / b.trip; } // rate = lb/s when sent full
    else b.cycle = CYCLE_BY_TIER[i] * CYCLE_MULT[st];
    b.manager = b.cost * MANAGER_MULT * (farm ? 10 : 1); // plants are cheap, managers aren't
    b.tier = i + 1;
    b.growth = farm ? PLANT_GROWTH : GROWTH;
    b.max = farm ? FARM_SIZE : Infinity;
    if (i > 0) { b.prev = list[i - 1].id; b.need = farm ? FARM_SIZE : UNLOCK_NEED; b.unlock = b.cost * UNLOCK_MULT * (farm ? 50 : 1); }
  });
}

// Owning your own distribution: one-time purchases per run that raise the price per lb.
// Each needs enough coffee delivered this run.
const DISTRIBUTION = [
  { id: 'depot',   name: 'Regional Depot',      cost: 25000, lbs: 20000, price: 1.5,
    desc: 'Your own depot handles part of the selling. Price per lb x1.5.' },
  { id: 'center',  name: 'Distribution Center', cost: 2e6,   lbs: 2e6,   price: 2,
    desc: 'Cut out the middleman for most deliveries. Price per lb x2.' },
  { id: 'network', name: 'National Network',    cost: 2e8,   lbs: 2e8,   price: 2.5,
    desc: 'You are the distributor. Price per lb x2.5.' },
];

const BEANS = [
  { id: 'arabica',     name: 'Arabica',     stars: 0,   desc: '+10% price. The balanced starter.',
    mods: { price: 1.10 } },
  { id: 'robusta',     name: 'Robusta',     stars: 5,   desc: 'x2 farm output, -10% price.',
    mods: { grow: 2, price: 0.9 } },
  { id: 'liberica',    name: 'Liberica',    stars: 25,  desc: 'x2 roaster output, -10% farm output.',
    mods: { roast: 2, grow: 0.9 } },
  { id: 'yirgacheffe', name: 'Yirgacheffe', stars: 75,  desc: '+40% price, -25% click power.',
    mods: { price: 1.4, click: 0.75 } },
  { id: 'geisha',      name: 'Geisha',      stars: 200, desc: 'x3 click power, +25% everything.',
    mods: { click: 3, all: 1.25 } },
];

// One-time upgrades. group = which section of the Upgrades tab it shows in (a stage id, or
// click / sales / all). Global ones are listed here; per-building ones are generated below.
const UPGRADES = [
  { id: 'gloves',    name: 'Work Gloves',          cost: 100,     desc: 'Click power x2.',              group: 'click', mods: { click: 2 } },
  { id: 'stand',     name: 'Roadside Stand',       cost: 1000,    desc: 'Clicks also add 1% of your money/sec.', group: 'click', mods: { clickPct: 0.01 } },
  { id: 'fertilizer',name: 'Organic Fertilizer',   cost: 5000,    desc: 'Farms +50%.',                  group: 'grow', mods: { grow: 1.5 } },
  { id: 'profiles',  name: 'Roast Profiles',       cost: 6000,    desc: 'Roasters +50%.',               group: 'roast', mods: { roast: 1.5 } },
  { id: 'sealer',    name: 'Heat Sealer',          cost: 7000,    desc: 'Packing +50%.',                group: 'pack', mods: { pack: 1.5 } },
  { id: 'routes',    name: 'Route Planning',       cost: 8000,    desc: 'Trucks carry +50%.',           group: 'ship', mods: { ship: 1.5 } },
  { id: 'contract',  name: 'Bulk Contract',        cost: 12000,   desc: 'Price per lb +25%.',           group: 'sales', mods: { price: 1.25 } },
  { id: 'harvester', name: 'Harvest Crew',         cost: 50000,   desc: 'Click power x3.',              group: 'click', mods: { click: 3 } },
  { id: 'fairtrade', name: 'Fair Trade Label',     cost: 250000,  desc: 'All production x1.5.',         group: 'all', mods: { all: 1.5 } },
  { id: 'brand',     name: 'House Brand',          cost: 5e6,     desc: 'All production x2.',           group: 'all', mods: { all: 2 } },
  { id: 'export',    name: 'Export License',       cost: 1e8,     desc: 'All production x2.',           group: 'all', mods: { all: 2 } },
];
for (const b of BUILDINGS) {
  // Farms count plants, so their milestones are higher. For trucks, faster = shorter trips.
  const [n1, n2] = b.stage === 'grow' ? [50, 150] : [10, 25];
  const [c1, c2] = b.stage === 'grow' ? [b.cost * 400, b.cost * 4000] : [b.cost * 40, b.cost * 400];
  const what = b.stage === 'ship' ? 'trips take half as long' : 'cycles twice as fast';
  UPGRADES.push({ id: b.id + '_1', name: b.name + ' Tune-up', cost: c1, group: b.stage, need: { id: b.id, n: n1 },
    desc: `${b.name} ${what} (needs ${n1}).`, mods: { speed: { [b.id]: 2 } } });
  UPGRADES.push({ id: b.id + '_2', name: b.name + ' Mastery', cost: c2, group: b.stage, need: { id: b.id, n: n2 },
    desc: `${b.name} ${what} (needs ${n2}).`, mods: { speed: { [b.id]: 2 } } });
}

// One-time upgrades bought with Reputation Stars. They survive selling the business but
// reset when you Go Global. A spent Star stops adding its production bonus, so each one is a trade.
const STAR_UPGRADES = [
  { id: 'celebrity', name: 'Local Celebrity',     stars: 5,   desc: 'Click power x5.',        mods: { click: 5 } },
  { id: 'regulars',  name: 'Loyal Regulars',      stars: 10,  desc: 'Prices x1.5.',           mods: { price: 1.5 } },
  { id: 'growers',   name: 'Expert Growers',      stars: 20,  desc: 'Farms x2.',              mods: { grow: 2 } },
  { id: 'roastmstr', name: 'Master Roaster',      stars: 20,  desc: 'Roasters x2.',           mods: { roast: 2 } },
  { id: 'packpros',  name: 'Packing Pros',        stars: 20,  desc: 'Packing x2.',            mods: { pack: 2 } },
  { id: 'fleet',     name: 'Fleet Deal',          stars: 20,  desc: 'Trucks carry x2.',       mods: { ship: 2 } },
  { id: 'award',     name: 'Award-Winning Roast', stars: 75,  desc: 'All production x2.',     mods: { all: 2 } },
  { id: 'royalty',   name: 'Coffee Royalty',      stars: 300, desc: 'All production x3.',     mods: { all: 3 } },
];

// Ascension perks bought with Origin Tokens. max = how many levels.
const LEGACY = [
  { id: 'headstart', name: 'Head Start',          cost: 1, max: 1, desc: 'Every run starts with 25 plants, 3 Home Roasters and 3 Packing Tables.' },
  { id: 'academy',   name: 'Field Training',      cost: 1, max: 5, desc: 'Click power x2 per level.' },
  { id: 'vault',     name: 'Seed Vault',          cost: 2, max: 1, desc: 'Bean varieties stay unlocked when you Go Global.' },
  { id: 'nightshift',name: 'Night Shift',         cost: 2, max: 1, desc: 'Offline production 50% -> 100%.' },
  { id: 'starpower', name: 'Star Power',          cost: 2, max: 5, desc: 'Each Reputation Star gives +1% more per level.' },
  { id: 'supply',    name: 'Global Supply Chain', cost: 3, max: 3, desc: 'All production x2 per level.' },
  { id: 'staff',     name: 'Loyal Staff',         cost: 3, max: 1, desc: 'Managers stay hired when you sell the business or Go Global.' },
  { id: 'autobuy',   name: 'Operations Manager',  cost: 4, max: 1, desc: 'Auto-buys for your bottleneck stage every 2 seconds.' },
];

const PRESTIGE_MIN = 1e6;   // money this run needed for the first sale of an ascension
const PRESTIGE_GROWTH = 2;  // ...and each sale after that needs this many times more
const ASCEND_MIN = 1000;    // Stars needed to Go Global

function newRun(state) {
  state.money = 0;
  state.runMoney = 0;
  state.green = 0;       // lb of green beans at the farms, waiting to be roasted
  state.roasted = 0;     // lb roasted, waiting to be packed
  state.packed = 0;      // lb in bags at the warehouse, waiting for a truck or a shop
  state.delivered = 0;   // lb delivered to the buyer this run (unlocks distribution)
  state.bag = 0;         // index into BAGS
  state.owned = {};
  for (const b of BUILDINGS) state.owned[b.id] = 0;
  // one plant, one roaster, one packing table and one pickup truck to start
  state.owned.family = 1; state.owned.home = 1; state.owned.table = 1; state.owned.pickup = 1;
  state.upgrades = {};
  state.dist = {};       // distribution purchases this run
  state.progress = {};   // seconds into the current cycle, per building
  state.running = {};    // unmanaged buildings started by a click (run one cycle)
  state.fill = {};       // share of the last batch a roaster/packer/shop actually got (1 = full)
  state.load = {};       // trucks: lb loaded and waiting to leave
  state.wait = {};       // trucks: seconds spent loading with something aboard
  state.trip = {};       // trucks: seconds left on the road (0 = at the warehouse, loading)
  state.cargo = {};      // trucks: lb on the road
  state.unlocked = {};   // higher-tier buildings unlocked this run
  if (!(state.legacy || {}).staff || !state.managers) state.managers = {};
  if ((state.legacy || {}).headstart) { state.owned.family = 25; state.owned.home = 3; state.owned.table = 3; }
  return state;
}

function newGame() {
  const s = {
    version: 3,
    lifetimeMoney: 0,
    stars: 0,            // Reputation Stars held (reset on ascension)
    starsEarned: 0,      // total earned this ascension, unlocks beans
    starUpgrades: {},    // Star upgrades bought (reset on ascension)
    bean: 'arabica',
    beansUnlocked: { arabica: true },
    tokens: 0,           // unspent Origin Tokens
    legacy: {},          // legacy perk levels
    prestiges: 0,
    sales: 0,            // businesses sold this ascension (raises the next sale's target)
    ascensions: 0,       // 1+ opens coffee shops
    managers: {},        // building id -> true once a manager is hired
    lastSave: Date.now(),
    autoTimer: 0,
  };
  return newRun(s);
}

function bld(id) { return BUILDINGS.find(b => b.id === id); }

const shopsOpen = s => s.ascensions > 0;

// Tier 1 is always open (shops only after your first Go Global). Owning any copies also counts.
function isUnlocked(s, id) {
  const b = bld(id);
  if (b.stage === 'brew' && !shopsOpen(s)) return false;
  return !b.prev || !!s.unlocked[id] || s.owned[id] > 0;
}

// Next tier is ready to unlock once you own enough of the tier below.
function canUnlock(s, id, free = false) {
  const b = bld(id);
  if (!b.prev || isUnlocked(s, id) || !isUnlocked(s, b.prev)) return false;
  if (b.stage === 'brew' && !shopsOpen(s)) return false;
  return s.owned[b.prev] >= b.need && (free || s.money >= b.unlock);
}

function unlock(s, id, free = false) {
  if (!canUnlock(s, id, free)) return false;
  if (!free) s.money -= bld(id).unlock;
  s.unlocked[id] = true; return true;
}

// ---- Bag sizes ----
const bagLb = s => BAGS[s.bag].lb;
const nextBag = s => BAGS[s.bag + 1];
function canBuyBag(s, free = false) { const n = nextBag(s); return !!n && (free || s.money >= n.cost); }
function buyBag(s, free = false) {
  if (!canBuyBag(s, free)) return false;
  if (!free) s.money -= nextBag(s).cost;
  s.bag++; return true;
}

// ---- Distribution ----
function canBuyDist(s, id, free = false) {
  const i = DISTRIBUTION.findIndex(d => d.id === id), d = DISTRIBUTION[i];
  if (!d || s.dist[id]) return false;
  if (i > 0 && !s.dist[DISTRIBUTION[i - 1].id]) return false;   // in order
  return s.delivered >= d.lbs && (free || s.money >= d.cost);
}

function buyDist(s, id, free = false) {
  if (!canBuyDist(s, id, free)) return false;
  if (!free) s.money -= DISTRIBUTION.find(d => d.id === id).cost;
  s.dist[id] = true; return true;
}

// How many more of a building you can still own (farms are capped at 250 plants).
const room = (s, id) => bld(id).max - s.owned[id];

function costOf(s, id, n = 1) {
  const b = bld(id), k = s.owned[id], r = b.growth;
  // sum of a geometric series: base * r^k * (r^n - 1) / (r - 1)
  return b.cost * Math.pow(r, k) * (Math.pow(r, n) - 1) / (r - 1);
}

function maxAffordable(s, id) {
  const b = bld(id), k = s.owned[id], r = b.growth;
  const n = Math.floor(Math.log(s.money * (r - 1) / (b.cost * Math.pow(r, k)) + 1) / Math.log(r));
  return Math.max(0, Math.min(n, room(s, id)));
}

// Collect every multiplier from upgrades, bean, distribution, prestige and legacy.
// speed = per-building cycle speed (2 means cycles or trips take half as long).
function mods(s) {
  const m = { grow: 1, roast: 1, pack: 1, ship: 1, brew: 1, price: 1, lbPrice: 1, yield: 1, click: 1, all: 1, clickPct: 0, speed: {} };
  const apply = src => {
    for (const k in src) {
      if (k === 'speed') for (const id in src.speed) m.speed[id] = (m.speed[id] || 1) * src.speed[id];
      else if (k === 'clickPct') m.clickPct += src[k];
      else m[k] *= src[k];
    }
  };
  for (const u of UPGRADES) if (s.upgrades[u.id]) apply(u.mods);
  for (const u of STAR_UPGRADES) if (s.starUpgrades[u.id]) apply(u.mods);
  apply(BEANS.find(b => b.id === s.bean).mods);
  for (const d of DISTRIBUTION) if (s.dist[d.id]) m.lbPrice *= d.price;
  const L = s.legacy;
  const perStar = 0.02 + 0.01 * (L.starpower || 0);
  m.all *= 1 + perStar * s.stars;
  m.all *= Math.pow(2, L.supply || 0);
  m.click *= Math.pow(2, L.academy || 0);
  m.click *= 1 + 0.02 * s.owned.kiosk;
  return m;
}

// Seconds per cycle (or trip) for a building type.
function cycleTime(s, id, m = mods(s)) {
  return bld(id).cycle / (m.speed[id] || 1);
}
// What one cycle of all copies handles, in lb. Trucks: total capacity.
// Packers also handle more with bigger bags.
function batch(s, id, m = mods(s)) {
  const b = bld(id);
  if (b.stage === 'ship') return s.owned[id] * b.cap * m.ship * m.all;
  const bags = b.stage === 'pack' ? BAGS[s.bag].output : 1;
  return s.owned[id] * b.rate * b.cycle * bags * m[b.stage] * m.all;
}
const capacity = (s, id, m = mods(s)) => batch(s, id, m);

const lbPrice = (s, m = mods(s)) => LB_PRICE * m.price * m.lbPrice;
const cupPrice = (s, m = mods(s)) => CUP_PRICE * m.price;

// Average capacity per stage in lb/s (batch / cycle time), already multiplied. Trucks count
// as if always sent full. moneyPerSec only counts managed buildings: that is what runs on
// its own (and offline). Shops get the bagged coffee first, up to their capacity.
function rates(s) {
  const m = mods(s);
  const r = { grow: 0, roast: 0, pack: 0, ship: 0, brew: 0, yieldWeighted: 0 };
  const auto = { grow: 0, roast: 0, pack: 0, ship: 0, brew: 0, yieldWeighted: 0 };
  for (const b of BUILDINGS) {
    if (b.stage === 'brew' && !shopsOpen(s)) continue;
    const out = batch(s, b.id, m) / cycleTime(s, b.id, m);
    r[b.stage] += out;
    if (b.stage === 'brew') r.yieldWeighted += out * b.yield;
    if (s.managers[b.id]) {
      auto[b.stage] += out;
      if (b.stage === 'brew') auto.yieldWeighted += out * b.yield;
    }
  }
  r.yield = (r.brew > 0 ? r.yieldWeighted / r.brew : 1) * m.yield;
  r.lbPrice = lbPrice(s, m); r.cupPrice = cupPrice(s, m);
  const made = Math.min(auto.grow, auto.roast, auto.pack), brewed = Math.min(made, auto.brew);
  const shipped = Math.min(made - brewed, auto.ship);
  const autoYield = (auto.brew > 0 ? auto.yieldWeighted / auto.brew : 1) * m.yield;
  r.moneyPerSec = brewed * CUPS_PER_LB * autoYield * r.cupPrice + shipped * r.lbPrice; // steady state
  const stages = ['grow', 'roast', 'pack', 'ship'];
  r.bottleneck = stages.every(k => r[k] === 0) ? null : stages.reduce((a, k) => r[k] < r[a] ? k : a);
  r.clickPower = m.click + m.clickPct * r.moneyPerSec;
  return r;
}

function addMoney(s, n) { s.money += n; s.runMoney += n; s.lifetimeMoney += n; }

// A building finished `n` cycles. Farms grow green beans; roasters, packers and shops take
// what the stage before them has, up to a full batch each.
const INPUT = { roast: 'green', pack: 'roasted', brew: 'packed' };
const OUTPUT = { grow: 'green', roast: 'roasted', pack: 'packed' };
function finishCycles(s, b, n, m) {
  const want = batch(s, b.id, m) * n;
  if (b.stage === 'grow') { s.green += want; return; }
  const used = Math.min(s[INPUT[b.stage]], want);
  s[INPUT[b.stage]] -= used;
  s.fill[b.id] = want > 0 ? used / want : 1;
  if (b.stage === 'brew') addMoney(s, used * CUPS_PER_LB * b.yield * m.yield * cupPrice(s, m));
  else s[OUTPUT[b.stage]] += used;
}

// Click an unmanaged building to run one cycle. (Trucks use sendTruck instead.)
function runBuilding(s, id) {
  if (bld(id).stage === 'ship') return sendTruck(s, id);
  if (!s.owned[id] || s.managers[id] || s.running[id] || !isUnlocked(s, id)) return false;
  s.running[id] = true; s.progress[id] = 0; return true;
}

// Send a truck type on its trip with whatever it has loaded (full or not).
function sendTruck(s, id, m = mods(s)) {
  if (!s.owned[id] || (s.trip[id] || 0) > 0 || !(s.load[id] > 0)) return false;
  s.cargo[id] = s.load[id]; s.load[id] = 0; s.wait[id] = 0;
  s.trip[id] = cycleTime(s, id, m);
  return true;
}

function buyManager(s, id, free = false) {
  const b = bld(id);
  if (!b || s.managers[id] || !isUnlocked(s, id) || (!free && s.money < b.manager)) return false;
  if (!free) s.money -= b.manager;
  s.managers[id] = true; s.running[id] = false; return true;
}

// Advance the simulation by dt seconds. Farms, roasters, packers and shops run their cycles
// in order; then trucks load what is left in the warehouse, leave, and get paid on arrival.
// A managed truck leaves when full, or after loading for two trip-lengths so it never waits forever.
// Returns rates plus `done`: building id -> cycles finished (or lb delivered) this tick.
function tick(s, dt) {
  const r = rates(s), m = mods(s);
  r.done = {};
  let reserve = 0;
  for (const b of BUILDINGS) {
    const id = b.id, managed = s.managers[id];
    if (b.stage === 'ship' || !isUnlocked(s, id) || !s.owned[id]) continue;
    if (b.stage === 'brew' && (managed || s.running[id])) reserve += batch(s, id, m);
    if (!managed && !s.running[id]) continue;
    const ct = cycleTime(s, id, m);
    s.progress[id] = (s.progress[id] || 0) + dt;
    let n = Math.floor(s.progress[id] / ct);
    if (n < 1) continue;
    if (managed) s.progress[id] -= n * ct;
    else { n = 1; s.running[id] = false; s.progress[id] = 0; }
    finishCycles(s, b, n, m);
    r.done[id] = n;
  }
  let avail = Math.max(0, s.packed - reserve);
  for (const b of BUILDINGS) {
    const id = b.id;
    if (b.stage !== 'ship' || !s.owned[id]) continue;
    if (s.trip[id] > 0) {
      s.trip[id] -= dt;
      if (s.trip[id] > 0) continue;
      s.trip[id] = 0;
      addMoney(s, s.cargo[id] * lbPrice(s, m)); s.delivered += s.cargo[id];
      r.done[id] = s.cargo[id]; s.cargo[id] = 0;
    }
    const cap = capacity(s, id, m), load = s.load[id] || 0;
    const take = Math.min(avail, Math.max(0, cap - load));
    s.load[id] = load + take; s.packed -= take; avail -= take;
    if (s.load[id] > 0) s.wait[id] = (s.wait[id] || 0) + dt;
    if (s.managers[id] && s.load[id] > 0 && (s.load[id] >= cap * 0.999 || s.wait[id] >= 2 * cycleTime(s, id, m))) sendTruck(s, id, m);
  }
  // Operations Manager legacy perk
  if (s.legacy.autobuy) {
    s.autoTimer += dt;
    if (s.autoTimer >= 2) {
      s.autoTimer = 0;
      const stage = r.bottleneck || 'grow';
      const best = BUILDINGS.filter(b => b.stage === stage && isUnlocked(s, b.id) && room(s, b.id) > 0 && costOf(s, b.id) <= s.money)
        .sort((x, y) => y.rate / costOf(s, y.id) - x.rate / costOf(s, x.id))[0];
      if (best) buy(s, best.id, 1);
    }
  }
  return r;
}

function click(s) { const r = rates(s); addMoney(s, r.clickPower); return r.clickPower; }

function buy(s, id, n = 1, free = false) {
  const c = costOf(s, id, n);
  if (n < 1 || n > room(s, id) || !isUnlocked(s, id) || (!free && c > s.money)) return false;
  if (!free) s.money -= c;
  s.owned[id] += n; return true;
}

// free = testing mode: ignore cost. Requirements (building counts, max levels) still apply.
function upgradeAvailable(s, u, free = false) {
  if (s.upgrades[u.id]) return false;
  if (u.need && (s.owned[u.need.id] < u.need.n || !isUnlocked(s, u.need.id))) return false;
  return free || s.runMoney >= u.cost * 0.5 || s.money >= u.cost; // reveal once you are close
}

function buyUpgrade(s, id, free = false) {
  const u = UPGRADES.find(x => x.id === id);
  if (!u || !upgradeAvailable(s, u, true) || (!free && s.money < u.cost)) return false;
  if (!free) s.money -= u.cost;
  s.upgrades[id] = true; return true;
}

function canBuyStarUpgrade(s, id, free = false) {
  const u = STAR_UPGRADES.find(x => x.id === id);
  return !!u && !s.starUpgrades[id] && (free || s.stars >= u.stars);
}

function buyStarUpgrade(s, id, free = false) {
  if (!canBuyStarUpgrade(s, id, free)) return false;
  if (!free) s.stars -= STAR_UPGRADES.find(x => x.id === id).stars;
  s.starUpgrades[id] = true; return true;
}

// free = testing mode: picking a locked bean unlocks it.
function setBean(s, id, free = false) {
  if (free && BEANS.some(b => b.id === id)) s.beansUnlocked[id] = true;
  if (s.beansUnlocked[id]) s.bean = id;
}

// ---- Prestige: Sell the Business ----
// Money earned this run needed to sell: 1M, 2M, 4M... resets when you Go Global.
function prestigeCost(s) { return PRESTIGE_MIN * Math.pow(PRESTIGE_GROWTH, s.sales || 0); }
function pendingStars(s) { return s.runMoney < prestigeCost(s) ? 0 : Math.floor(10 * Math.cbrt(s.runMoney / 1e6)); }

function prestige(s) {
  const gain = pendingStars(s);
  if (gain <= 0) return 0;
  s.stars += gain; s.starsEarned += gain; s.prestiges++; s.sales = (s.sales || 0) + 1;
  for (const b of BEANS) if (s.starsEarned >= b.stars) s.beansUnlocked[b.id] = true;
  newRun(s);
  return gain;
}

// ---- Ascension: Go Global (the first one opens coffee shops) ----
function pendingTokens(s) { return s.stars < ASCEND_MIN ? 0 : Math.floor(5 * Math.sqrt(s.stars / ASCEND_MIN)); }

function ascend(s) {
  const gain = pendingTokens(s);
  if (gain <= 0) return 0;
  s.tokens += gain; s.ascensions++;
  s.stars = 0; s.starsEarned = 0; s.sales = 0; s.starUpgrades = {};
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
  return 0.5 + Math.min(0.5, 0.01 * s.owned.flagship);
}

function applyOffline(s, now = Date.now()) {
  const secs = Math.min(8 * 3600, Math.max(0, (now - s.lastSave) / 1000));
  if (secs < 10) return { secs: 0, money: 0 };
  const r = rates(s);
  const money = r.moneyPerSec * secs * offlineEfficiency(s);
  addMoney(s, money);
  return { secs, money };
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
const money = n => '$' + (n > 0 && n < 10 && n % 1 ? n.toFixed(2) : fmt(n));

const Engine = {
  GROWTH, FARM_SIZE, BUILDINGS, STAGE_ORDER, BAGS, DISTRIBUTION, BEANS, UPGRADES, STAR_UPGRADES, LEGACY,
  PRESTIGE_MIN, ASCEND_MIN, UNLOCK_NEED, CUPS_PER_LB,
  newGame, newRun, shopsOpen, isUnlocked, canUnlock, unlock, bagLb, nextBag, canBuyBag, buyBag,
  canBuyDist, buyDist, room, prestigeCost, costOf, maxAffordable, mods, cycleTime, batch, capacity,
  lbPrice, cupPrice, rates, tick, click, buy, runBuilding, sendTruck, buyManager, upgradeAvailable, buyUpgrade,
  canBuyStarUpgrade, buyStarUpgrade,
  setBean, pendingStars, prestige, pendingTokens, ascend, buyLegacy, offlineEfficiency, applyOffline, fmt, money,
};
if (typeof module !== 'undefined') module.exports = Engine;
