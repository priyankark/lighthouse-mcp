import { test } from 'node:test';
import assert from 'node:assert/strict';
import { nextRelease, safeDependencyUpdate } from '../.github/scripts/release-lib.mjs';

test('release planning is idempotent and honors explicit versions', () => {
  assert.equal(nextRelease('1.2.3', '1.2.3', false), null);
  assert.equal(nextRelease('1.2.3', '1.2.3', true), '1.2.4');
  assert.equal(nextRelease('1.2.4', '1.2.3', true), '1.2.4');
  assert.equal(nextRelease('2.0.0', '1.2.3', false), '2.0.0');
  assert.throws(() => nextRelease('1.2.2', '1.2.3', true));
  assert.throws(() => nextRelease('1.2.4-beta.1', '1.2.3', true));
});

test('automatic dependency merges reject breaking changes and unrelated edits', () => {
  const pkg = { name: 'example', version: '1.0.0', dependencies: { dep: '^1.0.0' }, scripts: { test: 'node --test' } };
  const lock = version => ({ packages: { 'node_modules/dep': { version } } });
  assert.equal(safeDependencyUpdate(pkg, { ...pkg, dependencies: { dep: '^1.1.0' } }, lock('1.0.0'), lock('1.1.0')), true);
  assert.equal(safeDependencyUpdate(pkg, pkg, lock('1.0.0'), lock('2.0.0')), false);
  assert.equal(safeDependencyUpdate(pkg, pkg, lock('0.1.0'), lock('0.2.0')), false);
  assert.equal(safeDependencyUpdate(pkg, pkg, lock('1.1.0'), lock('1.0.0')), false);
  assert.equal(safeDependencyUpdate(pkg, { ...pkg, scripts: { test: 'echo bypass' } }, lock('1.0.0'), lock('1.0.1')), false);
  assert.equal(safeDependencyUpdate(pkg, { ...pkg, version: '1.0.1' }, lock('1.0.0'), lock('1.0.1')), false);
  assert.equal(safeDependencyUpdate(pkg, pkg, lock('1.0.0'), lock('1.1.0-beta.1')), false);
});
