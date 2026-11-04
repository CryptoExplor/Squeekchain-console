import { DISPLAY_TTL, anySignal, throwIfAborted } from './bundle.js';
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
      throwIfAborted(signal);
      if (now() < retryAt) throw new Error('Rate limited. Waiting before the next refresh.');
      const deadline=anySignal([signal],10000);
      try {
      const response = await fetcher('https://api.squeekchain.com/v1/status', {
        headers: etag ? { 'If-None-Match': etag } : {},
        signal:deadline.signal,
      });
      throwIfAborted(signal);
      if (response.status === 304 && cached) return cached;
      if (!response.ok) {
        if (response.status === 429 || response.status === 503) {
          const timestamp = now();
          retryAt = timestamp + retryDelaySeconds(response.headers.get('Retry-After'), timestamp) * 1000;
        }
        throw new Error(`Official API unavailable (HTTP ${response.status}).`);
      }
      const data = await response.json();
      throwIfAborted(signal);
      if (data.schemaVersion !== 1) throw Object.assign(new Error('Unsupported telemetry schema.'),{kind:'schema'});
      if (data.status === 'unavailable') throw Object.assign(new Error(String(data.reason ?? 'Device data unavailable.')),{kind:'unavailable'});
      const m = data.measurement;
      if (m !== null && (!m || !['online', 'stale'].includes(m.freshness) || !['rpmMilli', 'speedMmPerSecond', 'distanceMm'].every(k => Number.isSafeInteger(m[k]) && m[k] >= 0) || !Number.isFinite(Date.parse(m.receivedAt)))) {
        throw Object.assign(new Error('Invalid device reading.'),{kind:'schema'});
      }
      etag = response.headers.get('ETag');
      cached = data;
      return data;
      } finally { deadline.dispose(); }
    },
  };
}

export function telemetryView(data, now = Date.now()) {
  const m = data.measurement;
  if (!m) return { state: 'Unknown', note: 'No device reading available.', rpm: 'Unknown', speed: 'Unknown', distance: 'Unknown' };
  const rawAge = now - Date.parse(m.receivedAt);
  const age = Math.max(0, Math.floor(rawAge / 1000));
  if(!Number.isFinite(rawAge)||rawAge < -5000||rawAge>=DISPLAY_TTL)return {state:'Unknown',note:'Device reading expired.',rpm:'Unknown',speed:'Unknown',distance:'Unknown'};
  const stale = m.freshness !== 'online' || age > 120;
  return {
    state: stale ? 'Stale' : m.coreStatus === 'COUNTER_FAULT' ? 'Device fault' : m.rpmMilli > 0 ? 'Running' : 'Resting',
    rpm: (m.rpmMilli / 1000).toFixed(1),
    speed: `${(m.speedMmPerSecond / 1000).toFixed(2)} m/s`,
    distance: `${(m.distanceMm / 1_000_000).toFixed(2)} km`,
    age,
    note: `${stale ? 'Stale device data' : 'Device reading'} · ${age}s ago. Measurement is not settled work.`,
  };
}
