// Walk viem/JSON-RPC cause chains without confusing endpoint limits with identity failures.
function causes(error, predicate) {
  for (let depth = 0; error && depth < 16; depth++, error = error.cause) {
    if (predicate(error)) return true;
  }
  return false;
}
export class RpcTrustError extends Error {
  constructor(message) { super(message); this.name = 'RpcTrustError'; }
}
export function isTrustError(error) {
  return causes(error, item => item instanceof RpcTrustError || item.name === 'RpcTrustError');
}
export function isLogRangeError(error) {
  return !isTrustError(error) && causes(error, item => Number(item.code) === 4444
    || /pruned history|block range|range.*(?:limit|too large)|too many (?:results|logs)|response.*(?:large|size)/i.test(`${item.message ?? ''} ${item.details ?? ''}`));
}
export function isRpcAvailabilityError(error) {
  return !isTrustError(error) && (isLogRangeError(error) || causes(error, item => /historical state|free plan|forbidden|missing trie node|state.*(?:pruned|unavailable)/i.test(`${item.message ?? ''} ${item.details ?? ''}`)));
}
