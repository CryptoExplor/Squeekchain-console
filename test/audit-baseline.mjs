// Offline deployment/ABI/tool characterization; not live qualification.
// Published v6 constants and the byte-stable v9 pin export, never API observations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DEPLOYMENT,SQUEEKS_POLICY} from './fixtures/graph.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROFILES } from '../sdk/deployments.js';
import { coreAbi, miningAbi, nftAbi, tokenAbi } from '../sdk/abi-core-20261103.js';
import { createSqueekchain } from '../sdk/squeekchain.js';
import { TOOL_SPECS, buildManifest } from '../sdk/tools.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const pinBytes=fs.readFileSync(new URL('../docs/pins/v9-identity-2026-11-03.json',import.meta.url));
assert.equal(createHash('sha256').update(pinBytes).digest('hex'),'fbedcbe2979cf650ff42b1e0f35c679b3afce08da4d13f7b21efe9361e286979','identity export must remain byte-identical');
const evidence=JSON.parse(pinBytes),lower=value=>String(value).toLowerCase(),documented=PROFILES['sepolia'];
const published={core:'0x74665dAecA35A2303e767E76a2FF1FB6F93e119f',mining:'0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4',nft:'0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6',token:'0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76'};
assert.equal(documented.chainId,11155111);
for(const [key,address] of Object.entries(published))assert.equal(lower(documented.addresses[key]),lower(address),'published v6 '+key);
assert.equal(DEPLOYMENT.versions.mining,6);assert.equal(SQUEEKS_POLICY.length,10);
assert.notEqual(lower(documented.addresses.core),lower(PROFILES['sepolia'].addresses.core));
assert.equal(evidence.peersAgree,true);
for(const peer of Object.values(evidence.peers))for(const [contract,pin] of Object.entries({core:'core',mining:'issuance',staking:'staking',nft:'nft',token:'token',launch:'launch'}))assert.equal(lower(PROFILES['sepolia'].addresses[contract]),lower(peer[pin].address),'v9 '+contract+' matches independent pin export');
console.log('PASS published v6 constants, both-peer v9 pin provenance and byte-identical identity SHA-256');

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

for (const profile of ['sepolia', 'sepolia']) {
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
