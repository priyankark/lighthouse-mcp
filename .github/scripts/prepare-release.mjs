import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { execFileSync, spawnSync } from 'node:child_process';
import { nextRelease } from './release-lib.mjs';

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const response = await fetch('https://registry.npmjs.org/' + encodeURIComponent(pkg.name), {
  headers: { 'Cache-Control': 'no-cache' }, signal: AbortSignal.timeout(30_000),
});
if (!response.ok) throw new Error('npm metadata request failed: ' + response.status);
const metadata = await response.json();
const latest = metadata['dist-tags'].latest;
const tag = 'refs/tags/v' + latest;
const tagged = spawnSync('git', ['rev-parse', '--verify', tag], { stdio: 'ignore' }).status === 0;
if (tagged && spawnSync('git', ['merge-base', '--is-ancestor', tag, 'HEAD']).status !== 0) {
  throw new Error('Latest release tag is not an ancestor of this checkout');
}
const diff = tagged ? spawnSync('git', ['diff', '--quiet', tag, '--',
  'package.json', 'package-lock.json', 'src', 'server.json'], { stdio: 'inherit' }).status : 1;
if (diff !== 0 && diff !== 1) throw new Error('Cannot compare release contents');
const version = nextRelease(pkg.version, latest, diff === 1);
if (!version) {
  appendFileSync(process.env.GITHUB_OUTPUT, 'publish=false\nversion=' + latest + '\n');
  console.log('No package changes since v' + latest);
  process.exit(0);
}
if (version !== pkg.version) {
  execFileSync('npm', ['version', version, '--no-git-tag-version', '--ignore-scripts'], { stdio: 'inherit' });
}
if (existsSync('server.json')) {
  const server = JSON.parse(readFileSync('server.json', 'utf8'));
  server.version = version;
  for (const item of server.packages || []) if (item.identifier === pkg.name) item.version = version;
  writeFileSync('server.json', JSON.stringify(server, null, 2) + '\n');
}
appendFileSync(process.env.GITHUB_OUTPUT, 'publish=true\nversion=' + version + '\n');
console.log('Prepared ' + pkg.name + '@' + version);
