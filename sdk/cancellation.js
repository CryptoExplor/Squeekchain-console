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
