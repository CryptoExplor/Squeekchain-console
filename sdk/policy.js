// Display-only policy from the published deployment record
// (docs/deployments/core-sepolia-20261103.json, launchConfiguration.stakingPower).
// Runtime eligibility still comes from verified same-block chain reads.
export const SQUEEKS_POLICY = [1000, 2200, 4840, 10648, 23426, 51536, 113380, 249436, 548759, 1207269]
  .map((weight, index) => ({ level: index + 1, weight, cooldownBlocks: index === 9 ? 0 : (index + 1) * 2 }));
