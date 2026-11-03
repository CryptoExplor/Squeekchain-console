/** Equal Sepolia profiles. Expected v9 identities are seeded from the user-supplied
 * two-peer export; every operation still verifies them onchain. No API trust. */
export const PROFILES = {
  "sepolia-v9": {
    key: "sepolia-v9",
    label: "Sepolia v9",
    short: "v9",
    chainId: 11155111,
    hexChainId: "0xaa36a7",
    kind: "deployed",
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
      "release": "stream-game-sepolia-test-20261026-01",
      "source": "docs/audit/v9-identity-2026-11-03.json",
      "capturedAt": "2026-11-03T15:45:43.869Z",
      "blockNumber": "12056257",
      "blockHash": "0x0c8d3619dbfd24c577c119248f472a5c4809cf342651134700b1122731642b22",
      "peers": [
            "tenderly",
            "publicnode"
      ],
      "pins": {
            "core": {
                  "address": "0x980B4424c007CAf7a1f3670B48c8EaEf7EbC3d44",
                  "runtimeCodeHash": "0xeeb464727c2e09e309498a29e09c432fe9f0b6b4177f040ee2b517af64a32c36",
                  "implSlot": "0x284747c4664af2203e7a90a2ee76f22b6b5e6889",
                  "adminSlot": "0x4a8ea91a43eeecb8cffc73631627a7d6f973fdbf",
                  "implCodeHash": "0xd8f2fb3c7dcf63e6dc0378ce5f85ceea52a876ae1f0cd66ac8631c3103371f8a",
                  "implementationCodeVersion": "3",
                  "implementationStorageLayoutDigest": "0x9a9c008e029460808209571703fbf2679785874e0e6d3232f16a864d12abcb20",
                  "wiring": {}
            },
            "issuance": {
                  "address": "0xcd46990f8349057335289Ef282c276204B6CDC62",
                  "runtimeCodeHash": "0x0923594faba293d32a32ad6bb5d05770baff4c816aaef9a71ba98e5d5c45eb8a",
                  "implSlot": "0x62d25dc1a24033a80edcc4b2d2ffe9348290cc4c",
                  "adminSlot": "0x11bedf889a53b6097b6c313e9cf67b359779674d",
                  "implCodeHash": "0x31089448b1c283d95f2c18f0ff1564cbcb6eb768f3e355e3b6bde114a2fb4a56",
                  "implementationCodeVersion": "9",
                  "implementationStorageLayoutDigest": "0x136850fc0e19543752b7382cde164f10588dc3b4648e7d704f2f06394ead8b90",
                  "wiring": {
                        "bindings": {
                              "core": "0x980B4424c007CAf7a1f3670B48c8EaEf7EbC3d44",
                              "token": "0x5501E1Fa81Be1c3F49225fa7668DA0245d07Db60",
                              "staking": "0x4b67b739dFd832f4EAC67a7Aa3bc244fB74cea4F",
                              "governance": "0xA68A2Fa1ffCFf79a8E143F05DDcdC48fbAeaafcB",
                              "gachaVault": "0x5f6BA50f448B84E09F5ee324a6402B033Ba70E28",
                              "streamId": "0x52e443e4e0d236ff0c07f4cdc518c594a3d680d20abb1481510efbed0ec73633",
                              "genesisTimestamp": "1793022600",
                              "minimumTimelockDelay": "60",
                              "maxWorkPerRound": "10000",
                              "initialWorkPerThousandBlocks": 10000,
                              "premint": "1"
                        }
                  }
            },
            "staking": {
                  "address": "0x4b67b739dFd832f4EAC67a7Aa3bc244fB74cea4F",
                  "runtimeCodeHash": "0x76357c64f9c586355d1ace9420738e2c37d05de5452f2e6a9113e04431366628",
                  "implSlot": "0xbbb816616d8840bd98094bf5a20f208df089230b",
                  "adminSlot": "0xf85669c5909a2a0bf62fb4a920ecb44a05be2df5",
                  "implCodeHash": "0xc483f3d2e975ef48012c3f0c36b1dcf537967ef2d540b25423da96e89b5297eb",
                  "implementationCodeVersion": "2",
                  "implementationStorageLayoutDigest": "0x39f298bf725abe5173d3a3b8ded2d4776d4c53fc9923f0027170dd458210a6f8",
                  "wiring": {
                        "core": "0x980B4424c007CAf7a1f3670B48c8EaEf7EbC3d44",
                        "token": "0x5501E1Fa81Be1c3F49225fa7668DA0245d07Db60",
                        "mining": "0xcd46990f8349057335289Ef282c276204B6CDC62",
                        "governance": "0xA68A2Fa1ffCFf79a8E143F05DDcdC48fbAeaafcB",
                        "genesis": "0xCB98349c134aB983dA5BfD80527dfe2552bDB70F",
                        "launch": "0x0000000000000000000000000000000000000000"
                  }
            },
            "token": {
                  "address": "0x5501E1Fa81Be1c3F49225fa7668DA0245d07Db60",
                  "runtimeCodeHash": "0x36c1dd05e8287e0af23d46e37e9e2a391b62f9c95fe3d4c130f0382d6d163ea7",
                  "implSlot": "0x0000000000000000000000000000000000000000",
                  "adminSlot": "0x0000000000000000000000000000000000000000",
                  "wiring": {
                        "mining": "0xcd46990f8349057335289Ef282c276204B6CDC62"
                  }
            },
            "nft": {
                  "address": "0xCB98349c134aB983dA5BfD80527dfe2552bDB70F",
                  "runtimeCodeHash": "0xbf4248fb7bf92f824c01eabcd798c08e08f6ba1dde84b2d2579d9dd59547a92a",
                  "implSlot": "0x0000000000000000000000000000000000000000",
                  "adminSlot": "0x0000000000000000000000000000000000000000",
                  "wiring": {
                        "sqkCore": "0x980B4424c007CAf7a1f3670B48c8EaEf7EbC3d44",
                        "mining": "0xcd46990f8349057335289Ef282c276204B6CDC62",
                        "renderer": "0x50888Ea2469Cc4E619bfcBdc4A7E7d58d4Ddd165",
                        "art": "0x0677aCa34747cD8e60f988F75e2f89d5E00Bb27D",
                        "governance": "0xA68A2Fa1ffCFf79a8E143F05DDcdC48fbAeaafcB",
                        "guardian": "0x3C4C2BA9a5DFBfc5e48dcEABdd3B004131a04BE6",
                        "launch": "0x1ff6485aBfBB2d183Cd673D78e1Ab31c098E04Dd"
                  }
            },
            "launch": {
                  "address": "0x1ff6485aBfBB2d183Cd673D78e1Ab31c098E04Dd",
                  "runtimeCodeHash": "0xa5ece17567ab4f3796e252bb5e05ac66452e854904a6e0ae566dddc91ab9ccbf",
                  "implSlot": "0x0000000000000000000000000000000000000000",
                  "adminSlot": "0x0000000000000000000000000000000000000000",
                  "wiring": {}
            }
      }
},
    capabilities: { checkpoint: true, claim: true, merge: true, deposit: true, withdraw: true, mergeDeposited: true, claimAndStake: true, stake: true, unstake: true, art: true, transfer: false, reads: true },
    notes: "Equal profile: every operation checks the dated identity pins and same-block two-peer agreement. Mismatch stops actions.",
    apiBase: "https://api.squeekchain.com",
    startBlock: 11998937n,
  },

  "sepolia-v6": {
    key: "sepolia-v6",
    label: "Sepolia v6",
    short: "v6",
    chainId: 11155111,
    hexChainId: "0xaa36a7",
    kind: "deployed",
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
    capabilities: { checkpoint: true, claim: true, merge: true, deposit: false, art: true, transfer: false, reads: true },
    notes:
      "Equal profile: every operation checks the published identity pins and same-block two-peer agreement. Mismatch stops actions.",
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

export const DEFAULT_PROFILE = "sepolia-v9";

export const listProfiles = () => Object.values(PROFILES);
export function getProfile(key = DEFAULT_PROFILE) {
  if (!Object.hasOwn(PROFILES, key)) throw new Error(`Unknown canonical profile: ${key}`);
  return PROFILES[key];
}
