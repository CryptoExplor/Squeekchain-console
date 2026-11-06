#!/usr/bin/env node
// Generates the published ABI set and identity pins for release core-sepolia-20261103
// from the checked-in PUBLISHED artifacts:
//   abi/core-sepolia-20261103/*.json          (published per-contract ABIs)
//   docs/deployments/core-sepolia-20261103.json (published deployment record, revision 7)
// Nothing here comes from the dApp bundle or from api.squeekchain.com.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const ABI_DIR = path.join(ROOT, 'abi/core-sepolia-20261103');
const RECORD_FILE = 'docs/deployments/core-sepolia-20261103.json';
const RECORD = JSON.parse(fs.readFileSync(path.join(ROOT, RECORD_FILE), 'utf8'));
const ZERO = '0x0000000000000000000000000000000000000000';

const files = {
  coreAbi: 'SqueekCore',
  nftAbi: 'SqueekNFT',
  tokenAbi: 'SqueekToken',
  miningAbi: 'SqueekMining',
  stakingAbi: 'SqueekStaking',
};
const abiParts = [
  '// AUTO-GENERATED from abi/core-sepolia-20261103/*.json — do not edit by hand.',
  `// Source: published deployment record ${RECORD.release} (revision ${RECORD.revision}), deploymentBlock ${RECORD.deploymentBlock}.`,
  '// Run `node sdk/generate-abi-release.mjs` to regenerate. No API or dApp-bundle trust.',
  '',
];
for (const [name, file] of Object.entries(files)) {
  const abi = JSON.parse(fs.readFileSync(path.join(ABI_DIR, `${file}.json`), 'utf8'));
  if (!Array.isArray(abi) || !abi.length) throw new Error(`${file}.json is not a non-empty ABI array`);
  abiParts.push(`export const ${name} = ${JSON.stringify(abi)};`, '');
}
fs.writeFileSync(path.join(ROOT, 'sdk/abi-core-20261103.js'), abiParts.join('\n'));

const c = RECORD.contracts;
const op = RECORD.operational ?? {};
const launch = RECORD.launchConfiguration ?? {};
const need = (value, label) => {
  if (!value) throw new Error(`published record is missing ${label}`);
  return value;
};
const lower = value => String(value).toLowerCase();

// Every value below is copied from the published record. Fields the record does
// not publish (proxy runtime code hash, implementation code version) are omitted
// on purpose instead of being invented here.
const pins = {
  core: {
    address: lower(need(c.SqueekCore?.address, 'SqueekCore.address')),
    runtimeCodeHash: null,
    implSlot: lower(need(c.SqueekCore?.implementation, 'SqueekCore.implementation')),
    adminSlot: lower(need(c.SqueekCore?.proxyAdmin, 'SqueekCore.proxyAdmin')),
    implCodeHash: lower(need(c.SqueekCore?.implementationRuntimeHash, 'SqueekCore.implementationRuntimeHash')),
    implementationStorageLayoutDigest: lower(need(c.SqueekCore?.storageLayoutDigest, 'SqueekCore.storageLayoutDigest')),
    wiring: {
      configuration: {
        streamId: lower(need(launch.core?.streamId, 'launchConfiguration.core.streamId')),
        genesisTimestamp: String(need(launch.core?.genesisTimestamp, 'launchConfiguration.core.genesisTimestamp')),
        roundDuration: String(need(launch.core?.roundDurationSeconds, 'launchConfiguration.core.roundDurationSeconds')),
        maxWorkPerRound: String(need(launch.core?.maxWorkPerRound, 'launchConfiguration.core.maxWorkPerRound')),
        guardian: lower(need(op.guardian?.address, 'operational.guardian.address')),
        reporter: lower(need(op.reporter?.address, 'operational.reporter.address')),
      },
    },
  },
  issuance: {
    address: lower(need(c.SqueekMining?.address, 'SqueekMining.address')),
    runtimeCodeHash: null,
    implSlot: lower(need(c.SqueekMining?.implementation, 'SqueekMining.implementation')),
    adminSlot: lower(need(c.SqueekMining?.proxyAdmin, 'SqueekMining.proxyAdmin')),
    implCodeHash: lower(need(c.SqueekMining?.implementationRuntimeHash, 'SqueekMining.implementationRuntimeHash')),
    implementationStorageLayoutDigest: lower(need(c.SqueekMining?.storageLayoutDigest, 'SqueekMining.storageLayoutDigest')),
    wiring: {
      bindings: {
        core: lower(c.SqueekCore.address),
        token: lower(c.SqueekToken.address),
        staking: lower(c.SqueekStaking.address),
        governance: lower(need(op.governanceTimelock?.address, 'operational.governanceTimelock.address')),
        streamId: lower(launch.core.streamId),
        genesisTimestamp: String(launch.core.genesisTimestamp),
        minimumTimelockDelay: String(need(op.governanceTimelock?.minDelaySeconds, 'operational.governanceTimelock.minDelaySeconds')),
      },
      core: lower(c.SqueekCore.address),
    },
  },
  staking: {
    address: lower(need(c.SqueekStaking?.address, 'SqueekStaking.address')),
    runtimeCodeHash: null,
    implSlot: lower(need(c.SqueekStaking?.implementation, 'SqueekStaking.implementation')),
    adminSlot: lower(need(c.SqueekStaking?.proxyAdmin, 'SqueekStaking.proxyAdmin')),
    implCodeHash: lower(need(c.SqueekStaking?.implementationRuntimeHash, 'SqueekStaking.implementationRuntimeHash')),
    implementationStorageLayoutDigest: lower(need(c.SqueekStaking?.storageLayoutDigest, 'SqueekStaking.storageLayoutDigest')),
    wiring: {
      core: lower(c.SqueekCore.address),
      token: lower(c.SqueekToken.address),
      mining: lower(c.SqueekMining.address),
      governance: lower(op.governanceTimelock.address),
    },
  },
  token: {
    address: lower(need(c.SqueekToken?.address, 'SqueekToken.address')),
    runtimeCodeHash: lower(need(c.SqueekToken?.runtimeHash, 'SqueekToken.runtimeHash')),
    implSlot: ZERO,
    adminSlot: ZERO,
    implCodeHash: null,
    implementationStorageLayoutDigest: null,
    wiring: {
      mining: lower(c.SqueekMining.address),
      miningBindingAuthority: lower(op.governanceTimelock.address),
    },
  },
  nft: {
    address: lower(need(c.SqueekNFT?.address, 'SqueekNFT.address')),
    runtimeCodeHash: lower(need(c.SqueekNFT?.runtimeHash, 'SqueekNFT.runtimeHash')),
    implSlot: ZERO,
    adminSlot: ZERO,
    implCodeHash: null,
    implementationStorageLayoutDigest: null,
    wiring: {
      sqkCore: lower(c.SqueekCore.address),
      governance: lower(op.governanceTimelock.address),
      guardian: lower(need(op.guardian?.address, 'operational.guardian.address')),
      renderer: lower(need(c.DotGridRenderer?.address, 'DotGridRenderer.address')),
      art: lower(need(op.dotGridPage?.address, 'operational.dotGridPage.address')),
      protocolRecipient: lower(need(op.reserveCustodySafe?.address, 'operational.reserveCustodySafe.address')),
    },
  },
};

const profile = {
  key: 'sepolia',
  label: 'Sepolia',
  short: 'sepolia',
  chainId: 11155111,
  hexChainId: '0xaa36a7',
  kind: 'deployed',
  issuanceShape: 'schedule',
  addresses: {
    core: pins.core.address,
    issuance: pins.issuance.address,
    mining: pins.issuance.address,
    staking: pins.staking.address,
    token: pins.token.address,
    nft: pins.nft.address,
    genesis: pins.nft.address,
  },
  identities: {
    release: RECORD.release,
    revision: RECORD.revision,
    protocolRevision: RECORD.protocolRevision,
    deploymentBlock: RECORD.deploymentBlock,
    source: RECORD_FILE,
    capturedAt: null,
    pins,
  },
  startBlock: String(RECORD.deploymentBlock),
};
const pinParts = [
  '// AUTO-GENERATED from docs/deployments/core-sepolia-20261103.json — do not edit by hand.',
  `// Published identities for ${RECORD.release} (revision ${RECORD.revision}).`,
  '// implementation, implementation runtime hash, storage layout digest and ProxyAdmin',
  '// are the published values; the record does not publish proxy runtime hashes or',
  '// implementation code versions, so those pins stay null instead of being guessed.',
  '',
  `export const PUBLISHED_PROFILE = ${JSON.stringify(profile, null, 2)};`,
  '',
];
fs.writeFileSync(path.join(ROOT, 'sdk/pins-core-20261103.js'), pinParts.join('\n'));
console.log('wrote sdk/abi-core-20261103.js and sdk/pins-core-20261103.js');
