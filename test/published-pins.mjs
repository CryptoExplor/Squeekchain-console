import assert from 'node:assert/strict';
import fs from 'node:fs';
import { encodeFunctionData } from 'viem';
import { PROFILES, DEFAULT_PROFILE, getProfile } from '../sdk/deployments.js';
import { coreAbi, nftAbi as nft13Abi, tokenAbi as token13Abi, miningAbi as mining13Abi, stakingAbi as staking13Abi } from '../sdk/abi-core-20261103.js';
// The committed published ABI files are the reference the generated SDK ABIs must match.
const publishedAbi = name => JSON.parse(fs.readFileSync(`abi/core-sepolia-20261103/${name}.json`, 'utf8'));
import { indexKey } from '../web/explore-index.js';

// Every pinned identity must equal the PUBLISHED deployment record in this repo.
const record = JSON.parse(fs.readFileSync('docs/deployments/core-sepolia-20261103.json', 'utf8'));
const profile = getProfile('sepolia');
assert.equal(DEFAULT_PROFILE, 'sepolia', 'the current graph is the default profile');
assert.equal(profile.identities.release, record.release);
assert.equal(profile.identities.revision, record.revision);
assert.equal(profile.identities.source, 'docs/deployments/core-sepolia-20261103.json');
assert.equal(profile.startBlock, BigInt(record.deploymentBlock), 'the index starts at the published deploymentBlock');
assert.equal(record.deploymentBlock, 12057556);
const lower = value => String(value).toLowerCase();
const published = {
  core: record.contracts.SqueekCore, issuance: record.contracts.SqueekMining,
  staking: record.contracts.SqueekStaking, token: record.contracts.SqueekToken, nft: record.contracts.SqueekNFT,
};
for (const [name, pin] of Object.entries(profile.identities.pins)) {
  const source = published[name];
  assert.equal(pin.address, lower(source.address), `${name} address`);
  assert.equal(profile.addresses[name === 'issuance' ? 'mining' : name], pin.address, `${name} profile address`);
  if (source.implementation) {
    assert.equal(pin.implSlot, lower(source.implementation), `${name} implementation`);
    assert.equal(pin.adminSlot, lower(source.proxyAdmin), `${name} ProxyAdmin`);
    assert.equal(pin.implCodeHash, lower(source.implementationRuntimeHash), `${name} implementation runtime hash`);
    assert.equal(pin.implementationStorageLayoutDigest, lower(source.storageLayoutDigest), `${name} storage layout digest`);
  } else {
    assert.equal(pin.runtimeCodeHash, lower(source.runtimeHash), `${name} runtime hash`);
  }
}
assert.equal(profile.identities.pins.core.address, '0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4');
assert.equal(profile.identities.pins.nft.address, '0xc4c7982657f00509548f3a3a41db7fa439a6856b');
assert.equal(profile.identities.pins.token.address, '0xd78a3956cf63164d1fa1c622ad3c66623162fa1e');
assert.equal(profile.identities.pins.issuance.address, '0x2dccb11fcc2defdd188555e45acb52231e82e218');
assert.equal(profile.identities.pins.staking.address, '0x50fd1780526c3186a0c037c7622203bc4fb611ca');
assert.equal(profile.identities.pins.core.adminSlot, '0x21b3cb8f00d0d47b246a57d04152d6e11d24abb3');

// Zero bytes of v6/v9 remain reachable: only the current graph and a not-deployed mainnet exist.
const pinned = JSON.stringify(PROFILES, (_k, v) => typeof v === 'bigint' ? String(v) : v).toLowerCase();
for (const old of ['0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6', '0xCB98349c134aB983dA5BfD80527dfe2552bDB70F', '0x4b67b739dFd832f4EAC67a7Aa3bc244fB74cea4F']) assert.ok(!pinned.includes(old.toLowerCase()), `old v6/v9 contract ${old} is not pinned`);
assert.deepEqual(Object.keys(PROFILES).sort(), ['mainnet', 'sepolia']);
assert.equal(PROFILES.mainnet.addresses, null, 'mainnet never guesses addresses');
assert.equal(profile.chainId, record.chainId ?? 11155111);

// The nine operations the app prepares must still encode to the same calldata.
const [legacyNft, legacyStaking, legacyIssuance] = ['SqueekNFT', 'SqueekStaking', 'SqueekMining'].map(publishedAbi);
const operations = [
  [nft13Abi, legacyNft, 'merge', ['7', '9']],
  [staking13Abi, legacyStaking, 'deposit', [`0x${'1'.repeat(40)}`, ['1', '2']]],
  [staking13Abi, legacyStaking, 'withdraw', [`0x${'1'.repeat(40)}`, ['1']]],
  [staking13Abi, legacyStaking, 'mergeDeposited', [`0x${'1'.repeat(40)}`, '7', '9']],
  [staking13Abi, legacyStaking, 'claim', [`0x${'1'.repeat(40)}`]],
  [staking13Abi, legacyStaking, 'claimAndStake', []],
  [staking13Abi, legacyStaking, 'stake', ['1000']],
  [staking13Abi, legacyStaking, 'unstake', ['1000', '10', '1700000000']],
  [mining13Abi, legacyIssuance, 'checkpoint', []],
];
for (const [publishedAbi, legacyAbi, name, args] of operations) {
  const data = encodeFunctionData({ abi: publishedAbi, functionName: name, args });
  assert.equal(data, encodeFunctionData({ abi: legacyAbi, functionName: name, args }), `${name} selector/encoding changed`);
}
assert.deepEqual(
  [coreAbi, token13Abi].map(abi => abi.find(item => item.name === 'state' || item.name === 'cap')).length,
  2,
);
// The current graph has no v9 gacha curve: the adapter must not call it.
assert.equal(mining13Abi.some(item => item.name === 'curve'), false, 'SqueekMining.curve() is gone');
assert.equal(mining13Abi.some(item => item.name === 'issuanceSchedule'), true, 'issuanceSchedule() replaces curve()');
assert.equal(mining13Abi.some(item => item.name === 'configuration'), false, 'SqueekMining.configuration() is gone');
assert.equal(coreAbi.some(item => item.name === 'configuration'), true);
assert.equal(token13Abi.some(item => item.name === 'bindMining'), true, 'SqueekToken.bindMining(address) is new');

// Explore's cache key already includes the addresses and pins, so the new graph
// builds its own index instead of reusing the v9 one.
const nextRelease = { ...profile, identities: { ...profile.identities, release: 'core-sepolia-next' } };
const keys = [profile, nextRelease, PROFILES.mainnet].map(indexKey);
assert.equal(new Set(keys).size, 3, 'each deployment has its own index key');
assert.match(keys[0], /0xfd6c166d4b8e2962e65746a13e5a0797cd4de0c4/);
assert.match(keys[0], /12057556/);
console.log('PASS published pins: identities match the record, nine operations encode identically to the committed published ABIs, no v6/v9 graph is pinned, and the index key is per-profile');
