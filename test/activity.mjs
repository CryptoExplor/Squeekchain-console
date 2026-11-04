import assert from 'node:assert/strict';
import { createActivity } from '../web/activity.js';
const saved = new Map(), storage = { get: key => saved.get(key), set: (key, value) => saved.set(key, value) };
const hash = `0x${'ab'.repeat(32)}`, blockHash = `0x${'cd'.repeat(32)}`;
let receipt = null, confirmations = 1n;
const changes = [];
const reader = async () => receipt && ({ receipt, confirmations });
const activity = createActivity({ storage, receiptReader: reader, onChange: items => changes.push(items) });
activity.record(hash, 'checkpoint()');
activity.record(hash.toUpperCase().replace('0X', '0x'), 'duplicate');
assert.equal(activity.list().length, 1);
assert.equal(activity.list()[0].chain, 'Sepolia');
assert.ok([...saved.values()][0].includes(hash), 'hash is persisted immediately at broadcast, before receipt wait');
await activity.refresh();
assert.equal(activity.list()[0].status, 'pending');
receipt = { transactionHash: hash, blockHash, blockNumber: 50n, status: 'success' };
await activity.refresh();
assert.equal(activity.list()[0].status, 'mined');
confirmations = 12n;
await activity.refresh();
assert.equal(activity.list()[0].status, 'confirmed');
const reloaded = createActivity({ storage, receiptReader: reader });
assert.equal(reloaded.list()[0].status, 'pending', 'reload rechecks receipt rather than trusting storage status');
await reloaded.refresh();
assert.equal(reloaded.list()[0].status, 'confirmed');
const bad = createActivity({ storage, receiptReader: async () => { throw new Error('network'); } });
await bad.refresh();
assert.equal(bad.list()[0].status, 'pending');
assert.match(bad.list()[0].lastError, /No automatic transaction retry/);
const failure = createActivity({ storage: { get: () => null, set() { throw new Error('private mode'); } }, receiptReader: async () => ({ receipt: { ...receipt, status: 'reverted' }, confirmations: 12n }) });
failure.record(hash, 'merge(keep 1, burn 2)');
assert.equal((await failure.wait(hash)).status, 'reverted');
assert.throws(() => activity.record('not-a-hash', 'invalid'), /Invalid Sepolia/);
activity.clear();
assert.deepEqual(activity.list(), []);
assert.equal(JSON.parse([...saved.values()][0]).length, 0);
assert.deepEqual(changes.at(-1),[],'clear notifies the Activity badge');
for (const tracker of [activity, reloaded, bad, failure]) tracker.destroy();
assert.ok(changes.length > 1);
console.log('PASS Activity: immediate persistent broadcast, hash dedup, mined/final/revert status, reload recheck, unavailable receipts and private-mode fallback; no submission path');

// Legacy history belongs to v6, whereas an explicit legacy profile is migrated.
const KEY='wheelhouse:pending-transactions:v1';
const entry={hash,label:'Legacy checkpoint',chainId:11155111,time:new Date().toISOString()};
storage.set(KEY,JSON.stringify([entry]));
const legacy=createActivity({storage,receiptReader:reader});assert.equal(legacy.list()[0].profile,'sepolia-v6');legacy.destroy();
storage.set(KEY,JSON.stringify([{...entry,profile:'sepolia'}]));
const explicit=createActivity({storage,receiptReader:reader});assert.equal(explicit.list()[0].profile,'sepolia-v9');explicit.destroy();
let release;
storage.set(KEY,JSON.stringify([entry]));
const stale=createActivity({storage,receiptReader:()=>new Promise(resolve=>{release=resolve;})});
const clearing=createActivity({storage,receiptReader:reader});
const inFlight=stale.refresh();clearing.clear();release(null);await inFlight;
assert.deepEqual(stale.list(),[]);assert.deepEqual(JSON.parse(storage.get(KEY)),[],'receipt refresh in another tab cannot restore cleared history');
const events=new EventTarget();let notified;
const observed=createActivity({storage,eventTarget:events,onChange:list=>{notified=list;},receiptReader:reader});
clearing.record(hash,'New broadcast');const event=new Event('storage');event.key=KEY;events.dispatchEvent(event);
assert.equal(notified.length,1);clearing.clear();events.dispatchEvent(event);assert.deepEqual(notified,[]);
for(const tracker of [stale,clearing,observed])tracker.destroy();
console.log('PASS legacy Activity v6 migration, explicit alias migration, cross-tab clear during an awaited receipt and storage-event synchronization');

// Cross-tab records are rechecked, never trusted as confirmed from storage.
{
 const events=new EventTarget(),saved=new Map(),storage={get:k=>saved.get(k),set:(k,v)=>saved.set(k,v)};let reads=0,changed;
 const target=createActivity({storage,eventTarget:events,onChange:items=>changed=items,receiptReader:async item=>{reads++;return{receipt:{transactionHash:item.hash,blockHash,blockNumber:50n,status:item.hash===hash?'success':'reverted'},confirmations:12n};}});
 const otherHash='0x'+'ef'.repeat(32);storage.set(KEY,JSON.stringify([hash,otherHash].map(hash=>({...entry,hash,status:'confirmed'}))));
 const event=new Event('storage');event.key=KEY;events.dispatchEvent(event);await target.refresh();assert.equal(reads,2);assert.deepEqual(changed.map(i=>i.status),['confirmed','reverted']);target.destroy();
}
console.log('PASS PR review: storage-driven Activity reload refreshes confirmed/reverted receipts');
