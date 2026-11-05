// Test-only view of the published deployment. The product reads profiles from
// sdk/deployments.js; these fixtures expose the flat, contract-name shape the
// existing safety tests were written against, built ONLY from published pins.
import { PUBLISHED_PROFILE } from '../../sdk/pins-core-20261103.js';
import { SQUEEKS_POLICY } from '../../sdk/policy.js';
const pins = PUBLISHED_PROFILE.identities.pins;
const address = name => PUBLISHED_PROFILE.addresses[name];
export const DEPLOYMENT = {
  ...PUBLISHED_PROFILE.addresses,
  chainId: PUBLISHED_PROFILE.chainId,
  release: PUBLISHED_PROFILE.identities.release,
  revision: PUBLISHED_PROFILE.identities.revision,
  timelock: pins.core?.wiring?.configuration?.governance ?? pins.core?.wiring?.authority?.timelock ?? null,
  implementations: Object.fromEntries(Object.entries(pins).map(([name, pin]) => [name, pin.implSlot ?? null])),
  layoutDigests: Object.fromEntries(Object.entries(pins).map(([name, pin]) => [name, pin.implementationStorageLayoutDigest ?? null])),
  proxyAdmins: Object.fromEntries(Object.entries(pins).map(([name, pin]) => [name, pin.adminSlot ?? null])),
  versions: Object.fromEntries(Object.entries(pins).map(([name]) => [name, null])),
  pins,
  core: address('core'), mining: address('mining'), issuance: address('issuance'),
  nft: address('nft'), token: address('token'), staking: address('staking'), genesis: address('genesis'),
};
export const CORE_CONFIGURATION = pins.core?.wiring?.configuration ?? {};
export { SQUEEKS_POLICY };
