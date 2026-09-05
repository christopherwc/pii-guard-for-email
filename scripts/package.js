const path = require('path');
const { execFileSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const distDir = path.join(rootDir, 'dist');
const version = require(path.join(rootDir, 'manifest.json')).version;
const zipName = `pii-guard-for-email-${version}.zip`;
const zipPath = path.join(rootDir, zipName);

execFileSync('rm', ['-f', zipPath]);
execFileSync('zip', ['-r', zipPath, '.'], { cwd: distDir, stdio: 'inherit' });

console.log(`Packaged ${zipName}`);
