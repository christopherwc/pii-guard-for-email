const fs = require('fs');
const path = require('path');
const esbuild = require('esbuild');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');

fs.rmSync(distDir, { recursive: true, force: true });
fs.mkdirSync(distDir, { recursive: true });

const entries = [
  { in: 'src/content/content.js', out: 'content.js' },
  { in: 'src/background/background.js', out: 'background.js' },
  { in: 'src/popup/popup.js', out: 'popup.js' },
  { in: 'src/options/options.js', out: 'options.js' },
];

for (const entry of entries) {
  esbuild.buildSync({
    entryPoints: [path.join(rootDir, entry.in)],
    outfile: path.join(distDir, entry.out),
    bundle: true,
    format: 'iife',
    target: 'chrome110',
    logLevel: 'info',
  });
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

copyFile(path.join(rootDir, 'manifest.json'), path.join(distDir, 'manifest.json'));
copyFile(path.join(rootDir, 'src/popup/popup.html'), path.join(distDir, 'popup.html'));
copyFile(path.join(rootDir, 'src/popup/popup.css'), path.join(distDir, 'popup.css'));
copyFile(path.join(rootDir, 'src/options/options.html'), path.join(distDir, 'options.html'));
copyFile(path.join(rootDir, 'src/options/options.css'), path.join(distDir, 'options.css'));
copyFile(path.join(rootDir, 'src/ui/warningDialog.css'), path.join(distDir, 'content.css'));

for (const size of [16, 48, 128]) {
  copyFile(
    path.join(rootDir, `icons/icon${size}.png`),
    path.join(distDir, `icons/icon${size}.png`)
  );
}

console.log(`Built extension into ${distDir}`);
