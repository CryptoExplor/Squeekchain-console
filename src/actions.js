// Prepare-only owner actions. No signer, loop, automatic pair selection or submission.
import { sdk } from './chain.js';
export const runCheckpoint = from => sdk.checkpointPreview(from);
export const runClaim = (owner, ids) => sdk.claimPreview(owner, ids);
export const runMerge = (owner, survivor, donor, confirm) => sdk.mergePreview(owner, survivor, donor, { confirm });
