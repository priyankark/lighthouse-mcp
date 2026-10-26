import { isDeepStrictEqual } from 'node:util';

export function parseVersion(value) {
  if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error('Expected a stable semver: ' + value);
  return value.split('.').map(Number);
}

export function compareVersions(a, b) {
  const left = parseVersion(a), right = parseVersion(b);
  for (let i = 0; i < 3; i++) if (left[i] !== right[i]) return Math.sign(left[i] - right[i]);
  return 0;
}

export function nextRelease(current, latest, changed) {
  const comparison = compareVersions(current, latest);
  if (comparison < 0) throw new Error('Repository version is behind npm; sync main before releasing');
  if (comparison > 0) return current; // Retry an unpublished release, or honor a manual version bump.
  if (!changed) return null;
  const [major, minor, patch] = parseVersion(current);
  return [major, minor, patch + 1].join('.');
}

export function safeDependencyUpdate(before, after, oldLock, newLock) {
  const fields = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
  const oldMetadata = structuredClone(before), newMetadata = structuredClone(after);
  for (const field of fields) {
    if (!isDeepStrictEqual(Object.keys(before[field] || {}).sort(), Object.keys(after[field] || {}).sort())) return false;
    delete oldMetadata[field];
    delete newMetadata[field];
  }
  if (!isDeepStrictEqual(oldMetadata, newMetadata) || !oldLock.packages || !newLock.packages) return false;
  let updated = false;
  for (const [path, next] of Object.entries(newLock.packages)) {
    if (!path) continue;
    const previous = oldLock.packages[path];
    if (!previous || previous.version === next.version) continue;
    try {
      const oldVersion = parseVersion(previous.version), newVersion = parseVersion(next.version);
      // Treat 0.x minor updates as breaking too.
      if (oldVersion[0] !== newVersion[0] || (oldVersion[0] === 0 && oldVersion[1] !== newVersion[1]) ||
          compareVersions(next.version, previous.version) < 0) return false;
    } catch { return false; }
    updated = true;
  }
  return updated;
}
