// Legacy import facade. The shared SDK owns RPC trust and snapshot verification.
import { createSqueekchain } from '../sdk/squeekchain.js';
import { settings } from './config.js';
export const sdk = createSqueekchain({ rpcUrl: settings.rpcUrl });
