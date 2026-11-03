// Pinned from https://docs.squeekchain.com/assets/deployments/sepolia.json
// Re-read 2026-11-02. API observations are never a source of transaction addresses.
export const DEPLOYMENT = {
  release: "squeeks-sepolia-core3-mining6-001",
  core: "0x74665dAecA35A2303e767E76a2FF1FB6F93e119f",
  mining: "0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4",
  token: "0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76",
  nft: "0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6",
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
  nftStartBlock: 11902282n,
  versions: { core: 3, mining: 6 },
  runtimeHashes: {
    core: "0xe8a5a5aa913141ddd8951cf9fcc1375044b541773e5b0bf8ee04a5c7ac2d194d",
    mining: "0x6097cf8e8f96ea654878ab0a35410240ab1b05668c08ce1b3f99e04116e88bc1",
  },
  renderer: "0x2dC7661D172fEf0FC900E0aD0f4ffCE68E8bfD75",
  validator: "0xA674943387967cEBEf3C2110026A56F0A78d7F24",
  art: "0x8dd828dab7471589b0123a99747408bc04f81567",
};

export const CORE_CONFIGURATION = {
  streamId: "0xa0186b1a24b217f12f56c8574b492e286d00cd94bb5546cba45b048b19c60e44",
  genesisTimestamp: 1791847800n, roundDuration: 600n, maxWorkPerRound: 10000n,
  maxRoundsPerBatch: 16, guardian: "0x0E1B21ED2fc5fc48E221D3E863f09589Cb490e73",
  reporter: "0xB317AB7Cc24fD5d94EA120B3b189bc6527a7d0Aa",
  initialWorkPerThousandBlocks: 10875, targetBlocksPerActiveRound: 40n,
  difficultySmoothingRounds: 30n, blockUnitsPerBlock: 1000000000n,
};

// Display-only policy from the official deployment record, re-read 2026-11-03.
// Runtime eligibility still comes from verified same-block chain reads.
export const SQUEEKS_POLICY = [1000, 3000, 7000, 15000, 31000, 63000, 127000, 255000, 511000, 1023000]
  .map((weight, index) => ({ level: index + 1, weight, cooldownBlocks: index === 9 ? 0 : (index + 1) * 2 }));
