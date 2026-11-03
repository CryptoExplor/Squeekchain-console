import { throwIfAborted } from './cancellation.js';
import { retryAfterMs } from './retry-after.js';

const ACCOUNT_API = 'https://api.squeekchain.com/v1/accounts/';
const decimal = value => typeof value === 'string' && /^\d{1,78}$/.test(value) && BigInt(value) < 2n ** 256n;
const same = (a, b) => typeof a === 'string' && a.toLowerCase() === b.toLowerCase();

/** Official account API supplies candidate IDs ONLY. Discovery must confirm the complete
 * unique set using same-snapshot balanceOf/ownerOf on the configured NFT contract.
 * API release/contract metadata never configures an SDK, capability or transaction.
 */
export function createAccountTokenSource({ fetcher = (...args) => globalThis.fetch(...args), now = Date.now } = {}) {
  let retryAt = 0;
  return async function accountTokenIds({ owner, nft, signal }) {
    // Cursors may be invalidated by a reorg; restart once, never combine page sets.
    for (let restart = 0; restart < 2; restart++) {
      let cursor = null, context;
      const seen = new Set(), ids = new Set();
      for (let pageIndex = 0; pageIndex < 100; pageIndex++) {
        throwIfAborted(signal);
        if (now() < retryAt) throw new Error('Official account API rate limited; waiting for Retry-After');
        const query = new URLSearchParams({ limit: '100', ...(cursor ? { cursor } : {}) });
        const response = await fetcher(`${ACCOUNT_API}${owner.toLowerCase()}?${query}`, {
          headers: { accept: 'application/json' }, cache: 'no-store', credentials: 'omit',
          signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(10_000)]) : AbortSignal.timeout(10_000),
        });
        throwIfAborted(signal);
        if (response.status === 429 || response.status === 503) {
          const timestamp = now();
          retryAt = timestamp + retryAfterMs(response.headers.get('Retry-After'), timestamp);
        }
        if (!response.ok) {
          if (cursor && restart === 0 && response.status === 409) break;
          if (cursor && restart === 0 && response.status === 400) {
            const error = await response.json();
            if ((error.error?.code ?? error.code) === 'invalid_cursor') break;
          }
          throw new Error(`Official account API unavailable (HTTP ${response.status})`);
        }
        const data = await response.json();
        throwIfAborted(signal);
        // Validate the consumed schema fields. All reward, power, level, address and
        // transaction-like fields outside this hint context are deliberately ignored.
        if (data.schemaVersion !== 2 || data.status !== 'available') throw new Error('Official account API unavailable or unsupported schema');
        if (!same(data.account, owner) || data.chain?.target !== 'sepolia' || data.chain?.chainId !== '11155111'
          || !same(data.identities?.genesis, nft) || !decimal(data.chain?.safeThroughBlock)
          || !/^0x[0-9a-f]{64}$/i.test(data.chain?.safeBlockHash ?? '')
          || typeof data.release?.id !== 'string' || !data.release.id
          || !Array.isArray(data.tokens) || data.tokens.length > 100
          || !(data.nextCursor === null || (typeof data.nextCursor === 'string' && /^[A-Za-z0-9_-]{1,512}$/.test(data.nextCursor)))) {
          throw new Error('Invalid official account hint context');
        }
        const pageContext = `${data.release.id}:${data.chain.safeThroughBlock}:${data.chain.safeBlockHash.toLowerCase()}`;
        if (context && pageContext !== context) throw new Error('Official account pages changed snapshot/release');
        context = pageContext;
        for (const token of data.tokens) {
          if (!decimal(token.tokenId) || BigInt(token.tokenId) === 0n || !['wallet', 'staking'].includes(token.custody)) throw new Error('Invalid official account token hint');
          if (token.custody === 'wallet') ids.add(String(BigInt(token.tokenId)));
        }
        cursor = data.nextCursor;
        if (cursor === null) return [...ids].map(BigInt);
        if (seen.has(cursor)) throw new Error('Official account cursor repeated');
        seen.add(cursor);
        if (pageIndex === 99) throw new Error('Official account pagination limit exceeded');
      }
      if (restart === 1) throw new Error('Official account pagination unavailable');
    }
    throw new Error('Official account pagination unavailable');
  };
}
export const accountTokenIds = createAccountTokenSource();
