// Phase 0 characterization, not production or live-chain qualification.
// Uses a dated official-source excerpt. Never update runtime deployment configuration from API fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROFILES } from '../sdk/deployments.js';
import { coreAbi, miningAbi, nftAbi, tokenAbi } from '../sdk/abi.js';
import { createSqueekchain } from '../sdk/squeekchain.js';
import { TOOL_SPECS, buildManifest } from '../sdk/tools.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const evidence = JSON.parse(fs.readFileSync(new URL('../docs/audit/observations-2026-11-02.json', import.meta.url), 'utf8'));
const lower = value => String(value).toLowerCase();
const record = evidence.publishedRecord;
const documented = PROFILES['sepolia-v6'];

assert.equal(documented.chainId, record.chainId);
for (const key of ['core', 'mining', 'nft', 'token']) {
  assert.equal(lower(documented.addresses[key]), lower(record.addresses[key]), `documented ${key} matches the dated record excerpt`);
}
assert.equal(record.collection, 0);
assert.equal(record.maximumLevel, 10);
assert.equal(record.implementationVersions.mining, 6);
assert.notEqual(lower(evidence.apiCore.core), lower(record.addresses.core));
assert.notEqual(evidence.apiEconomy.release, record.release);
for (const key of ['core', 'mining', 'staking', 'nft', 'token', 'launch']) {
  assert.equal(lower(PROFILES['sepolia-v9'].addresses[key]), lower(evidence.apiEconomy.addresses[key]), `experimental ${key} matches historical API observation only`);
}
assert.equal(evidence.apiGenesis.status, 'unavailable');
assert.equal(evidence.apiGenesis.reason, 'launch_unconfigured');
assert.equal('inventory' in evidence.apiGenesis, false, 'unconfigured does not mean zero inventory');
console.log('PASS audit evidence: documented profile vs dated record; historical API mismatch is explicit; Genesis unknown');

// Local parity only. A complete remote ABI comparison remains an audit exit gate.
for (const [name, exported] of Object.entries({ SqueekCore: coreAbi, SqueekMining: miningAbi, SqueekNFT: nftAbi, SqueekToken: tokenAbi })) {
  const local = JSON.parse(fs.readFileSync(new URL(`../abi/${name}.json`, import.meta.url), 'utf8'));
  assert.deepEqual(exported, local, `${name}: sdk export matches checked-in ABI`);
}
const sdk = createSqueekchain(); // Constructor only; no network and no skipVerification.
assert.equal(typeof sdk.claimPreview, 'function');
assert.equal(typeof sdk.mergePreview, 'function');
assert.equal(typeof sdk.checkpointPreview, 'function');
assert.equal(typeof sdk.art, 'function', 'v6 art capability now has a same-block adapter method');
assert.equal(documented.capabilities.art, true);
console.log('PASS local ABI export parity; v6 art capability/adapter parity (not live-art qualification)');

const requests = [
  { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'offline-audit', version: '1' } } },
  { jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} },
].map(request => JSON.stringify(request)).join('\n') + '\n';

function listTools(profile) {
  // Whitelisted environment: do not inherit keeper keys or verification bypasses.
  const child = spawnSync(process.execPath, ['mcp/server.js'], {
    cwd: root,
    env: { PATH: process.env.PATH ?? '', SQUEEK_PROFILE: profile },
    input: requests,
    encoding: 'utf8',
    timeout: 10_000,
  });
  assert.ifError(child.error);
  assert.equal(child.status, 0, `MCP ${profile}: ${child.stderr}`);
  const replies = child.stdout.trim().split('\n').map(line => JSON.parse(line));
  assert.equal(replies.find(reply => reply.id === 1).result.serverInfo.name, 'wheelhouse');
  return replies.find(reply => reply.id === 2).result.tools;
}

for (const profile of ['sepolia-v9', 'sepolia-v6']) {
  const tools = listTools(profile);
  assert.ok(tools.some(tool => tool.name === 'squeek_network_status'));
  assert.ok(tools.every(tool => !tool.name.includes('submit') && !tool.name.includes('request')), 'default stdio has no submit or wallet-popup tool');
  assert.ok(tools.every(tool => ['read-only', 'prepare-only'].includes(tool.sideEffects)));
  const known = new Set(buildManifest({ surface: 'mcp' }).tools.map(tool => tool.name));
  assert.ok(tools.every(tool => known.has(tool.name)));
  for (const name of ['squeek_prepare_claim','squeek_prepare_merge','squeek_prepare_checkpoint','squeek_prepare_deposit','squeek_unstake_preview']) assert.ok(tools.some(tool=>tool.name===name));
  assert.ok(tools.every(tool=>tool.inputSchema.properties.profile));
}
assert.ok(TOOL_SPECS.every(tool => !/^squeek_submit_(claim|merge)$/.test(tool.name)));
assert.equal(PROFILES.mainnet.addresses, null);
assert.ok(Object.values(PROFILES.mainnet.capabilities).every(value => value === false));
console.log('PASS offline stdio initialize/tool listing, profile gates and mainnet disabled; no MCP signing or keeper tool');
