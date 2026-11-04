import { ACTION_REASONS } from './capabilities.js';
import { getAddress, keccak256, parseAbi, toHex } from 'viem';
import { coreAbi, miningAbi, nftAbi, tokenAbi } from './abi.js';
import { DEPLOYMENT, CORE_CONFIGURATION } from './record.js';
import { RpcTrustError, requireSepolia } from './rpc.js';
export const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc';
export const ADMIN_SLOT = '0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103';
// owner() ABI is also published in the official Quickstart verification example.
const ownerAbi = parseAbi(['function owner() view returns (address)']);
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const check = (condition, reason) => { if (!condition) throw new RpcTrustError(`${ACTION_REASONS.mismatch} ${reason}`); };
const slotAddress = word => {
  check(/^0x[0-9a-f]{64}$/i.test(word ?? ''), 'missing EIP-1967 slot');
  return getAddress(`0x${word.slice(-40)}`);
};

export async function readProxySlots(client, snapshot, record = DEPLOYMENT) {
  const pairs = await Promise.all(['core', 'mining'].map(async name => {
    const [impl, admin] = await Promise.all([IMPLEMENTATION_SLOT, ADMIN_SLOT].map(slot => client.getStorageAt({ address: record[name], slot, blockNumber: snapshot.blockNumber })));
    return [name, { implementation: slotAddress(impl), admin: slotAddress(admin) }];
  }));
  return Object.fromEntries(pairs);
}
const contract = (address, abi, functionName, args = []) => ({ address, abi, functionName, args });
export async function verifyGraphAt(client, snapshot, record = DEPLOYMENT, slots, identityCodes) {
  requireSepolia(await client.getChainId());
  const blockNumber = snapshot.blockNumber;
  slots ??= await readProxySlots(client, snapshot, record);
  for (const name of ['core', 'mining']) {
    check(same(slots[name].implementation, record.implementations[name]), `${name} implementation`);
    check(same(slots[name].admin, record.proxyAdmins[name]), `${name} proxy admin`);
  }
  const calls = [];
  for (const [name, abi] of [['core', coreAbi], ['mining', miningAbi]]) {
    for (const fn of ['implementationCodeAddress', 'implementationCodeVersion', 'implementationStorageLayoutDigest', 'proxyAdmin']) calls.push(contract(record[name], abi, fn));
    calls.push(contract(slots[name].admin, ownerAbi, 'owner'));
  }
  calls.push(
    contract(record.mining, miningAbi, 'core'), contract(record.token, tokenAbi, 'mining'),
    contract(record.mining, miningAbi, 'collectionPolicy', [0]), contract(record.core, coreAbi, 'configuration'),
    contract(record.nft, nftAbi, 'mining'), contract(record.nft, nftAbi, 'sqkCore'),
    contract(record.nft, nftAbi, 'renderer'), contract(record.nft, nftAbi, 'art'),
    contract(record.mining, miningAbi, 'configuration'), contract(record.nft, nftAbi, 'governance'), contract(record.nft, nftAbi, 'guardian'),
  );
  const codeAddresses = [slots.core.implementation, slots.mining.implementation, record.token, record.nft, record.renderer, record.validator, record.art];
  const [values, codes] = await Promise.all([
    client.multicall({ contracts: calls, allowFailure: false, blockNumber }),
    identityCodes ?? Promise.all(codeAddresses.map(address => client.getCode({ address, blockNumber }))),
  ]);
  const detail = {};
  for (const [index, name] of ['core', 'mining'].entries()) {
    const { implementation, admin } = slots[name];
    const [reported, version, layout, reportedAdmin, adminOwner] = values.slice(index * 5, index * 5 + 5);
    const code = codes[index];
    check(same(reported, implementation), `${name} reported implementation`);
    check(Number(version) === record.versions[name], `${name} implementation version`);
    check(same(layout, record.layoutDigests[name]), `${name} storage layout`);
    check(code && code !== '0x' && same(keccak256(code), record.runtimeHashes[name]), `${name} runtime hash`);
    check(same(reportedAdmin, admin), `${name} reported proxy admin`);
    check(same(adminOwner, record.timelock), `${name} admin owner`);
    detail[name] = { implementation, admin, version: Number(version), runtimeHash: keccak256(code), layout, adminOwner };
  }
  const [miningCore, tokenMining, policy, config, nftMining, nftCore, renderer, art, miningConfig, nftGovernance, nftGuardian] = values.slice(10);
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
  for (const code of codes.slice(2)) {
    check(code && code !== '0x', 'missing immutable contract code');
  }
  return { ok: true, trusted: true, problems: [], chainId: 11155111, release: record.release,
    blockNumber: String(blockNumber), blockHash: snapshot.blockHash, detail,
    wiring: { miningCore, tokenMining, nft: policy.nft, renderer, art } };
}

// A caller-owned session cache, never localStorage/API data. Cache writes are deferred until
// the operation's final two-peer hash check succeeds, so reorg/error results cannot seed trust.
export function createSessionVerifier(cache = new Map(), record = DEPLOYMENT) {
  return {
    async prepare(client, snapshot, readIdentity) {
      let slots,codes;
      // Production uses the SAME two peers selected by the snapshot guard. A
      // genuine block hash alone does not authenticate storage or runtime code.
      if(readIdentity){
        const block=toHex(snapshot.blockNumber),requests=['core','mining'].flatMap(name=>[IMPLEMENTATION_SLOT,ADMIN_SLOT].map(slot=>({method:'eth_getStorageAt',params:[record[name],slot,block]})));
        const expectedSlots=['core','mining'].flatMap(name=>[record.implementations[name],record.proxyAdmins[name]]);
        const key=[record.release,record.core,record.mining,...expectedSlots].join(':').toLowerCase();
        const addresses=[record.implementations.core,record.implementations.mining,record.token,record.nft,record.renderer,record.validator,record.art];
        if(!cache.has(key))requests.push(...addresses.map(address=>({method:'eth_getCode',params:[address,block]})));
        const responses=await readIdentity(snapshot,requests);
        check(responses.length>=2,'two identity peers required');
        for(const values of responses){
          check(values.length===requests.length,'identity response length');
          expectedSlots.forEach((expected,i)=>check(same(slotAddress(values[i]),expected),'independent implementation/admin slot'));
          if(requests.length>4)values.slice(4).forEach((code,i)=>{check(typeof code==='string'&&/^0x(?:[\da-f]{2})+$/i.test(code),'missing independent runtime code');if(i<2)check(same(keccak256(code),record.runtimeHashes[i===0?'core':'mining']),'independent implementation runtime hash');});
        }
        slots=Object.fromEntries(['core','mining'].map((name,i)=>[name,{implementation:slotAddress(responses[0][i*2]),admin:slotAddress(responses[0][i*2+1])}]));
        if(requests.length>4)codes=responses[0].slice(4);
      }else slots=await readProxySlots(client,snapshot,record); // explicit injected test contexts

      const key = [record.release, record.core, record.mining, ...['core', 'mining'].flatMap(name => [slots[name].implementation, slots[name].admin])].join(':').toLowerCase();
      const cached = cache.get(key);
      const full = cached ?? await verifyGraphAt(client, snapshot, record, slots, codes);
      const value = { ...full, blockNumber: String(snapshot.blockNumber), blockHash: snapshot.blockHash,
        cacheHit: Boolean(cached), fullVerificationBlockNumber: cached?.fullVerificationBlockNumber ?? full.blockNumber,
        fullVerificationBlockHash: cached?.fullVerificationBlockHash ?? full.blockHash,
        slotsCheckedAtBlockNumber: String(snapshot.blockNumber) };
      return { value, commit: () => cache.set(key, value) };
    },
    clear: () => cache.clear(),
  };
}
