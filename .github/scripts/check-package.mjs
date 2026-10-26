import { mkdtempSync, readFileSync, writeFileSync, rmSync, accessSync, constants } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const root = process.cwd();
const temporary = mkdtempSync(join(tmpdir(), pkg.name + '-package-'));
try {
  const [archive] = JSON.parse(execFileSync('npm', ['pack', '--json', '--pack-destination', temporary], { encoding: 'utf8' }));
  writeFileSync(join(temporary, 'package.json'), JSON.stringify({ private: true, name: 'release-check', version: '1.0.0' }));
  const env = { ...process.env, PUPPETEER_SKIP_DOWNLOAD: 'true' };
  execFileSync('npm', ['install', '--ignore-scripts', '--no-fund', join(temporary, archive.filename)],
    { cwd: temporary, env, stdio: 'inherit' });
  const installed = join(temporary, 'node_modules', pkg.name);
  const manifest = JSON.parse(readFileSync(join(installed, 'package.json'), 'utf8'));
  if (manifest.version !== pkg.version) throw new Error('Installed package version mismatch');
  const binary = join(temporary, 'node_modules', '.bin', pkg.name);
  accessSync(binary, constants.X_OK);
  execFileSync('npm', ['audit', '--omit=dev', '--audit-level=low'], { cwd: temporary, env, stdio: 'inherit' });
  execFileSync(process.execPath, [resolve(root, 'test/smoke.mjs')], {
    cwd: root, env: { ...env, MCP_ENTRYPOINT: binary }, stdio: 'inherit',
  });
  console.log('Published artifact layout, executable, audit, and browser smoke checks passed');
} finally {
  rmSync(temporary, { recursive: true, force: true });
}
