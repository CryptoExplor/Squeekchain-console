import { ACTION_REASONS } from './capabilities.js';
import { getAddress, keccak256 } from 'viem';
import { core9Abi, issuance9Abi, staking9Abi, token9Abi, nft9Abi } from './abi-v9.js';
import { IMPLEMENTATION_SLOT, ADMIN_SLOT } from './verify.js';
import { requireSepolia, RpcTrustError } from './rpc.js';
const ABIS = { core: core9Abi, issuance: issuance9Abi, staking: staking9Abi, token: token9Abi, nft: nft9Abi };
const same = (a, b) => String(a).toLowerCase() === String(b).toLowerCase();
const check = (ok, reason) => { if (!ok) throw new RpcTrustError(`${ACTION_REASONS.mismatch} ${reason}`); };
const slotAddress = value => { check(/^0x[0-9a-f]{64}$/i.test(value ?? ''), 'missing EIP-1967 slot'); return getAddress('0x' + value.slice(-40)); };
export function createV9Verifier(cache = new Map(), profile) {
  const pins = profile.identities.pins;
  return { async prepare(client, snapshot) {
    requireSepolia(await client.getChainId());
    const blockNumber = snapshot.blockNumber;
    // All six contracts are checked: immutable contracts must retain zero slots.
    const slots = await Promise.all(Object.entries(pins).map(async ([name, pin]) => {
      const [impl, admin] = await Promise.all([IMPLEMENTATION_SLOT, ADMIN_SLOT].map(slot => client.getStorageAt({ address: pin.address, slot, blockNumber })));
      check(same(slotAddress(impl), pin.implSlot), `${name} implementation slot`);
      check(same(slotAddress(admin), pin.adminSlot), `${name} admin slot`);
      return [name, impl, admin];
    }));
    const key = `v9:${JSON.stringify(profile.identities)}:${JSON.stringify(slots)}`;
    const cached = cache.get(key);
    if (!cached) {
      await Promise.all(Object.entries(pins).map(async ([name, pin]) => {
        const code = await client.getCode({ address: pin.address, blockNumber });
        check(code && code !== '0x' && same(keccak256(code), pin.runtimeCodeHash), `${name} runtime hash`);
        if (pin.implCodeHash) {
          const implementation = await client.getCode({ address: pin.implSlot, blockNumber });
          check(implementation && implementation !== '0x' && same(keccak256(implementation), pin.implCodeHash), `${name} implementation runtime hash`);
        }
      }));
      const calls = [], expected = [];
      for (const [name, pin] of Object.entries(pins)) {
        for (const field of ['implementationCodeAddress', 'implementationCodeVersion', 'implementationStorageLayoutDigest']) {
          const value = field === 'implementationCodeAddress' ? (pin.implCodeHash ? pin.implSlot : null) : pin[field];
          if (value != null) { calls.push({ address: pin.address, abi: ABIS[name], functionName: field }); expected.push([name + '.' + field, value]); }
        }
        if (name==='core'||name==='issuance') {calls.push({address:pin.address,abi:ABIS[name],functionName:'proxyAdmin'});expected.push([name+'.proxyAdmin',pin.adminSlot]);}
        // staking has no proxyAdmin() ABI; its admin is checked from storage above.
        for (const [field, value] of Object.entries(pin.wiring)) { calls.push({ address: pin.address, abi: ABIS[name], functionName: field }); expected.push([name + '.' + field, value]); }
      }
      const values = await client.multicall({ contracts: calls, allowFailure: false, blockNumber });
      expected.forEach(([field, value], i) => {
        if (typeof value === 'object') for (const [key, item] of Object.entries(value)) check(same(values[i]?.[key], item), `${field}.${key}`);
        else check(same(values[i], value), field);
      });
    }
    const value = { ok: true, trusted: true, problems: [], release: profile.identities.release,
      chainId: 11155111, blockNumber: String(blockNumber), blockHash: snapshot.blockHash,
      cacheHit: Boolean(cached), fullVerificationBlockNumber: cached?.fullVerificationBlockNumber ?? String(blockNumber),
      fullVerificationBlockHash: cached?.fullVerificationBlockHash ?? snapshot.blockHash, slotsCheckedAtBlockNumber: String(blockNumber) };
    return { value, commit: () => cache.set(key, value) };
  } };
}
