/**
 * Deployment profiles.
 *
 * Squeekchain's Sepolia graph has moved on from the published docs: the deployment the docs pin
 * (SqueekMining v6) stopped receiving settlements at round 1973, and the live testnet the official
 * dApp (sepolia.squeekchain.com) talks to is a newer graph — issuance v9 + staking + vault + a new
 * SqueekNFT — whose docs are not published yet.
 *
 * So this file describes BOTH, honestly labelled:
 *
 *  - `sepolia`     live testnet, mining v9 / new NFT. Addresses come from the official dApp bundle
 *                  and api.squeekchain.com/v1. NOT from a published deployment record, so the app
 *                  treats it as experimental: reads verified at runtime, owner actions disabled
 *                  until the docs publish the v9 flows.
 *  - `sepolia-v6`  the docs-pinned deployment this repo was built against (SqueekMining v6).
 *                  Fully supported, fully verified — but its settlement frontier is frozen, so
 *                  checkpoint() reverts RoundNotSettled and no new SQK is issued there.
 *  - `mainnet`     no deployment exists. Kept so the UI can say so instead of guessing.
 */

export const PROFILES = {
  sepolia: {
    key: "sepolia",
    label: "Sepolia (live)",
    short: "sepolia",
    chainId: 11155111,
    hexChainId: "0xaa36a7",
    kind: "experimental",
    abiSet: "v9",
    addresses: {
      core: "0x980B4424c007CAf7a1f3670B48c8EaEf7EbC3d44",
      issuance: "0xcd46990f8349057335289Ef282c276204B6CDC62",
      mining: "0xcd46990f8349057335289Ef282c276204B6CDC62", // v9 "SqueekMining" is the issuance proxy
      staking: "0x4b67b739dFd832f4EAC67a7Aa3bc244fB74cea4F",
      token: "0x5501E1Fa81Be1c3F49225fa7668DA0245d07Db60",
      nft: "0xCB98349c134aB983dA5BfD80527dfe2552bDB70F",
      genesis: "0xCB98349c134aB983dA5BfD80527dfe2552bDB70F",
      launch: "0x1ff6485aBfBB2d183Cd673D78e1Ab31c098E04Dd", // test dispenser / genesis launch
    },
    identities: {
      implementationVersions: { issuance: 9, staking: 2 },
      issuanceLayoutDigest: "0x136850fc0e19543752b7382cde164f10588dc3b4648e7d704f2f06394ead8b90",
      stakingLayoutDigest: "0x39f298bf725abe5173d3a3b8ded2d4776d4c53fc9923f0027170dd458210a6f8",
      release: "stream-game-sepolia-test-20261026-01",
    },
    capabilities: {
      checkpoint: false, // issuance.checkpoint() exists, but rounds settle on the operator's schedule
      claim: false, // lives in SqueekStaking (deposit → claim) — docs pending
      merge: false, // lives on SqueekNFT (merge(survivor, donor)) — docs pending
      deposit: false,
      art: true,
      transfer: true,
      reads: true,
    },
    notes:
      "Live testnet graph (issuance v9 + staking + vault + new SqueekNFT, 9,972 minted). Docs for v9 are not published yet, so this build exposes reads (holdings, levels, cooldowns, onchain art, claimable) and blocks owner actions instead of guessing.",
    apiBase: "https://api.squeekchain.com",
    startBlock: 11998937n,
  },

  "sepolia-v6": {
    key: "sepolia-v6",
    label: "Sepolia · docs v6",
    short: "v6",
    chainId: 11155111,
    hexChainId: "0xaa36a7",
    kind: "legacy",
    abiSet: "v6",
    addresses: {
      core: "0x74665dAecA35A2303e767E76a2FF1FB6F93e119f",
      mining: "0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4",
      token: "0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76",
      nft: "0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6",
    },
    identities: {
      implementationVersions: { core: 3, mining: 6 },
      implementations: {
        core: "0x0a71c86ab63a77675002a389fdf4d096a07b11e2",
        mining: "0x08890b360c65fd878344bf6e23d1c36358433b4e",
      },
      layoutDigests: {
        core: "0x9a9c008e029460808209571703fbf2679785874e0e6d3232f16a864d12abcb20",
        mining: "0xace564e9c052f30122779a32fdf3333ebce7cc708eae9c01cb7875b4f6ad37a6",
      },
      proxyAdmins: {
        core: "0x05a9af6c3f6780dd58168f2e145cdd0d64564a5e",
        mining: "0x7369d930f8dfb7a6657578eda5906d3472e4ac9a",
      },
      timelock: "0x6B35AB6E96EF292E4fdD3f15a4E812f3CA291844",
    },
    capabilities: { checkpoint: true, claim: true, merge: true, deposit: false, art: true, transfer: true, reads: true },
    notes:
      "The deployment the published docs describe (SqueekMining v6). Everything here is verified against the docs record, but the settlement frontier has not advanced since round 1973, so checkpoint() reverts RoundNotSettled and claims are frozen.",
    apiBase: null,
    startBlock: 11902282n,
  },

  mainnet: {
    key: "mainnet",
    label: "Mainnet",
    short: "mainnet",
    chainId: 1,
    hexChainId: "0x1",
    kind: "not-deployed",
    abiSet: "v6",
    addresses: null,
    identities: null,
    capabilities: { checkpoint: false, claim: false, merge: false, deposit: false, art: false, transfer: false, reads: false },
    notes:
      "Squeekchain has no mainnet deployment — the docs say the contracts live on Sepolia only. Switch to a Sepolia profile; this entry exists so the app says so instead of guessing.",
    apiBase: null,
    startBlock: 0n,
  },
};

export const DEFAULT_PROFILE = "sepolia";

export const listProfiles = () => Object.values(PROFILES);
export const getProfile = (key) => PROFILES[key] ?? PROFILES[DEFAULT_PROFILE];
