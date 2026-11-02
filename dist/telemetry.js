// Display-only device telemetry. Never used as input to an unsigned transaction.
export function createTelemetry({ fetcher = globalThis.fetch, now = Date.now } = {}) {
  let etag = null;
  let cached = null;
  let retryAt = 0;
  return {
    async read() {
      if (now() < retryAt) throw new Error('Rate limited. Waiting before the next refresh.');
      const response = await fetcher('https://api.squeekchain.com/v1/status', {
        headers: etag ? { 'If-None-Match': etag } : {},
        signal: AbortSignal.timeout(10_000),
      });
      if (response.status === 304 && cached) return cached;
      if (!response.ok) {
        const delay = Number(response.headers.get('Retry-After'));
        if (response.status === 429 || response.status === 503) retryAt = now() + (Number.isFinite(delay) && delay > 0 ? delay : 30) * 1000;
        throw new Error(`Official API unavailable (HTTP ${response.status}).`);
      }
      const data = await response.json();
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
  if (!m) return { state: 'Unknown', note: 'No device reading available.', rpm: '—', speed: '—', distance: '—' };
  const age = Math.max(0, Math.floor((now - Date.parse(m.receivedAt)) / 1000));
  const stale = m.freshness !== 'online' || age > 120;
  return {
    state: stale ? 'Stale' : m.coreStatus === 'COUNTER_FAULT' ? 'Device fault' : m.rpmMilli > 0 ? 'Running' : 'Resting',
    rpm: stale ? '—' : (m.rpmMilli / 1000).toFixed(1),
    speed: stale ? '—' : `${(m.speedMmPerSecond / 1000).toFixed(2)} m/s`,
    distance: stale ? '—' : `${(m.distanceMm / 1_000_000).toFixed(2)} km`,
    note: `${stale ? 'Stale device data' : 'Device reading'} · ${age}s ago. Measurement is not settled work.`,
  };
}
