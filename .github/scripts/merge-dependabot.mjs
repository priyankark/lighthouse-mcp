import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { safeDependencyUpdate } from './release-lib.mjs';

const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
const run = event.workflow_run;
const repo = process.env.GH_REPO;
const api = (endpoint, ...args) => JSON.parse(execFileSync('gh', ['api', endpoint, ...args], { encoding: 'utf8' }));
if (run.event !== 'pull_request' || run.conclusion !== 'success') process.exit(0);
const candidates = api('repos/' + repo + '/commits/' + run.head_sha + '/pulls');
for (const candidate of candidates) {
  const pr = api('repos/' + repo + '/pulls/' + candidate.number);
  if (pr.state !== 'open' || pr.draft || pr.user.login !== 'dependabot[bot]' ||
      pr.base.ref !== 'main' || pr.base.repo.full_name !== repo || pr.head.repo?.full_name !== repo ||
      pr.head.sha !== run.head_sha) continue;
  const files = api('repos/' + repo + '/pulls/' + pr.number + '/files?per_page=100');
  if (pr.changed_files > 2 || files.some(file => !['package.json', 'package-lock.json'].includes(file.filename))) {
    console.log('PR #' + pr.number + ' needs review: changes outside npm manifests');
    continue;
  }
  const jsonAt = (file, sha) => {
    const data = api('repos/' + repo + '/contents/' + file + '?ref=' + sha);
    return JSON.parse(Buffer.from(data.content, 'base64').toString('utf8'));
  };
  if (!safeDependencyUpdate(jsonAt('package.json', pr.base.sha), jsonAt('package.json', pr.head.sha),
      jsonAt('package-lock.json', pr.base.sha), jsonAt('package-lock.json', pr.head.sha))) {
    console.log('PR #' + pr.number + ' needs review: major, pre-release, downgrade, or other manifest changes');
    continue;
  }
  const merged = api('repos/' + repo + '/pulls/' + pr.number + '/merge', '--method', 'PUT',
    '-f', 'merge_method=squash', '-f', 'sha=' + pr.head.sha);
  if (!merged.merged) throw new Error('Merge did not complete: ' + merged.message);
  // GITHUB_TOKEN merges do not trigger push workflows; dispatch is explicitly supported.
  execFileSync('gh', ['workflow', 'run', 'publish.yml', '--repo', repo, '--ref', 'main'], { stdio: 'inherit' });
  console.log('Merged #' + pr.number + ' and started the release pipeline');
}
