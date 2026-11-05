import assert from 'node:assert/strict';
import fs from 'node:fs';
import { validateEconomyEnvelope, createDisplayApi } from '../sdk/display-api.js';
import { getProfile } from '../sdk/deployments.js';

// Real captures from api.squeekchain.com on 2026-11-05 (release core-sepolia-20261103).
const economy = JSON.parse(fs.readFileSync('test/fixtures/published-20261103/economy.json', 'utf8'));
const status = JSON.parse(fs.readFileSync('test/fixtures/published-20261103/status.json', 'utf8'));
const blocks = JSON.parse(fs.readFileSync('test/fixtures/published-20261103/blocks.json', 'utf8'));

assert.equal(economy.schemaVersion, 3);
assert.equal(economy.release.id, 'core-sepolia-20261103');
assert.equal(economy.identities, undefined, 'the v3 envelope no longer carries a flat identities block');

const profile = getProfile();
// The v3 envelope is accepted by the SAME pinned profile that the chain uses.
assert.equal(validateEconomyEnvelope(structuredClone(economy), profile, 2).schemaVersion, 3);

// The old pins are the exact mismatch: the schema moved on AND the release changed.
const legacy = getProfile('sepolia');
assert.throws(() => validateEconomyEnvelope(structuredClone(economy), legacy, 2), /API identity mismatch: release\.id/);

// Every pinned identity field is checked, and the failure names the exact field.
const mutations = [
  ['components.core.address', data => { data.deployment.components.core.address = `0x${'1'.repeat(40)}`; }],
  ['components.core.implementation.address', data => { data.deployment.components.core.implementation.address = `0x${'2'.repeat(40)}`; }],
  ['components.core.implementation.code.runtimeHash', data => { data.deployment.components.core.implementation.code.runtimeHash = `0x${'3'.repeat(64)}`; }],
  ['components.core.implementation.storageLayoutDigest', data => { data.deployment.components.core.implementation.storageLayoutDigest = `0x${'4'.repeat(64)}`; }],
  ['components.core.proxyAdmin.address', data => { data.deployment.components.core.proxyAdmin.address = `0x${'5'.repeat(40)}`; }],
  ['components.mining.implementation.code.runtimeHash', data => { data.deployment.components.mining.implementation.code.runtimeHash = `0x${'6'.repeat(64)}`; }],
  ['components.staking.proxyAdmin.address', data => { data.deployment.components.staking.proxyAdmin.address = `0x${'7'.repeat(40)}`; }],
  ['components.collection.code.runtimeHash', data => { data.deployment.components.collection.code.runtimeHash = `0x${'8'.repeat(64)}`; }],
  ['components.token.code.runtimeHash', data => { data.deployment.components.token.code.runtimeHash = `0x${'9'.repeat(64)}`; }],
  ['chain.deploymentBlock', data => { data.chain.deploymentBlock = '12050000'; }],
];
for (const [field, mutate] of mutations) {
  const data = structuredClone(economy);
  mutate(data);
  assert.throws(() => validateEconomyEnvelope(data, profile, 2), new RegExp(field.replace(/\./g, '\\.')), `${field} must be pinned`);
}

// A v3 envelope with neither components nor identities is a schema error, not a pass.
assert.throws(() => validateEconomyEnvelope({ schemaVersion: 3, status: 'available', release: { id: profile.identities.release }, chain: { target: 'sepolia', chainId: '11155111', safeThroughBlock: '1' }, installationId: 'x' }, profile, 2), /Missing API identity context/);

// A v2 fixture still validates through the legacy identity block.
assert.ok(validateEconomyEnvelope({ schemaVersion: 2, status: 'available', installationId: 'x', release: { id: getProfile('sepolia').identities.release }, chain: { target: 'sepolia', chainId: '11155111', safeThroughBlock: '1' }, identities: legacy.identities.pins ? { core: legacy.addresses.core, token: legacy.addresses.token, genesis: legacy.addresses.nft, launch: legacy.addresses.launch, mining: { proxy: legacy.identities.pins.issuance.address, implementation: legacy.identities.pins.issuance.implSlot, implementationVersion: legacy.identities.pins.issuance.implementationCodeVersion, storageLayoutDigest: legacy.identities.pins.issuance.implementationStorageLayoutDigest }, staking: { proxy: legacy.identities.pins.staking.address, implementation: legacy.identities.pins.staking.implSlot, implementationVersion: legacy.identities.pins.staking.implementationCodeVersion, storageLayoutDigest: legacy.identities.pins.staking.implementationStorageLayoutDigest } } : {} }, legacy, 2));

// The wheel reading the strip needs is present in the published status capture.
assert.equal(status.schemaVersion, 1);
assert.equal(status.measurement.freshness, 'online');
assert.ok(Number.isSafeInteger(status.measurement.rpmMilli));
assert.equal(blocks.schemaVersion, 'game-block-projection.v1');
assert.equal(blocks.chain.coreAddress, profile.addresses.core);

// End to end through the display client: the v3 economy envelope binds, and the
// /status reading validates against the same profile.
const routes = { '/v1/economy/state': economy, '/v1/status': status };
const api = createDisplayApi({ profile, cache: { get: async () => undefined, set: async () => {}, delete: async () => {} }, fetcher: async url => new Response(JSON.stringify(routes[new URL(url).pathname + (new URL(url).pathname === '/v1/economy/state' ? '' : '')] ?? routes[new URL(url).pathname]), { headers: { 'content-type': 'application/json' } }) });
const state = await api.economy();
assert.equal(state.data.nft.maximumLevel, 10);
assert.deepEqual(state.data.nft.basePower.map(String), ['1000', '2200', '4840', '10648', '23426', '51536', '113380', '249436', '548759', '1207269']);
const reading = await api.status();
assert.equal(reading.data.measurement.freshness, 'online');
console.log('PASS display v3: published envelope binds to the pinned graph, every identity field names itself on mismatch, legacy v2 still validates, wheel status reads');
