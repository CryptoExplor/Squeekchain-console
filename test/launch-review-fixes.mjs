import assert from 'node:assert/strict';
import http from 'node:http';
import fs from 'node:fs';
import { Abi } from 'abitype/zod';
import * as publishedAbis from '../sdk/abi-core-20261103.js';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { JS_BUDGET_BYTES, assertJavaScriptBudget } from '../scripts/js-budget.mjs';

for (const [name, abi] of Object.entries(publishedAbis)) {
  if (Array.isArray(abi)) assert.equal(Abi.safeParse(abi).success, true, `${name}: patched Zod peer compatibility`);
}
assert.equal(Abi.safeParse([{ type: 'function', name: 'broken', inputs: [{ type: 'invalid-type' }] }]).success, false);
const ci = fs.readFileSync('.github/workflows/ci.yml', 'utf8');
assert.match(ci, /npm audit --omit=dev --audit-level=high/);
assert.ok(ci.includes('arena/b97eddeb-squeekchain-console'), 'active branch receives checks');
assert.match(fs.readFileSync('wrangler.toml', 'utf8'), /^name = "wheel-house"$/m);
console.log('PASS patched production Zod optional peer validates published ABIs and rejects malformed ABI; production audit and deployment target guards');
assert.equal(JS_BUDGET_BYTES, 2_000_000);
const builtSize = JSON.parse(fs.readFileSync('dist/js-size.json', 'utf8'));
assert.equal(builtSize.budgetBytes, JS_BUDGET_BYTES, 'production build uses the shared cap');
assert.equal(builtSize.scripts.length, fs.readdirSync('dist').filter(name => name.endsWith('.js')).length, 'all shipped JS files are counted');
assert.equal(builtSize.totalGzipBytes, builtSize.scripts.reduce((total, file) => total + file.gzipBytes, 0));
assert.doesNotThrow(() => assertJavaScriptBudget(builtSize.totalGzipBytes));
for (const bytes of [0, 500_000, 1_999_999, 2_000_000]) assert.doesNotThrow(() => assertJavaScriptBudget(bytes));
assert.throws(() => assertJavaScriptBudget(2_000_001), /budget exceeded/);
for (const bytes of [-1, NaN, Infinity, 1.5]) assert.throws(() => assertJavaScriptBudget(bytes), /Invalid/);
console.log('PASS 2 MB decimal all-JavaScript gzip budget: inclusive cap, overflow and invalid counts');

const server = spawn(process.execPath, ['web/server.mjs'], { env: { ...process.env, HOST: '127.0.0.1', PORT: '0' }, stdio: ['ignore', 'pipe', 'pipe'] });
let stderr = '';
server.stderr.on('data', data => { stderr += data; });
const exited = once(server, 'exit');
try {
  const port = await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Static server startup timed out')), 10_000);
    let output = '';
    server.stdout.on('data', data => {
      output += data;
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) { clearTimeout(timeout); resolve(Number(match[1])); }
    });
    server.once('error', error => { clearTimeout(timeout); reject(error); });
    server.once('exit', () => { clearTimeout(timeout); reject(new Error(`Static server exited: ${stderr}`)); });
  });
  const request = (path, { method = 'GET', host = 'localhost' } = {}) => new Promise((resolve, reject) => {
    const req = http.request({ hostname: '127.0.0.1', port, path, method, headers: { host } }, res => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', chunk => { body += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, body, headers: res.headers }));
      res.on('error', reject);
    });
    req.setTimeout(5000, () => req.destroy(new Error('Static request timed out')));
    req.on('error', reject);
    req.end();
  });
  for (const path of ['/%E0%A4%A', '/%', '/%FF', '/%00', 'http://foreign.invalid/index.html']) {
    const bad = await request(path);
    assert.equal(bad.status, 400, path);
    assert.ok(bad.headers['content-security-policy'], 'security headers also protect error responses');
    assert.equal((await request('/health')).status, 200, 'listener survives malformed request');
  }
  assert.equal((await request('/%2e%2e%2fpackage.json')).status, 403, 'decoded traversal cannot leave web root');
  assert.equal((await request('/%2e%2e%2fweb-private/secret')).status, 403, 'sibling prefix is not inside web root');
  assert.equal((await request('/index.html', { method: 'HEAD' })).body, '');
  assert.equal((await request('/index.html', { method: 'POST' })).status, 405);
  assert.equal((await request('/missing-file')).status, 404);
  assert.equal((await request('/health', { host: '[malformed' })).status, 200, 'untrusted Host is never used as URL base');
  const index = await request('/');
  assert.equal(index.status, 200);
  assert.match(index.body, /Wheelhouse/);
  assert.match(index.body, /href="https:\/\/squeekchain\.com\/mint" target="_blank" rel="noopener noreferrer"/);
  assert.doesNotMatch(index.body, /0\.05 ETH/, 'mint price must not become a stale hardcoded quote');
  assert.equal((await request('/health', { host: '5173-preview.e2b.app' })).status, 200, 'preview hosts accepted');
  assert.equal(server.exitCode, null);
  console.log('PASS static server: malformed URLs return 400 without crashing, decoded traversal blocked, Host isolated, headers and GET/HEAD preserved');
} finally {
  if (server.exitCode === null && server.signalCode === null) server.kill();
  await exited;
}
