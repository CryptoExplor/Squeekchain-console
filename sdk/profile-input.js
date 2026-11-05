import { PROFILES, DEFAULT_PROFILE } from './deployments.js';
// Compatibility lives ONLY at input boundaries. Never pass a legacy key to an adapter/cache.
const ALIASES = Object.freeze({
  'sepolia-v9': 'sepolia',
  'sepolia-v6': 'sepolia',
  'sepolia-v9-live': 'sepolia',
  'sepolia-core-20261103': 'sepolia',
});
export function profileInput(value, { fallback = DEFAULT_PROFILE } = {}) {
  // There is one Sepolia network now. Historical keys are aliases, never profiles.
  const key = Object.hasOwn(ALIASES, value) ? ALIASES[value] : value;
  if (Object.hasOwn(PROFILES, key)) return key;
  if (fallback === null) throw new Error('Unknown profile');
  return fallback;
}
export function profileFromHash(hash = '') {
  const first = String(hash).replace(/^#/, '').replace(/^\//, '').split('/')[0];
  if (!first) return null;
  const key = Object.hasOwn(ALIASES, first) ? ALIASES[first] : first;
  return Object.hasOwn(PROFILES, key) ? key : null;
}
// '#sepolia-v9/explore' -> '#sepolia/explore'; null when there is nothing to rewrite.
export function canonicalHash(hash = '') {
  const text = String(hash);
  if (!text.startsWith('#')) return null;
  const [first, ...rest] = text.slice(1).replace(/^\//, '').split('/');
  if (!first || !Object.hasOwn(ALIASES, first)) return null;
  return `#${[ALIASES[first], ...rest].join('/')}`;
}
