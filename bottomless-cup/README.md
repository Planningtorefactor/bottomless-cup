# Bottomless Cup (prototype)

An idle coffee game: plant coffee on your farms (250 plants each), roast it, pack it into bags
(8 oz up to 50 lb sacks; bigger bags pack more per cycle), and load it onto trucks that drive it to the buyer. Send a truck when it's full,
or early if you want the money sooner. Grow into your own distribution network. Prestige = **Sell the Business**
(Reputation Stars). Ascension = **Go Global** (Origin Tokens, Legacy perks); the first one opens **coffee shops**,
which brew your coffee into cups that sell for more.

Buildings produce in **cycles** (each type has its own timer bar; owning more makes each batch bigger).
Click a building to run one cycle, or hire its **manager** so it runs on its own (and offline).
Bigger farms, trucks and shops unlock in the **Expansion** tab.

## Folder layout

```
src/engine.js            all game rules and balance numbers (no UI)
src/ui.js                the browser interface
src/index.template.html  page layout and styles
tools/build.js           combines the three into dist/
tools/simulate.js        bot that plays the game and prints pacing
main.js                  Electron window (the Steam build)
dist/desktop.html        ready-to-play page (already built)
```

## Run it on Linux

### Option 1: in a browser (no installs)

```bash
firefox dist/desktop.html      # or: google-chrome dist/desktop.html
```

Progress saves to that browser automatically.

### Option 2: as a desktop app with Electron (how it ships on Steam)

Requires Node.js 18 or newer (`node --version`). On Ubuntu, if you need it:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

Then, from this folder:

```bash
npm install      # downloads Electron into node_modules (about 100 MB, once)
npm start        # rebuilds dist/ and opens the game window
```

If Electron exits with an error about the **SUID sandbox** (common on Ubuntu 24.04+,
because of AppArmor), run this instead for local testing:

```bash
npm run start:nosandbox
```

## Test it

- **Change balance:** edit numbers in `src/engine.js`, then `npm start` (or `node tools/build.js`
  and refresh the browser).
- **Check pacing without playing:** `node tools/simulate.js` prints when a bot hits $1K/$1M,
  each prestige, and the first ascension.
- **Cheats for testing:** press `Ctrl+Shift+I` to open DevTools, go to Console, and type:
  - `BC.give(1e6)` add a million dollars
  - `BC.skip(3600)` fast-forward one hour of production
  - `BC.stars(1000)` add Reputation Stars (unlocks beans, enables Go Global)
  - `BC.tokens(10)` add Origin Tokens for Legacy perks
  - `BC.free()` toggle free buying for buildings, upgrades and Legacy perks (also a button on the Build, Upgrades and Go Global tabs). Requirements still apply, and it turns off on reload.
  - `BC.state()` look at the whole save
- **Start fresh:** Save tab, then Erase save.
