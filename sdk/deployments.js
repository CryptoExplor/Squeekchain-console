import { PUBLISHED_PROFILE } from './pins-core-20261103.js';
import { coreAbi, nftAbi, tokenAbi, miningAbi, stakingAbi } from './abi-core-20261103.js';

/** Two networks only. Sepolia is pinned from the published deployment record
 * (docs/deployments/core-sepolia-20261103.json) and its published ABIs; every
 * operation still verifies those identities on-chain. No API trust. */
export const PUBLISHED_ABIS = { core: coreAbi, nft: nftAbi, token: tokenAbi, mining: miningAbi, staking: stakingAbi };

export const PROFILES = {
  [PUBLISHED_PROFILE.key]: {
    ...PUBLISHED_PROFILE,
    startBlock: BigInt(PUBLISHED_PROFILE.startBlock),
    abis: PUBLISHED_ABIS,
    deploymentBlock: PUBLISHED_PROFILE.identities.deploymentBlock,
    capabilities: { checkpoint: true, claim: true, merge: true, deposit: true, withdraw: true, mergeDeposited: true, claimAndStake: true, stake: true, unstake: true, art: true, transfer: false, reads: true },
    notes: 'Current published deployment. Identity pins are the published implementation, implementation runtime hash, storage layout digest and ProxyAdmin values; every operation also requires same-block two-peer agreement. Mismatch stops actions.',
    apiBase: 'https://api.squeekchain.com',
  },

  mainnet: {
    key: 'mainnet',
    label: 'Mainnet (not deployed)',
    short: 'mainnet',
    chainId: 1,
    hexChainId: '0x1',
    kind: 'not-deployed',
    addresses: null,
    identities: null,
    abis: null,
    capabilities: { checkpoint: false, claim: false, merge: false, deposit: false, withdraw: false, mergeDeposited: false, claimAndStake: false, stake: false, unstake: false, art: false, transfer: false, reads: false },
    notes: 'Squeekchain has no mainnet deployment. This entry turns on only when the docs record publishes mainnet addresses; it never guesses them.',
    apiBase: null,
    startBlock: 0n,
  },
};

export const DEFAULT_PROFILE = 'sepolia';

export const listProfiles = () => Object.values(PROFILES);
export function getProfile(key = DEFAULT_PROFILE) {
  if (!Object.hasOwn(PROFILES, key)) throw new Error(`Unknown canonical profile: ${key}`);
  return PROFILES[key];
}
