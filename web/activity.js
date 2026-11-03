import { profileInput, getProfile, DEFAULT_PROFILE } from './bundle.js';
// Broadcast transactions outlive profile navigation. Storage is local/display-only;
// it is never used to construct or resubmit a transaction.
const KEY = 'wheelhouse:pending-transactions:v1';
const validHash = hash => /^0x[0-9a-f]{64}$/i.test(hash ?? '');
const terminal = item => item.status === 'confirmed' || item.status === 'reverted';
export function createActivity({ storage, receiptReader, onChange = () => {}, now = Date.now } = {}) {
  const controller = new AbortController();
  let items = [], refreshing = null;
  try {
    const saved = JSON.parse(storage?.get(KEY) ?? '[]');
    if (Array.isArray(saved)) items = saved.filter(item => validHash(item.hash) && item.chainId === 11155111
      && typeof item.label === 'string' && item.label.length <= 200 && Number.isFinite(Date.parse(item.time)))
      .map(item => ({ ...item, profile: profileInput(item.profile), status: 'pending' })); // re-read receipts after reload, even if previously mined
  } catch { /* malformed/disabled storage is not chain state */ }
  const list = () => items.map(item => ({ ...item }));
  function save() {
    // Retain ALL unresolved transactions, plus the most recent 100 settled ones.
    let settled = 0;
    items = items.filter(item => !terminal(item) || settled++ < 100);
    try { storage?.set(KEY, JSON.stringify(items)); } catch { /* current-tab activity still works */ }
    if (!controller.signal.aborted) onChange(list());
  }
  function record(hash, label, chainId = 11155111, profile = DEFAULT_PROFILE) {
    if(getProfile(profile).chainId!==chainId)throw new Error('Activity profile/chain mismatch');
    if (!validHash(hash) || chainId !== 11155111) throw new Error('Invalid Sepolia transaction hash');
    if (!items.some(item => item.hash.toLowerCase() === hash.toLowerCase())) {
      items.unshift({ hash, profile, label: String(label).slice(0, 200), chain: 'Sepolia', chainId, time: new Date(now()).toISOString(), status: 'pending' });
      save();
    }
    return items.find(item => item.hash.toLowerCase() === hash.toLowerCase());
  }
  async function refresh() {
    if (controller.signal.aborted) return list();
    if (refreshing) return refreshing;
    refreshing = (async () => {
      // Serial, bounded read concurrency; never resubmit a hash or a transaction.
      for (const item of items.filter(item => !terminal(item))) {
        try {
          const result = await receiptReader(item, { signal: controller.signal });
          if (controller.signal.aborted) break;
          if (!result) { item.status = 'pending'; item.lastError = 'Receipt not available yet; check your wallet before retrying.'; continue; }
          const { receipt, confirmations } = result;
          if (receipt.transactionHash.toLowerCase() !== item.hash.toLowerCase() || !['success', 'reverted'].includes(receipt.status)) throw new Error('Receipt identity mismatch');
          Object.assign(item, { blockNumber: String(receipt.blockNumber), blockHash: receipt.blockHash,
            receiptStatus: receipt.status, confirmations: String(confirmations),
            status: confirmations >= 12n ? receipt.status === 'success' ? 'confirmed' : 'reverted' : 'mined', lastError: null });
        } catch (error) {
          if (controller.signal.aborted) break;
          item.lastError = 'Receipt unavailable; check your wallet. No automatic transaction retry.';
          // Do not retain a previously mined receipt as current truth when it cannot be checked.
          item.status = 'pending';
        }
      }
      save();
      return list();
    })().finally(() => { refreshing = null; });
    return refreshing;
  }
  function pause(ms) {
    return new Promise((resolve, reject) => {
      const stopped = () => { clearTimeout(timer); reject(new DOMException('Activity stopped', 'AbortError')); };
      const timer = setTimeout(() => { controller.signal.removeEventListener('abort', stopped); resolve(); }, ms);
      controller.signal.addEventListener('abort', stopped, { once: true });
      if (controller.signal.aborted) stopped();
    });
  }
  async function wait(hash, { timeout = 180_000, interval = 2_000 } = {}) {
    const started = now();
    while (!controller.signal.aborted && now() - started < timeout) {
      await refresh();
      const item = items.find(item => item.hash.toLowerCase() === hash.toLowerCase());
      if (item?.receiptStatus && item.status !== 'pending') return { ...item };
      await pause(interval);
    }
    throw new Error('Receipt outcome unclear. Saved in Activity; check your wallet before retrying.');
  }
  return { list, record, refresh, wait, clear: () => { items = []; save(); }, destroy: () => controller.abort() };
}
