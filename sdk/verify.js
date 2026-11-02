import { getAddress, keccak256, parseAbi } from 'viem';
import { coreAbi, miningAbi, nftAbi, tokenAbi } from './abi.js';
import { DEPLOYMENT, CORE_CONFIGURATION } from './record.js';
import { RpcTrustError, requireSepolia } from './rpc.js';
export const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
export const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
// owner() ABI is also published in the official Quickstart verification example.
const ownerAbi = parseAbi(['function owner() view returns (address)']);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const check = (condition, reason) => { if (!condition) throw new RpcTrustError(`Deployment mismatch: ${reason}`); };
const slotAddress = word => {
  check(/^0x[0-9a-f]{64}$/i.test(word ?? ''), 'missing EIP-1967 slot');
  return getAddress(`0x${word.slice(-40)}`);
};

export async function verifyGraphAt(client, snapshot, record = DEPLOYMENT) {
  requireSepolia(await client.getChainId());
  const blockNumber = snapshot.blockNumber;
  const read = (address, abi, functionName, args = []) => client.readContract({ address, abi, functionName, args, blockNumber });
  const detail = {};
  for (const [name, abi] of [['core', coreAbi], ['mining', miningAbi]]) {
    const proxy = record[name];
    const [implWord, adminWord] = await Promise.all([
      client.getStorageAt({ address: proxy, slot: IMPLEMENTATION_SLOT, blockNumber }),
      client.getStorageAt({ address: proxy, slot: ADMIN_SLOT, blockNumber }),
    ]);
    const implementation = slotAddress(implWord), admin = slotAddress(adminWord);
    // Stop before interacting with an unexpected implementation/admin address.
    check(same(implementation, record.implementations[name]), `${name} implementation`);
    check(same(admin, record.proxyAdmins[name]), `${name} proxy admin`);
    const [reported, version, layout, code, adminOwner, reportedAdmin] = await Promise.all([
      read(proxy, abi, 'implementationCodeAddress'), read(proxy, abi, 'implementationCodeVersion'),
      read(proxy, abi, 'implementationStorageLayoutDigest'), client.getCode({ address: implementation, blockNumber }),
      read(admin, ownerAbi, 'owner'), read(proxy, abi, 'proxyAdmin'),
    ]);
    check(same(reported, implementation), `${name} reported implementation`);
    check(Number(version) === record.versions[name], `${name} implementation version`);
    check(same(layout, record.layoutDigests[name]), `${name} storage layout`);
    check(code && code !== '0x' && same(keccak256(code), record.runtimeHashes[name]), `${name} runtime hash`);
    check(same(reportedAdmin, admin), `${name} reported proxy admin`);
    check(same(adminOwner, record.timelock), `${name} admin owner`);
    detail[name] = { implementation, admin, version: Number(version), runtimeHash: keccak256(code), layout, adminOwner };
  }
  const [miningCore, tokenMining, policy, config, nftMining, nftCore, renderer, art, miningConfig, nftGovernance, nftGuardian] = await Promise.all([
    read(record.mining, miningAbi, 'core'), read(record.token, tokenAbi, 'mining'),
    read(record.mining, miningAbi, 'collectionPolicy', [0]), read(record.core, coreAbi, 'configuration'),
    read(record.nft, nftAbi, 'mining'), read(record.nft, nftAbi, 'sqkCore'),
    read(record.nft, nftAbi, 'renderer'), read(record.nft, nftAbi, 'art'),
    read(record.mining, miningAbi, 'configuration'), read(record.nft, nftAbi, 'governance'), read(record.nft, nftAbi, 'guardian'),
  ]);
  check(same(miningCore, record.core) && same(tokenMining, record.mining) && same(policy.nft, record.nft)
    && same(nftMining, record.mining) && same(nftCore, record.core), 'contract wiring');
  for (const [key, expected] of Object.entries({ core: record.core, token: record.token, genesisCollection: record.nft, governance: record.timelock, streamId: CORE_CONFIGURATION.streamId, genesisTimestamp: CORE_CONFIGURATION.genesisTimestamp, maxWorkPerRound: CORE_CONFIGURATION.maxWorkPerRound, genesisMaximumLevel: 10, minimumTimelockDelay: 60 })) check(same(miningConfig[key], expected), `mining configuration.${key}`);
  check(same(nftGovernance, record.timelock) && same(nftGuardian, CORE_CONFIGURATION.guardian), 'NFT governance / guardian');
  check(same(renderer, record.renderer) && same(art, record.art), 'renderer / art wiring');
  for (const [key, expected] of Object.entries(CORE_CONFIGURATION)) check(same(config[key], expected), `core configuration.${key}`);
  const weights = [1000n, 3000n, 7000n, 15000n, 31000n, 63000n, 127000n, 255000n, 511000n, 1023000n];
  check(Number(policy.maximumLevel) === 10 && policy.levels.length === 10, 'collection maximum level');
  policy.levels.forEach((level, index) => check(BigInt(level.weight) === weights[index]
    && BigInt(level.cooldownBlocks) === (index === 9 ? 0n : BigInt((index + 1) * 2)), `collection level ${index + 1}`));
  for (const address of [record.token, record.nft, record.renderer, record.validator, record.art]) {
    const code = await client.getCode({ address, blockNumber });
    check(code && code !== '0x', 'missing immutable contract code');
  }
  return { ok: true, trusted: true, problems: [], chainId: 11155111, release: record.release,
    blockNumber: String(blockNumber), blockHash: snapshot.blockHash, detail,
    wiring: { miningCore, tokenMining, nft: policy.nft, renderer, art } };
}
