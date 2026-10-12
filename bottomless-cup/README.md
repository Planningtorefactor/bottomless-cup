# Bottomless Cup (prototype)

An idle coffee game: farms grow green beans, roasters roast them, brewers turn them into cups.
Prestige = **Open a New Café** (Reputation Stars). Ascension = **Go Global** (Origin Tokens, Legacy perks).

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
- **Check pacing without playing:** `node tools/simulate.js` prints when a bot hits 1K/1M cups,
  each prestige, and the first ascension.
- **Cheats for testing:** press `Ctrl+Shift+I` to open DevTools, go to Console, and type:
  - `BC.give(1e6)` add a million cups
  - `BC.skip(3600)` fast-forward one hour of production
  - `BC.stars(1000)` add Reputation Stars (unlocks beans, enables Go Global)
  - `BC.tokens(10)` add Origin Tokens for Legacy perks
  - `BC.state()` look at the whole save
- **Start fresh:** Save tab, then Erase save.
