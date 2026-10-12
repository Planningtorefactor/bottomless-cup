// Balance simulator: plays the game with a simple greedy bot and reports pacing.
// Run: node tools/simulate.js
const E = require('../src/engine.js');

function bestBean(s) {
  let best = s.bean, bestV = -1;
  for (const b of E.BEANS) {
    if (!s.beansUnlocked[b.id]) continue;
    const old = s.bean; s.bean = b.id;
    const v = E.rates(s).cupsPerSec; s.bean = old;
    if (v > bestV) { bestV = v; best = b.id; }
  }
  s.bean = best;
}

function botStep(s, t) {
  // buy every affordable upgrade
  for (const u of E.UPGRADES) if (E.upgradeAvailable(s, u) && s.cups >= u.cost) E.buyUpgrade(s, u.id);
  // buy for the bottleneck stage, best output per cup
  for (let i = 0; i < 50; i++) {
    const r = E.rates(s);
    const stage = r.bottleneck || 'farm';
    const pick = E.BUILDINGS.filter(b => b.stage === stage)
      .sort((x, y) => y.rate / E.costOf(s, y.id) - x.rate / E.costOf(s, x.id))[0];
    if (E.costOf(s, pick.id) > s.cups) break;
    E.buy(s, pick.id, 1);
  }
}

function playRun(s, prestigeRule, maxSecs, clickSecs = 120, cps = 4) {
  let t = 0;
  bestBean(s);
  while (t < maxSecs) {
    if (t < clickSecs) for (let i = 0; i < cps; i++) E.click(s);
    E.tick(s, 1); t++;
    if (t % 5 === 0) botStep(s, t);
    if (prestigeRule(s, t)) return t;
  }
  return t;
}

const hms = sec => `${Math.floor(sec / 3600)}h ${Math.floor(sec % 3600 / 60)}m`;

// --- First run milestones ---
{
  const s = E.newGame();
  const marks = [1e3, 1e4, 1e5, 1e6, 1e7];
  let mi = 0, t = 0;
  while (mi < marks.length && t < 6 * 3600) {
    if (t < 120) for (let i = 0; i < 4; i++) E.click(s);
    E.tick(s, 1); t++;
    if (t % 5 === 0) botStep(s, t);
    if (s.runCups >= marks[mi]) {
      const r = E.rates(s);
      console.log(`run1 ${E.fmt(marks[mi]).padEnd(8)} at ${hms(t)}  cups/s ${E.fmt(r.cupsPerSec)}  F/R/B ${E.fmt(r.farm)}/${E.fmt(r.roast)}/${E.fmt(r.brew)}`);
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
  const g = E.prestige(s);
  console.log(`prestige ${run}: run ${hms(t)}, +${g} stars -> ${s.stars} (total ${hms(total)}) bean ${s.bean}`);
}
console.log(`Ascension 1 reached at ${hms(total)}, tokens ${E.pendingTokens(s)}`);
E.ascend(s);
['headstart', 'nightshift', 'vault'].forEach(p => E.buyLegacy(s, p));
let total2 = 0;
for (let run = 1; run <= 200 && s.stars < E.ASCEND_MIN; run++) {
  const t = playRun(s, rule, 12 * 3600); total2 += t; E.prestige(s);
}
console.log(`Ascension 2 cycle (with Head Start, Night Shift, Seed Vault): ${hms(total2)}`);
