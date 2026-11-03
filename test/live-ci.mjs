import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import LiveReporter from './live-reporter.mjs';
import config from '../playwright.live.config.mjs';

const workflow = fs.readFileSync('.github/workflows/live.yml', 'utf8');
assert.match(workflow, /^name: thewheel$/m);
assert.match(workflow, /^on:\n  workflow_dispatch:\n  pull_request:\n    types: \[labeled\]\s*\npermissions:/m);
assert.doesNotMatch(workflow, /^\s+(push|pull_request_target|schedule|workflow_run|synchronize|opened|reopened):/m);
assert.match(workflow, /if: github\.event_name == 'workflow_dispatch' \|\| github\.event\.label\.name == 'run-live'/);
assert.match(workflow, /ref: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
assert.match(workflow, /LIVE_SOURCE_COMMIT: \$\{\{ github\.event\.pull_request\.head\.sha \|\| github\.sha \}\}/);
assert.match(workflow, /sourceCommit: process\.env\.LIVE_SOURCE_COMMIT/);
assert.doesNotMatch(workflow, /process\.env\.GITHUB_SHA/);
assert.doesNotMatch(fs.readFileSync('test/live-reporter.mjs', 'utf8'), /process\.env\.GITHUB_SHA/);
assert.match(workflow, /group: thewheel-live-sepolia/);
assert.match(workflow, /runs-on: ubuntu-latest/);
assert.match(workflow, /timeout-minutes: 15/);
assert.match(workflow, /node-version-file: \.nvmrc/);
assert.equal(fs.readFileSync('.nvmrc', 'utf8').trim(), '22');
for (const command of ['npm ci', 'npx playwright install --with-deps chromium', 'npm run rpc:probe', 'npm run test:live']) assert.ok(workflow.includes(`run: ${command}`));
assert.doesNotMatch(workflow, /continue-on-error|secrets\.|PRIVATE_KEY|KEEPER_|eth_sendTransaction|signTransaction/);
assert.match(workflow, /contents: read/);
assert.match(workflow, /persist-credentials: false/);
assert.match(workflow, /if: always\(\)/);
for (const directory of ['playwright-report/', 'test-results/', 'live-qualification/']) assert.ok(workflow.includes(directory));
assert.ok(config.reporter.some(([name]) => name === 'html'));
assert.ok(config.reporter.some(([name]) => name === './test/live-reporter.mjs'));
assert.equal(config.testMatch, '**/live.spec.mjs');
assert.equal(config.retries, 0);
assert.doesNotMatch(fs.readFileSync('.github/workflows/ci.yml', 'utf8'), /npm run test:live|live_rpc/);

// A pull_request run's GITHUB_SHA is a synthetic merge commit, not the tested head.
const originalLive = process.env.LIVE_SOURCE_COMMIT, originalGithub = process.env.GITHUB_SHA;
try {
  process.env.GITHUB_SHA = 'b'.repeat(40);
  process.env.LIVE_SOURCE_COMMIT = 'a'.repeat(40);
  const reporter = new LiveReporter({ outputFile: '.cache/live-reporter-tests/pr-head.json' });
  reporter.onBegin({}, { allTests: () => [{}] });
  reporter.onError(new Error('Synthetic setup failure; no live requests'));
  await reporter.onEnd({ status: 'failed' });
  assert.equal(JSON.parse(fs.readFileSync(reporter.outputFile)).sourceCommit, 'a'.repeat(40), 'PR head must win over GITHUB_SHA merge commit in failure artifacts');
  delete process.env.LIVE_SOURCE_COMMIT;
  assert.equal(new LiveReporter().record.sourceCommit, execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), 'checked-out commit wins over a merge-commit GITHUB_SHA when the explicit source env is missing');
} finally {
  if (originalLive === undefined) delete process.env.LIVE_SOURCE_COMMIT; else process.env.LIVE_SOURCE_COMMIT = originalLive;
  if (originalGithub === undefined) delete process.env.GITHUB_SHA; else process.env.GITHUB_SHA = originalGithub;
}

const directory = path.resolve('.cache/live-reporter-tests');
fs.mkdirSync(directory, { recursive: true });
const rpc = { endpoints: [{ url: 'https://example.invalid', error: 'Failed to fetch' }], error: 'Need at least two public CORS Sepolia RPCs' };
for (const scenario of [
  { name: 'pass', overall: 'passed', status: 'passed', expectedStatus: 'passed', count: 1, qualified: true },
  { name: 'rpc-failure', overall: 'failed', status: 'failed', expectedStatus: 'passed', count: 1, qualified: false },
  { name: 'skipped', overall: 'passed', status: 'skipped', expectedStatus: 'passed', count: 1, qualified: false, override: true },
  { name: 'empty', overall: 'passed', count: 0, qualified: false, override: true },
  { name: 'missing-test', overall: 'passed', count: 1, qualified: false, override: true },
  { name: 'expected-failure', overall: 'passed', status: 'failed', expectedStatus: 'failed', count: 1, qualified: false, override: true },
  { name: 'runner-error', overall: 'failed', count: 1, error: true, qualified: false },
  { name: 'interrupted', overall: 'interrupted', count: 1, qualified: false },
]) {
  const outputFile = path.join(directory, `${scenario.name}.json`);
  const reporter = new LiveReporter({ outputFile });
  reporter.onBegin({}, { allTests: () => Array.from({ length: scenario.count }, () => ({})) });
  assert.equal(JSON.parse(fs.readFileSync(outputFile)).qualified, false);
  if (scenario.status) {
    reporter.onTestEnd({ title: 'live qualification fixture', expectedStatus: scenario.expectedStatus }, {
      status: scenario.status, duration: 100, retry: 0,
      errors: scenario.status === 'failed' ? [{ message: 'RPC unavailable' }] : [],
      attachments: [{ name: 'public-rpc-evidence.json', body: Buffer.from(JSON.stringify(rpc)) }],
    });
  }
  if (scenario.error) reporter.onError(new Error('Browser setup failed'));
  const override = await reporter.onEnd({ status: scenario.overall });
  const data = JSON.parse(fs.readFileSync(outputFile));
  assert.equal(data.qualified, scenario.qualified, scenario.name);
  assert.equal(data.network, 'Sepolia');
  assert.equal(data.readOnly, true);
  if (scenario.status) assert.deepEqual(data.tests[0].evidence['public-rpc-evidence.json'], rpc);
  if (scenario.override) assert.deepEqual(override, { status: 'failed' });
  if (scenario.error) assert.match(data.errors[0].message, /Browser setup failed/);
}
// A pre-test configuration/global failure still emits a usable failure artifact.
const reporter = new LiveReporter({ outputFile: path.join(directory, 'before-begin.json') });
reporter.onError(new Error('Configuration failure'));
await reporter.onEnd({ status: 'failed' });
assert.equal(JSON.parse(fs.readFileSync(reporter.outputFile)).qualified, false);
console.log('PASS opt-in CI gate: dispatch/run-live label only, exact PR head provenance, Node pin, 15m timeout, no signing/secrets, required commands, HTML/JSON artifacts; reporter records failure and rejects skipped/empty/incomplete suites (no live requests)');
