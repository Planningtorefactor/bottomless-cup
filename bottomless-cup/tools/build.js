// Builds dist/index.html (a single self-contained page) from the template, engine and UI.
// Run: node tools/build.js
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const read = f => fs.readFileSync(path.join(root, f), 'utf8');

const html = read('src/index.template.html')
  .replace('/*__ENGINE__*/', () => read('src/engine.js'))
  .replace('/*__UI__*/', () => read('src/ui.js'));

fs.mkdirSync(path.join(root, 'dist'), { recursive: true });
// index.html: body-only page (used for the web preview, which adds its own <html> wrapper)
fs.writeFileSync(path.join(root, 'dist/index.html'), html);
// desktop.html: full document for Electron / Steam
const full = '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n' +
  '<meta name="viewport" content="width=device-width, initial-scale=1">\n</head>\n<body style="margin:0">\n' + html + '\n</body>\n</html>\n';
fs.writeFileSync(path.join(root, 'dist/desktop.html'), full);
console.log('Built dist/index.html and dist/desktop.html (' + Math.round(html.length / 1024) + ' KB)');
