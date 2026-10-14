// Balance simulator: plays the game with a simple greedy bot and reports pacing.
// Run: node tools/simulate.js
const E = require('../src/engine.js');

// Money per second if every building ran nonstop (managers or not) and trucks left full.
function capMoney(s) {
  const r = E.rates(s);
  const made = Math.min(r.grow, r.roast, r.pack), brewed = Math.min(made, r.brew);
  return brewed * E.CUPS_PER_LB * r.yield * r.cupPrice + Math.min(made - brewed, r.ship) * r.lbPrice;
}

function bestBean(s) {
  let best = s.bean, bestV = -1;
  for (const b of E.BEANS) {
    if (!s.beansUnlocked[b.id]) continue;
    const old = s.bean; s.bean = b.id;
    const v = capMoney(s); s.bean = old;
    if (v > bestV) { bestV = v; best = b.id; }
  }
  s.bean = best;
}

// Active player: restarts every idle unmanaged building once every CLICK_GAP seconds, and
// sends an unmanaged truck when it is full or has been loading for one trip-length.
const CLICK_GAP = 2;
function botClick(s, t) {
  if (t % CLICK_GAP !== 0) return;
  for (const b of E.BUILDINGS) {
    if (b.stage !== 'ship') { E.runBuilding(s, b.id); continue; }
    if (s.managers[b.id]) continue;
    if (s.load[b.id] >= E.capacity(s, b.id) * 0.999 || s.wait[b.id] >= E.cycleTime(s, b.id)) E.sendTruck(s, b.id);
  }
}

function botStep(s) {
  // hire managers for buildings we own, cheapest first: right away if one costs under a minute
  // of full production, otherwise once we hold 3x the price (so hiring doesn't starve buying)
  for (const b of [...E.BUILDINGS].sort((x, y) => x.manager - y.manager))
    if (s.owned[b.id] && !s.managers[b.id] && s.money >= (b.manager <= 60 * capMoney(s) ? 1 : 3) * b.manager) E.buyManager(s, b.id);
  // unlock tiers and distribution as soon as we can
  for (const b of E.BUILDINGS) E.unlock(s, b.id);
  for (const d of E.DISTRIBUTION) E.buyDist(s, d.id);
  // buy every affordable upgrade
  for (const u of E.UPGRADES) if (E.upgradeAvailable(s, u) && s.money >= u.cost) E.buyUpgrade(s, u.id);
  // buy the affordable building (or bigger bag) that adds the most money/sec per dollar
  for (let i = 0; i < 50; i++) {
    const base = capMoney(s);
    let pick = null, bestV = 0;
    const consider = (cost, tryIt, undo, doIt) => {
      if (cost > s.money) return;
      tryIt(); const gain = capMoney(s) - base; undo();
      if (gain > 1e-9 * base && gain / cost > bestV) { bestV = gain / cost; pick = doIt; }
    };
    for (const b of E.BUILDINGS) {
      if (!E.isUnlocked(s, b.id) || E.room(s, b.id) < 1) continue;
      consider(E.costOf(s, b.id), () => s.owned[b.id]++, () => s.owned[b.id]--, () => E.buy(s, b.id, 1));
    }
    if (E.nextBag(s)) consider(E.nextBag(s).cost, () => s.bag++, () => s.bag--, () => E.buyBag(s));
    // nothing adds money yet: buy the bottleneck's cheapest building
    if (!pick) {
      const b = E.BUILDINGS.filter(x => x.stage === (E.rates(s).bottleneck || 'grow') && E.isUnlocked(s, x.id) && E.room(s, x.id) > 0)
        .sort((x, y) => E.costOf(s, x.id) - E.costOf(s, y.id))[0];
      if (b && E.costOf(s, b.id) <= s.money) pick = () => E.buy(s, b.id, 1);
    }
    if (!pick) break;
    pick();
  }
}

function playRun(s, prestigeRule, maxSecs, clickSecs = 120, cps = 4) {
  let t = 0;
  bestBean(s);
  while (t < maxSecs) {
    if (t < clickSecs) for (let i = 0; i < cps; i++) E.click(s);
    botClick(s, t);
    E.tick(s, 1); t++;
    if (t % 5 === 0) botStep(s);
    if (prestigeRule(s, t)) return t;
  }
  return t;
}

const hms = sec => `${Math.floor(sec / 3600)}h ${Math.floor(sec % 3600 / 60)}m`;
const quiet = process.argv.includes('--short');

// --- First run milestones ---
{
  const s = E.newGame();
  const marks = [1e3, 1e4, 1e5, 1e6, 1e7];
  let mi = 0, t = 0, hired = 0, unl = 0;
  while (mi < marks.length && t < 6 * 3600) {
    if (t < 120) for (let i = 0; i < 4; i++) E.click(s);
    botClick(s, t);
    E.tick(s, 1); t++;
    if (t % 5 === 0) botStep(s);
    const h = Object.keys(s.managers).length, u = Object.keys(s.unlocked).length + Object.keys(s.dist).length;
    if (!quiet && h > hired) { hired = h; console.log(`run1 manager #${h} at ${hms(t)}: ${Object.keys(s.managers).join(', ')}`); }
    if (!quiet && u > unl) { unl = u; console.log(`run1 unlock at ${hms(t)}: ${[...Object.keys(s.unlocked), ...Object.keys(s.dist)].join(', ')}`); }
    if (s.runMoney >= marks[mi]) {
      const r = E.rates(s);
      console.log(`run1 ${E.money(marks[mi]).padEnd(8)} at ${hms(t)}  $/s ${E.fmt(r.moneyPerSec)}  grow/roast/pack/ship ${E.fmt(r.grow)}/${E.fmt(r.roast)}/${E.fmt(r.pack)}/${E.fmt(r.ship)}  bag ${E.BAGS[s.bag].name}`);
      mi++;
    }
  }
}

// --- Full ascension cycle: prestige when pending stars >= max(10, 60% of current stars) ---
const s = E.newGame();
let total = 0;
const rule = st => { const p = E.pendingStars(st); return p >= Math.max(10, st.stars * 0.6); };
for (let run = 1; run <= 200 && s.stars < E.ASCEND_MIN; run++) {
  const t = playRun(s, rule, 12 * 3600);
  total += t;
  const cost = E.prestigeCost(s), g = E.prestige(s);
  if (!quiet) console.log(`sale ${run}: target ${E.money(cost)}, run ${hms(t)}, +${g} stars -> ${s.stars} (total ${hms(total)}) bean ${s.bean}`);
}
console.log(`Ascension 1 reached at ${hms(total)}, tokens ${E.pendingTokens(s)}`);
E.ascend(s);
['headstart', 'nightshift', 'vault'].forEach(p => E.buyLegacy(s, p));
let total2 = 0, first2 = 0;
for (let run = 1; run <= 200 && s.stars < E.ASCEND_MIN; run++) {
  const t = playRun(s, rule, 12 * 3600); total2 += t; if (run === 1) first2 = t; E.prestige(s);
}
console.log(`Ascension 2 cycle (coffee shops open; Head Start, Night Shift, Seed Vault): ${hms(total2)}, first run ${hms(first2)}`);
