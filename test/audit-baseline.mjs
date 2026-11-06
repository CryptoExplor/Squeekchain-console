// Offline deployment/ABI/tool characterization; not live qualification.
// Published v6 constants and the byte-stable v9 pin export, never API observations.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {DEPLOYMENT,SQUEEKS_POLICY} from './fixtures/graph.mjs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { PROFILES } from '../sdk/deployments.js';
import { coreAbi, miningAbi, nftAbi, tokenAbi, stakingAbi } from '../sdk/abi-core-20261103.js';
import { createSqueekchain } from '../sdk/squeekchain.js';
import { TOOL_SPECS, buildManifest } from '../sdk/tools.js';

const root = fileURLToPath(new URL('../', import.meta.url));
const recordBytes=fs.readFileSync(new URL('../docs/deployments/core-sepolia-20261103.json',import.meta.url));
assert.equal(createHash('sha256').update(recordBytes).digest('hex'),'219ef9a6fe40d483b43a82ff5e445313af2a3b88f0b324622ab528769a97d095','published record copy must remain byte-identical');
const record=JSON.parse(recordBytes),lower=value=>String(value).toLowerCase(),documented=PROFILES['sepolia'];
assert.equal(record.release,'core-sepolia-20261103');assert.equal(record.revision,7);assert.equal(record.chainId,11155111);
assert.equal(documented.chainId,11155111);assert.equal(documented.identities.release,record.release);assert.equal(documented.identities.revision,record.revision);
const published={core:'SqueekCore',issuance:'SqueekMining',mining:'SqueekMining',staking:'SqueekStaking',token:'SqueekToken',nft:'SqueekNFT'};
for(const [key,name] of Object.entries(published))assert.equal(lower(documented.addresses[key]),lower(record.contracts[name].address),'published '+key);
assert.equal(lower(documented.addresses.nft),'0xc4c7982657f00509548f3a3a41db7fa439a6856b');assert.equal(lower(documented.addresses.staking),'0x50fd1780526c3186a0c037c7622203bc4fb611ca');
for(const old of ['0x0eaf3e0d40a0a8e5a6ac030b2459e9fb0b7905c6','0xcb98','0x4b67','0x74665daeca35a2303e767e76a2ff1fb6f93e119f'])assert.ok(Object.values(documented.addresses).every(a=>!lower(a).startsWith(old)),'retired address '+old);
for(const [name,pin] of [['token','SqueekToken'],['nft','SqueekNFT']])assert.equal(lower(documented.identities.pins[name].runtimeCodeHash),lower(record.contracts[pin].runtimeHash),name+' runtime hash pin');
for(const [name,pin] of [['core','SqueekCore'],['issuance','SqueekMining'],['staking','SqueekStaking']]){const p=documented.identities.pins[name],c=record.contracts[pin];assert.equal(lower(p.implSlot),lower(c.implementation));assert.equal(lower(p.adminSlot),lower(c.proxyAdmin));assert.equal(lower(p.implCodeHash),lower(c.implementationRuntimeHash));}
assert.equal(SQUEEKS_POLICY.length,10);
console.log('PASS published record core-sepolia-20261103 rev 7: byte-identical copy, profile addresses, proxy/impl/runtime pins; no retired v6/v9 addresses');

// Local parity only. A complete remote ABI comparison remains an audit exit gate.
for (const [name, exported] of Object.entries({ SqueekCore: coreAbi, SqueekMining: miningAbi, SqueekNFT: nftAbi, SqueekToken: tokenAbi, SqueekStaking: stakingAbi })) {
  const local = JSON.parse(fs.readFileSync(new URL(`../abi/core-sepolia-20261103/${name}.json`, import.meta.url), 'utf8'));
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
