// Compatibility facade: discovery and portfolio reads use the shared verified snapshot path.
import { sdk } from './chain.js';
export const discoverTokenIds = owner => sdk.discoverTokenIds(owner);
export const portfolio = owner => sdk.walletStatus(owner);
