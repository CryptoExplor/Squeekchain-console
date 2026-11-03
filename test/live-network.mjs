import { rpcErrorDiagnostics, safeRpcEndpoint } from '../sdk/rpc-errors.js';

// Passive Playwright observation only: no interception/mocks, headers or params.
export function observeLiveRpc(page, urls) {
  const origins = new Set(urls.map(url => new URL(url).origin));
  const records = [], pending = new Set(), cors = new Set();
  const requests = new WeakMap();
  let sequence = 0;
  function identify(request) {
    if (requests.has(request)) return requests.get(request);
    if (!origins.has(safeRpcEndpoint(request.url())) || request.method() !== 'POST') return null;
    try {
      const method = JSON.parse(request.postData() ?? '{}').method;
      if (!/^(eth|net|web3)_[a-zA-Z0-9_]+$/.test(method ?? '')) return null;
      const entry = { id: ++sequence, startedAtMs: Date.now(), endpoint: safeRpcEndpoint(request.url()), method };
      requests.set(request, entry);
      return entry;
    } catch { return null; }
  }
  const append = record => { records.push({ ...record, observedAtMs: Date.now() }); if (records.length > 256) records.shift(); };
  page.on('request', identify);
  page.on('response', response => {
    const entry = identify(response.request());
    if (!entry) return;
    const task = (async () => {
      const record = { ...entry, httpStatus: response.status(), outcome: response.ok() ? 'http-success' : 'http-error' };
      try {
        const body = await response.json();
        if (body.error) {
          record.outcome = 'json-rpc-error';
          record.rpcError = rpcErrorDiagnostics({ name: 'RpcRequestError', code: body.error.code, message: body.error.message });
        }
      } catch { record.bodyReadableAsJson = false; }
      append(record);
    })();
    pending.add(task); void task.finally(() => pending.delete(task));
  });
  page.on('requestfailed', request => {
    const entry = identify(request);
    if (!entry) return;
    const text = request.failure()?.errorText ?? '';
    append({ ...entry, httpStatus: null, outcome: 'browser-network-error',
      browserError: /^net::ERR_[A-Z0-9_]+$/.test(text) ? text : 'Network request failed',
      cors: 'unknown unless the browser explicitly reported a CORS policy rejection' });
  });
  page.on('console', message => {
    const text = message.text();
    if (/CORS policy/i.test(text)) for (const value of text.match(/https?:\/\/[^\s"'<>]+/g) ?? []) {
      const origin = safeRpcEndpoint(value);
      if (origins.has(origin)) cors.add(origin);
    }
  });
  return {
    async evidence() {
      await Promise.allSettled([...pending]);
      return { requests: records.slice(), browserReportedCorsRejections: [...cors],
        note: 'Passive observation; TypeError/ERR_FAILED alone cannot distinguish CORS, DNS/TLS or other network failure. Cooldown skips issue no HTTP request and appear in tool diagnostics instead.' };
    },
  };
}
