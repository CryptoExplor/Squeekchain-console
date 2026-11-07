#!/usr/bin/env node
// Phase 10 prescan: runs the same Explore index the browser runs (web/explore-index.js +
// web/explore-chain.js, two-peer snapshot path) up to a finalized block N = head - 64,
// then writes the compact display-only snapshot web/snapshot/sepolia.json.
// The snapshot is DISPLAY data only. The client re-verifies N's hash on two peers and
// never puts a snapshot value into a transaction.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getProfile, createRpcContext } from '../web/bundle.js';
import { createExploreIndex } from '../web/explore-index.js';
import { createExploreReader } from '../web/explore-chain.js';
import { encodeSnapshot } from '../web/explore-snapshot.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = process.env.SNAPSHOT_OUT || path.join(ROOT, 'web/snapshot/sepolia.json');
const FINALITY = 64n;
const profile = getProfile('sepolia');
if (!profile?.addresses || profile.identities?.release !== 'core-sepolia-20261103') throw new Error('Unexpected Sepolia profile');

const started = Date.now();
const log = (...a) => console.log(`[${((Date.now() - started) / 1000).toFixed(1)}s]`, ...a);
const head = await createRpcContext({}).client.getBlockNumber({ cacheTime: 0 });
const N = head - FINALITY;
log('head', String(head), '→ snapshot block', String(N));

const memory = new Map();
const store = { get: async k => memory.get(k), set: async (k, v) => { memory.set(k, v); } };
const base = createExploreReader({ profile, chainCache: new Map(), verificationCache: new Map() });
// Pin the index to N: begin() with no argument would pick head - 12.
const reader = { ...base, begin: () => base.begin(N) };
let lastPhase = '';
const index = createExploreIndex({
  profile, store, reader, finalTimeoutMs: 60000,
  progress: p => { const key = p.phase + (p.phase === 'logs' ? Math.floor(Number(p.done) / 100000) : ''); if (key !== lastPhase) { lastPhase = key; log(p.phase, p.done, '/', p.total, p.tokens ?? '', p.headers ?? ''); } },
});
let state;
for (let attempt = 1; attempt <= 3; attempt++) {
  state = await index.sync();
  if (state.complete) break;
  log('index incomplete, retrying final check', attempt);
}
if (!state.complete) throw new Error('Index incomplete: refusing to write a snapshot');
if (String(state.snapshot.blockNumber) !== String(N)) throw new Error('Snapshot block drifted');

const snapshot = encodeSnapshot(state, profile);
const json = JSON.stringify(snapshot);
const previous = fs.existsSync(OUT) ? fs.readFileSync(OUT, 'utf8') : null;
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, json + '\n');
log('wrote', path.relative(ROOT, OUT), `${(json.length / 1024).toFixed(1)} KB`, `${snapshot.tokens.length} tokens`, `${snapshot.events.length} events`, previous === json + '\n' ? '(unchanged)' : '');
