import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { mount } from '../web/app.js';
import { createTelemetry, telemetryView } from '../web/telemetry.js';

const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
const timestamp = Date.now();
const payload = { schemaVersion: 1, measurement: { freshness: 'online', receivedAt: new Date(timestamp).toISOString(), coreStatus: 'ACTIVE', rpmMilli: 12500, speedMmPerSecond: 800, distanceMm: 1000000 } };
const response = (body = payload, status = 200, headers = {}) => ({ ok: status === 200, status, headers: new Headers(headers), json: async () => body });
const net = { core: { settledThroughRound: '1000', blockHeight: '6800', paused: false }, mining: { lagRounds: '0', minted: { sqk: '27000000' } }, nft: { totalSupply: '9972' }, checkpoint: { canCheckpoint: false, reason: 'No new settled rounds' } };
const holdings = { owner, ethBalance: { eth: '0.1' }, totals: { count: 1, deposited: 0, claimable: { sqk: '0' } }, squeeks: [{ tokenId: '1', level: 1, nextMergeHeight: '2', deposited: false }] };
const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://console.test/' });
const { window: win } = dom;
const $ = id => win.document.getElementById(id);
win.localStorage.setItem("squeekchain:profile", "sepolia-v9");
let rejectNetwork = false, pending, selectedClaim, selectedMerge;
const adapter = {
  networkStatus: async () => { if (pending) return pending; if (rejectNetwork) throw new Error('RPC offline'); return net; },
  verify: async () => ({ ok: true, trusted: true }),
  walletStatus: async () => holdings,
  mergePlan: async () => ({ pairs: [] }),
  claimPreview: async (_owner, ids) => { selectedClaim = ids; return { ok: false, batches: [], reason: "Test stops before signing" }; },
  mergePreview: async (_owner, survivor, donor) => { selectedMerge = { survivor, donor }; throw new Error("Test stops before signing"); },
  art: async tokenId => ({ tokenId, name: 'Test Squeek', attributes: [], image: 'data:image/svg+xml;base64,PHN2Zy8+' }),
};
win.ethereum = { request: async ({ method }) => method === 'eth_chainId' ? '0xaa36a7' : [owner], on() {} };
const api = mount({ profileBalanceReader: async () => ({"sepolia-v6":{"wallet":"0","staked":"0","nftPower":"0"},"sepolia-v9":{"wallet":"0","staked":"0","nftPower":"0"}}), doc: win.document, win, adapterFactory: () => adapter, fetcher: async () => response() });
await api.refresh();
assert.equal(win.document.documentElement.dataset.theme, 'light');
assert.equal($('btn-theme').getAttribute('aria-pressed'), 'false');
$('btn-theme').click(); assert.equal(win.document.documentElement.dataset.theme, 'dark');
assert.equal($('btn-theme').getAttribute('aria-pressed'), 'true');
assert.equal($('btn-theme').title, 'Switch to light theme');
$('btn-theme').click(); assert.equal(win.localStorage.getItem('squeekchain:theme'), 'light');
assert.equal($('net-round').textContent, '1000');
assert.equal($('settlement-notice').classList.contains('hidden'),true);
assert.equal($('btn-checkpoint').disabled, true);
assert.equal($('capability-grid').children.length, 5);
assert.match($('wheel-rpm').textContent, /12.5/);
win.document.querySelector('[data-testid="tab-squeeks"]').click();
assert.equal(win.document.querySelector('[data-panel="squeeks"]').classList.contains('hidden'), false);
await api.connect();
assert.equal($('squeeks-tbody').children.length, 1);
assert.equal($('btn-claim').disabled, false);
assert.ok(Object.hasOwn(api.tools(),'squeek_request_merge'));
assert.match((await api.callTool('squeek_request_merge',{survivor:'1',donor:'2'})).error,/BURN-2/);
assert.equal(selectedMerge,undefined,'request merge must refuse before construction without the burn acknowledgement');
await api.loadArt(['1']);
assert.equal($('art-grid').querySelectorAll('img').length, 1);
await api.switchProfile('sepolia-v6');
net.checkpoint.roundSettled = false;
await api.refresh();
assert.equal($('settlement-notice').classList.contains('hidden'),true);
assert.equal($('net-round').textContent,'1000');
net.core.settledThroughRound = '1001'; net.checkpoint.roundSettled = true; net.checkpoint.canCheckpoint = true;
await api.refresh();
assert.equal($('net-round').textContent,'1001');
assert.doesNotMatch($('settlement-notice').textContent, /Next round is not settled/);
net.checkpoint.roundSettled = false; net.checkpoint.canCheckpoint = false;
assert.equal(api.state.account, null, 'switch clears the connected-wallet view');
await api.connect();
assert.ok(Object.keys(api.tools()).includes('squeek_prepare_merge'));
$('claim-ids').value = '1, 2';
await $('btn-claim').onclick();
assert.deepEqual(selectedClaim, ['1', '2']);
$('merge-survivor').value = '1'; $('merge-donor').value = '2';
const merging = $('btn-custom-merge').onclick();
await new Promise(resolve => setTimeout(resolve, 0));
assert.equal(selectedMerge, undefined, 'no merge simulation before BURN guard');
$('modal-input').value = '2'; $('modal-input').dispatchEvent(new win.Event('input'));
assert.equal($('btn-modal-confirm').disabled, true);
$('modal-input').value = 'BURN-2'; $('modal-input').dispatchEvent(new win.Event('input'));
$('btn-modal-confirm').click();
await merging;
assert.deepEqual(selectedMerge, { survivor: '1', donor: '2' });
await api.switchProfile('mainnet');
assert.equal($('profile-select').selectedOptions[0].disabled, false);
assert.match($('not-deployed-note').textContent, /no mainnet deployment/);
assert.equal($('settlement-notice').textContent, '', 'profile switches clear live frontier warnings');
assert.equal($('net-round').textContent, 'Unknown');
assert.equal($('btn-checkpoint').disabled, true);
assert.equal($('holder-body').classList.contains('hidden'), true);
assert.equal($('tool-call').options.length, 0);
assert.ok((await api.callTool('squeek_network_status')).error);
assert.equal($('wheel-rpm').textContent, 'Unknown');
// An in-flight testnet read must never repopulate the mainnet page.
let release;
pending = new Promise(resolve => { release = resolve; });
const switching = api.switchProfile('sepolia-v9');
await api.switchProfile('mainnet');
release(net); await switching; pending = null;
assert.equal($('net-round').textContent, 'Unknown');
rejectNetwork = true;
await api.switchProfile('sepolia-v9');
assert.equal($('verified-chip').textContent, 'Stopped');
assert.match($('banner').textContent, /Nothing was signed/);
api.destroy(); win.close();
console.log('PASS UI: theme, navigation, reads, wallet, gallery, capability gates, mainnet reset, stale-request isolation, RPC failure');

let calls = 0, clock = timestamp;
const telemetry = createTelemetry({ now: () => clock, fetcher: async (_url, options) => {
  calls++;
  if (calls === 1) return response(payload, 200, { ETag: '"a"' });
  assert.equal(options.headers['If-None-Match'], '"a"');
  if (calls === 2) return response(null, 304);
  return response(null, 429, { 'Retry-After': '60' });
} });
assert.equal((await telemetry.read()).measurement.rpmMilli, 12500);
assert.equal((await telemetry.read()).measurement.rpmMilli, 12500);
await assert.rejects(telemetry.read(), /429/);
await assert.rejects(telemetry.read(), /Rate limited/);
assert.equal(calls, 3);
assert.equal(telemetryView(payload, timestamp).state, 'Running');
assert.equal(telemetryView({ ...payload, measurement: { ...payload.measurement, rpmMilli: 0 } }, timestamp).state, 'Resting');
assert.equal(telemetryView(payload, timestamp + 121000).rpm, 'Unknown');
assert.equal(telemetryView({ measurement: null }).state, 'Unknown');
for (const bad of [{ schemaVersion: 99 }, { schemaVersion: 1, status: 'unavailable', reason: 'offline' }, { schemaVersion: 1, measurement: {} }]) {
  await assert.rejects(createTelemetry({ fetcher: async () => response(bad) }).read());
}
console.log('PASS telemetry: schema validation, unknown vs zero, stale readings, ETag/304, Retry-After backoff');

// Production no longer has a verification bypass for tests or integrations.
// Complete claim sorting/live ownership/simulation coverage lives in phase1-safety.mjs,
// using a test-only bundled record fixture rather than bypassing production verification.
const { createSqueekchain } = await import('../sdk/squeekchain.js');
assert.throws(() => createSqueekchain({ skipVerification: true }), /cannot be disabled/);
console.log('PASS SDK configuration: verification cannot be disabled');
