// Owner CLI configuration is public only. No .env loading, signer or identity overrides.
import { getProfile } from '../sdk/deployments.js';
const profile = getProfile();
export const addresses = profile.addresses;
export const settings = { rpcUrl: process.env.RPC_URL || undefined, chainId: profile.chainId };
export const COLLECTION = 0;
