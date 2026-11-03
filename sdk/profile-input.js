import { PROFILES, DEFAULT_PROFILE } from './deployments.js';
// Compatibility lives ONLY at input boundaries. Never pass a legacy key to an adapter/cache.
export function profileInput(value, { fallback = DEFAULT_PROFILE } = {}) {
  const key = value === 'sepolia' ? 'sepolia-v9' : value;
  if (Object.hasOwn(PROFILES, key)) return key;
  if (fallback === null) throw new Error('Unknown profile');
  return fallback;
}
