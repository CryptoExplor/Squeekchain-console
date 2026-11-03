// Display-only device telemetry. Never used as input to an unsigned transaction.
const DEFAULT_RETRY_SECONDS = 30;
const MAX_RETRY_SECONDS = 300;

// Accept seconds or an HTTP date; never let a bad header suspend polling indefinitely.
function retryDelaySeconds(header, timestamp) {
  const value = header?.trim();
  const seconds = value ? Number(value) : NaN;
  const delay = Number.isFinite(seconds) ? seconds : value ? (Date.parse(value) - timestamp) / 1000 : NaN;
  return Number.isFinite(delay) && delay > 0 && delay <= MAX_RETRY_SECONDS ? delay : DEFAULT_RETRY_SECONDS;
}

export function createTelemetry({ fetcher = globalThis.fetch, now = Date.now } = {}) {
  let etag = null;
  let cached = null;
  let retryAt = 0;
  return {
    async read({ signal } = {}) {
      signal?.throwIfAborted();
      if (now() < retryAt) throw new Error('Rate limited. Waiting before the next refresh.');
      const response = await fetcher('https://api.squeekchain.com/v1/status', {
        headers: etag ? { 'If-None-Match': etag } : {},
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
      });
      signal?.throwIfAborted();
      if (response.status === 304 && cached) return cached;
      if (!response.ok) {
        if (response.status === 429 || response.status === 503) {
          const timestamp = now();
          retryAt = timestamp + retryDelaySeconds(response.headers.get('Retry-After'), timestamp) * 1000;
        }
        throw new Error(`Official API unavailable (HTTP ${response.status}).`);
      }
      const data = await response.json();
      signal?.throwIfAborted();
      if (data.schemaVersion !== 1) throw new Error('Unsupported telemetry schema.');
      if (data.status === 'unavailable') throw new Error(String(data.reason ?? 'Device data unavailable.'));
      const m = data.measurement;
      if (m !== null && (!m || !['online', 'stale'].includes(m.freshness) || !['rpmMilli', 'speedMmPerSecond', 'distanceMm'].every(k => Number.isSafeInteger(m[k]) && m[k] >= 0) || !Number.isFinite(Date.parse(m.receivedAt)))) {
        throw new Error('Invalid device reading.');
      }
      etag = response.headers.get('ETag');
      cached = data;
      return data;
    },
  };
}

export function telemetryView(data, now = Date.now()) {
  const m = data.measurement;
  if (!m) return { state: 'Unknown', note: 'No device reading available.', rpm: 'Unknown', speed: 'Unknown', distance: 'Unknown' };
  const age = Math.max(0, Math.floor((now - Date.parse(m.receivedAt)) / 1000));
  const stale = m.freshness !== 'online' || age > 120;
  return {
    state: stale ? 'Stale' : m.coreStatus === 'COUNTER_FAULT' ? 'Device fault' : m.rpmMilli > 0 ? 'Running' : 'Resting',
    rpm: stale ? 'Unknown' : (m.rpmMilli / 1000).toFixed(1),
    speed: stale ? 'Unknown' : `${(m.speedMmPerSecond / 1000).toFixed(2)} m/s`,
    distance: stale ? 'Unknown' : `${(m.distanceMm / 1_000_000).toFixed(2)} km`,
    note: `${stale ? 'Stale device data' : 'Device reading'} · ${age}s ago. Measurement is not settled work.`,
  };
}
