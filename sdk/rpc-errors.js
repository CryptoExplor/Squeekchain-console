import { BaseError } from 'viem';

// viem/custom may add several wrappers. Bound/cycle-check traversal and retain
// a failed identity recheck without discarding the original method failure.
export function rpcCauses(error) {
  const pending = [{ error, branch: 'cause' }], seen = new Set(), result = [];
  while (pending.length && result.length < 48) {
    const item = pending.shift(), value = item.error;
    if (!value || (typeof value !== 'object' && typeof value !== 'function') || seen.has(value)) continue;
    seen.add(value); result.push(item);
    if (value.cause) pending.push({ error: value.cause, branch: 'cause' });
    if (value.recheckError) pending.push({ error: value.recheckError, branch: 'chainId-recheck' });
    if (value.priorError) pending.push({ error: value.priorError, branch: 'original-request' });
  }
  return result;
}
const causes = (error, predicate) => rpcCauses(error).some(item => predicate(item.error));
export const safeRpcEndpoint = value => {
  if (value === 'wallet') return value;
  try { const url = new URL(value); return /^https?:$/.test(url.protocol) ? url.origin : null; }
  catch { return null; }
};
const safeMethod = value => typeof value === 'string' && /^(eth|net|web3)_[a-zA-Z0-9_]{1,80}$/.test(value) ? value : null;
const errorNames = new Set(['Error', 'TypeError', 'RangeError', 'AbortError', 'RpcTrustError', 'RpcRequestContextError', 'RpcAvailabilityError', 'UnknownRpcError', 'HttpRequestError', 'RpcRequestError', 'TimeoutError', 'SqueekchainError', 'InvalidInputRpcError', 'InvalidParamsRpcError', 'LimitExceededRpcError', 'InternalRpcError', 'ResourceNotFoundRpcError', 'ResourceUnavailableRpcError', 'MethodNotFoundRpcError', 'MethodNotSupportedRpcError', 'ContractFunctionExecutionError', 'ContractFunctionRevertedError', 'CallExecutionError', 'ExecutionRevertedError', 'UserRejectedRequestError', 'TransactionRejectedRpcError', 'ChainMismatchError', 'ChainDisconnectedError']);
const numeric = value => typeof value === 'number' && Number.isFinite(value) ? value : null;

export class RpcTrustError extends Error {
  constructor(message) { super(message); this.name = 'RpcTrustError'; }
}
export function isTrustError(error) {
  return causes(error, item => item instanceof RpcTrustError || item.name === 'RpcTrustError');
}
// Match known fetch runtime messages, not a TypeError name or wrapper class.
// Anchor the whole message so a property named 'failed to fetch' cannot hide a bug.
const isFetchTypeError = error => /^(?:failed to fetch|fetch failed|load failed|networkerror when attempting to fetch(?: resource)?\.?|network request failed)$/i.test(String(error.message ?? '').trim());
export function isRpcProgrammingError(error) {
  return causes(error, item => item.name === 'TypeError' && !isFetchTypeError(item));
}
export function isLogRangeError(error) {
  return !isTrustError(error) && !isRpcProgrammingError(error) && !isExecutionError(error) && causes(error, item => Number(item.code) === 4444
    || /pruned history|block range|range.*(?:limit|too large)|too many (?:results|logs)|response.*(?:large|size)/i.test(`${item.message ?? ''} ${item.details ?? ''}`));
}
function isExecutionError(error) {
  return causes(error, item => /execution reverted/i.test(`${item.shortMessage ?? ''} ${item.message ?? ''}`)
    || ['UserRejectedRequestError', 'TransactionRejectedRpcError', 'ContractFunctionRevertedError'].includes(item.name));
}
export function isRpcAvailabilityError(error) {
  if (isTrustError(error) || isExecutionError(error) || isRpcProgrammingError(error)) return false;
  return isLogRangeError(error) || causes(error, item => item instanceof RpcAvailabilityError
    || ['RpcAvailabilityError', 'HttpRequestError', 'TimeoutError'].includes(item.name)
    || (item.name === 'TypeError' && isFetchTypeError(item))
    || [429, 503].includes(item.status)
    || /historical state|free plan|forbidden|missing trie node|state.*(?:pruned|unavailable)|rate limited|failed to fetch|fetch failed|load failed|network error|RPC.*(?:offline|unavailable)|timed? ?out/i.test(`${item.message ?? ''} ${item.details ?? ''}`));
}

// BaseError survives viem's custom/buildRequest rather than becoming UnknownRpcError.
// Original errors remain in .cause for internal reasoning, never serialized raw.
export class RpcRequestContextError extends BaseError {
  constructor(cause, { endpoint, method, kind = 'rpc', status, recheckError, priorError, availability = false } = {}) {
    const safeEndpoint = safeRpcEndpoint(endpoint), methodName = safeMethod(method);
    super(`RPC ${kind} failure (${methodName ?? 'unknown method'} at ${safeEndpoint ?? 'unknown endpoint'})`, {
      cause, name: availability ? 'RpcAvailabilityError' : 'RpcRequestContextError',
    });
    this.endpoint = safeEndpoint; this.method = methodName; this.kind = kind;
    this.httpStatus = numeric(status); this.recheckError = recheckError; this.priorError = priorError;
    // Preserve stop/revert codes through context wrappers; never turn them into availability.
    this.code = rpcCauses(cause).map(item => numeric(item.error.code)).find(code => code !== null && code !== -1);
  }
}
export class RpcAvailabilityError extends RpcRequestContextError {
  constructor(cause, context = {}) { super(cause, { ...context, availability: true }); }
}
export function withRpcContext(error, context) {
  if (error instanceof RpcRequestContextError && !context.recheckError && !context.priorError) return error;
  const Type = isRpcAvailabilityError(error) ? RpcAvailabilityError : RpcRequestContextError;
  return new Type(error, context);
}

// No raw request bodies, parameters, headers, stacks, URL paths/query/auth or
// arbitrary provider text: those can contain custom-RPC API keys or credentials.
function safeCauseMessage(error) {
  const message = `${error.shortMessage ?? ''} ${error.message ?? ''} ${error.details ?? ''}`;
  if (isTrustError(error)) return /chainId|chain ID/i.test(message) ? 'RPC chain identity mismatch' : /hash/i.test(message) ? 'Snapshot block hash mismatch' : 'Deployment identity/trust verification failed';
  if (error instanceof RpcRequestContextError) return `RPC ${error.kind} failure`;
  if (/execution reverted/i.test(message)) return 'Execution reverted';
  if (error.name === 'TypeError') return isFetchTypeError(error)
    ? 'Transport TypeError (network/CORS cannot be distinguished from this alone)'
    : 'Non-network TypeError (possible programming error)';
  if (/Retry-After|rate limited/i.test(message)) return 'Rate limited / Retry-After cooldown';
  if (/pruned history/i.test(message)) return 'Pruned history unavailable';
  if (/historical state|missing trie node/i.test(message)) return 'Historical state unavailable';
  if (/range.*(?:limit|too large)|block range/i.test(message)) return 'Log range limit';
  if (/free plan/i.test(message)) return 'Endpoint plan restriction';
  if (/forbidden/i.test(message)) return 'Forbidden';
  if (/failed to fetch|fetch failed|load failed|network error/i.test(message)) return 'Network request failed';
  if (/timed? ?out/i.test(message)) return 'Request timeout';
  if (numeric(error.status) !== null) return 'HTTP request failed';
  if (numeric(error.code) !== null) return 'JSON-RPC request failed';
  return 'Request failed (provider message omitted for privacy)';
}
export function rpcErrorDiagnostics(error) {
  const chain = rpcCauses(error).map(({ error: item, branch }) => ({
    branch, name: errorNames.has(item.name) ? item.name : 'Error',
    message: safeCauseMessage(item), endpoint: safeRpcEndpoint(item.endpoint ?? item.url), method: safeMethod(item.method),
    httpStatus: numeric(item.httpStatus ?? item.status), rpcCode: numeric(item.code),
    kind: item instanceof RpcRequestContextError ? item.kind : null,
  }));
  const primary = [];
  const seen = new Set();
  for (let item = error; item && typeof item === 'object' && !seen.has(item) && primary.length < 48; item = item.cause) {
    seen.add(item);
    primary.push({ message: safeCauseMessage(item), endpoint: safeRpcEndpoint(item.endpoint ?? item.url), method: safeMethod(item.method),
      httpStatus: numeric(item.httpStatus ?? item.status), rpcCode: numeric(item.code) });
  }
  return {
    endpoint: primary.find(item => item.endpoint)?.endpoint ?? null,
    method: primary.find(item => item.method)?.method ?? null,
    httpStatus: primary.find(item => item.httpStatus !== null)?.httpStatus ?? null,
    rpcCode: primary.find(item => item.rpcCode !== null && item.rpcCode !== -1)?.rpcCode ?? null,
    availability: isRpcAvailabilityError(error), trust: isTrustError(error),
    reason: isTrustError(error) ? safeCauseMessage(error) : primary.at(-1)?.message ?? 'Request failed', causeChain: chain,
  };
}
export function rpcToolError(error, attempts = []) {
  const diagnostics = { ...rpcErrorDiagnostics(error), attempts };
  const message = diagnostics.endpoint
    ? `${diagnostics.reason}: ${diagnostics.method ?? 'unknown method'} at ${diagnostics.endpoint}${diagnostics.httpStatus === null ? '' : ` (HTTP ${diagnostics.httpStatus})`}`
    : String(error?.message ?? error).replace(/https?:\/\/[^\s"'<>]+/g, value => safeRpcEndpoint(value) ?? '[redacted endpoint]').slice(0, 500);
  return { error: message, revert: error?.revert ?? null, diagnostics };
}
