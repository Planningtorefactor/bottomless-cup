# Bottomless Cup

Idle clicker game about coffee, headed for Steam. Plain HTML/JS, wrapped in Electron for desktop.
The owner is new to game dev: explain changes in plain terms and keep the code simple.

## How it fits together
- `src/engine.js` holds all game rules and balance numbers. It has no DOM code, so it also runs in Node.
  The chain, in lb: farms (plants, 250 per farm) -> roasters -> packing (bag size 8 oz to 50 lb; bigger bags make packing cycles faster) -> trucks
  (load until full or sent early, paid on delivery). Coffee shops open after the first Go Global.
  Buildings, distribution, beans, upgrades, Legacy perks, prestige/ascension formulas and offline progress all live here.
- `src/ui.js` is the browser interface (tabs, buttons, game loop, saving to localStorage, `window.BC` dev cheats).
- `src/index.template.html` holds the layout and CSS. `/*__ENGINE__*/` and `/*__UI__*/` are replaced at build time.
- `tools/build.js` writes `dist/index.html` and `dist/desktop.html`. Never edit `dist/` by hand.
- `tools/simulate.js` is a greedy bot that prints pacing (time to $1M, each sale, first and second ascension).
  `--short` prints only the milestones.
- `main.js` is the Electron window. `backgroundThrottling` is off so the game keeps running when minimized.

## Commands
- `node tools/build.js` rebuilds dist/ (run after every source edit)
- `node tools/simulate.js` checks pacing after any balance change
- `npm start` builds and opens the Electron window (`npm run start:nosandbox` on Ubuntu if the SUID sandbox error appears)

## Rules
- Balance changes go in `src/engine.js`. Run the simulator afterwards and report the before and after times.
- Keep saves backward compatible. Loading merges the saved JSON over `newGame()`, so new fields need defaults there.
  The save key is `bottomless-cup-save-v3` (farms/roasters/packing/trucks); older v1 and v2 saves are not loaded.
- The design doc with the current numbers lives in Claude Docs. Mention which sections a change affects.
- Current pacing targets: first prestige at about 25 min, first ascension at about 3.5 h.
- Pacing as of bag sizes speeding up packing: first sale ~26 min, first ascension ~3 h 29 m, second ~3 h 20 m.
