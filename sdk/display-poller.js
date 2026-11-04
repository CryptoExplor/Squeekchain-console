// Completion-driven display polling, suspended while hidden. No fixed full-page RPC loop.
export function createWheelPoller({
  readStatus, readEvents, readBlocks, onStatus = () => {}, onBlocks = () => {},
  onFrontier = () => {}, onError = () => {}, frontier = () => ({}), contextKey = () => '',
  doc = globalThis.document, now = Date.now, setTimer = setTimeout, clearTimer = clearTimeout,
} = {}) {
  let timer, stopped = false, flight, lastContext, lastRound, lastProcessed, lastHeight, delay = 60000;
  function schedule() {
    if (!stopped && !doc?.hidden) {
      clearTimer(timer);
      timer = setTimer(() => { void tick(); }, delay);
    }
  }
  async function tick() {
    if (stopped || doc?.hidden) return;
    if (flight) return flight;
    clearTimer(timer);
    const key = contextKey(), current = () => !stopped && key === contextKey();
    if (lastContext !== key) {
      lastContext = key;
      lastRound = lastProcessed = lastHeight = undefined;
    }
    flight = (async () => {
      try {
        const result = await readStatus();
        if (!current()) return;
        const data = result.data ?? result, measurement = data.measurement;
        delay = !result.stale && measurement?.freshness === 'online' && measurement.coreStatus === 'ACTIVE'
          && now() - Date.parse(measurement.receivedAt) < 120000 ? 5000 : 60000;
        await onStatus(data, result);
        if (!current()) return;
        const baseline = frontier();
        lastRound ??= baseline.settled;
        lastProcessed ??= baseline.processed;
        const round = data.builder?.anchor?.settledThroughRound;
        let processed = lastProcessed;
        if (readEvents) {
          try {
            const events = await readEvents();
            if (!current()) return;
            for (const event of events.data.events) {
              if (event.type === 'system.mining_checkpointed' && /^\d+$/.test(event.payload?.throughRound ?? '')
                && (processed == null || BigInt(event.payload.throughRound) > BigInt(processed))) processed = event.payload.throughRound;
            }
          } catch (error) {
            if (!current()) return;
            onError(error, 'events');
            if (error.name === 'RpcTrustError') return;
          }
        }
        if (round != null && (round !== lastRound || processed !== lastProcessed)) {
          await onFrontier({ settled: round, processed });
          if (!current()) return;
          lastRound = round;
          lastProcessed = processed;
        }
        const height = data.builder?.projected?.blockHeight;
        if (readBlocks && height != null && height !== lastHeight) {
          const blocks = await readBlocks();
          if (!current()) return;
          await onBlocks(blocks);
          lastHeight = height;
        }
      } catch (error) {
        if (!current()) return;
        delay = 60000;
        onError(error, 'status');
      }
    })().finally(() => { flight = null; schedule(); });
    return flight;
  }
  function visibility() { clearTimer(timer); if (!doc.hidden) void tick(); }
  doc?.addEventListener?.('visibilitychange', visibility);
  return {
    tick, start: schedule,
    stop() { stopped = true; clearTimer(timer); doc?.removeEventListener?.('visibilitychange', visibility); },
    get delay() { return delay; },
  };
}
