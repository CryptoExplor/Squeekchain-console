// Owner CLI configuration is public only. No .env loading, signer or identity overrides.
import { DEPLOYMENT } from '../sdk/record.js';
import { CHAIN } from '../sdk/squeekchain.js';
export const addresses = Object.fromEntries(['core', 'mining', 'token', 'nft'].map(key => [key, DEPLOYMENT[key]]));
export const settings = { rpcUrl: process.env.RPC_URL || undefined, chainId: CHAIN.id };
export const COLLECTION = 0;
