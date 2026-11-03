import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const describeError = error => ({ message: error.message ?? String(error), stack: error.stack ?? null });
function commit() {
  if (process.env.LIVE_SOURCE_COMMIT) return process.env.LIVE_SOURCE_COMMIT;
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(); }
  catch { return null; }
}

/** Persist real live-test evidence on success AND failure. This reporter never
 * performs RPC requests, changes repository phase status, signs or uses keys.
 */
export default class LiveQualificationReporter {
  constructor({ outputFile = 'live-qualification/live-qualification.json' } = {}) {
    this.outputFile = path.resolve(outputFile);
    this.record = {
      schemaVersion: 1,
      sourceCommit: commit(),
      runUrl: process.env.GITHUB_RUN_ID
        ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : null,
      network: 'Sepolia', chainId: 11155111, readOnly: true,
      phase0Gate: 'Only a green opted-in thewheel live job for the recorded source commit satisfies the gate; this report does not change repository phase status.',
      status: 'not-started', qualified: false, expectedTests: 0, tests: [], errors: [],
    };
  }
  write() {
    fs.mkdirSync(path.dirname(this.outputFile), { recursive: true });
    fs.writeFileSync(this.outputFile, `${JSON.stringify(this.record, null, 2)}\n`);
  }
  onBegin(_config, suite) {
    this.record.startedAt = new Date().toISOString();
    this.record.expectedTests = suite.allTests().length;
    this.record.status = 'running';
    this.write();
  }
  onTestEnd(test, result) {
    const evidence = {};
    for (const attachment of result.attachments ?? []) {
      if (!['public-rpc-evidence.json', 'verified-network-snapshot.json', 'rpc-network-diagnostics.json', 'rpc-tool-diagnostics.json'].includes(attachment.name)) continue;
      try {
        const body = attachment.body ?? fs.readFileSync(attachment.path);
        evidence[attachment.name] = JSON.parse(body.toString());
      } catch (error) { evidence[attachment.name] = { unreadable: error.message }; }
    }
    this.record.tests.push({
      title: test.title, status: result.status, expectedStatus: test.expectedStatus,
      durationMs: result.duration, retry: result.retry,
      errors: (result.errors ?? []).map(describeError), evidence,
    });
    this.write();
  }
  onError(error) {
    this.record.errors.push(describeError(error));
    this.write();
  }
  async onEnd(result) {
    const qualified = result.status === 'passed' && this.record.errors.length === 0
      && this.record.expectedTests > 0 && this.record.tests.length === this.record.expectedTests
      && this.record.tests.every(test => test.status === 'passed' && test.expectedStatus === 'passed');
    // A skipped/empty/incomplete suite must never produce a green qualification.
    this.record.status = result.status === 'passed' && !qualified ? 'failed' : result.status;
    this.record.qualified = qualified;
    this.record.finishedAt = new Date().toISOString();
    this.write();
    if (result.status === 'passed' && !qualified) return { status: 'failed' };
  }
}
