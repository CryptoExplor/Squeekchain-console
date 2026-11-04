// EIP-1193 requests cannot be cancelled at the wallet. Stop awaiting them and
// discard their late result; HTTP reads additionally receive this signal in fetchOptions.
export function throwIfAborted(signal) {
  if (signal?.aborted) throw signal.reason ?? new DOMException('Profile load cancelled', 'AbortError');
}
export function abortable(operation, signal) {
  throwIfAborted(signal);
  if (!signal) return Promise.resolve().then(operation);
  return new Promise((resolve, reject) => {
    const aborted = () => { cleanup(); reject(signal.reason ?? new DOMException('Profile load cancelled', 'AbortError')); };
    const cleanup = () => signal.removeEventListener('abort', aborted);
    signal.addEventListener('abort', aborted, { once: true });
    Promise.resolve().then(() => { throwIfAborted(signal); return operation(); }).then(
      value => { cleanup(); if (signal.aborted) reject(signal.reason); else resolve(value); },
      error => { cleanup(); reject(error); },
    );
  });
}

// A scoped deadline. Always dispose in finally, after consuming the response body.
// Older wallet WebViews need neither AbortSignal.any nor AbortSignal.timeout.
export function anySignal(signals = [], ms) {
  const inputs = [...new Set(signals.filter(Boolean))], controller = new AbortController();
  if (typeof AbortSignal.any === 'function' && typeof AbortSignal.timeout === 'function') {
    const signal = AbortSignal.any([...inputs, ...(ms == null ? [] : [AbortSignal.timeout(ms)]), controller.signal]);
    return { signal, dispose: () => controller.abort() };
  }
  let timer;
  const listeners = new Map();
  const dispose = () => { clearTimeout(timer); for (const [signal, listener] of listeners) signal.removeEventListener('abort', listener); listeners.clear(); };
  const abort = reason => { if (!controller.signal.aborted) controller.abort(reason); dispose(); };
  for (const signal of inputs) {
    if (signal.aborted) { abort(signal.reason); break; }
    const listener = () => abort(signal.reason); listeners.set(signal, listener); signal.addEventListener('abort', listener, { once: true });
  }
  if (!controller.signal.aborted && ms != null) timer = setTimeout(() => abort(new DOMException('Request timed out', 'TimeoutError')), ms);
  return { signal: controller.signal, dispose };
}
