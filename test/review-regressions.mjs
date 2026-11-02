import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { mount } from '../web/app.js';
import { createTelemetry } from '../web/telemetry.js';

const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
const measurement = rpmMilli => ({ schemaVersion: 1, measurement: {
  freshness: 'online', receivedAt: new Date().toISOString(), coreStatus: 'ACTIVE',
  rpmMilli, speedMmPerSecond: 800, distanceMm: 1_000_000,
} });
const response = (body, status = 200, headers = {}) => ({
  ok: status === 200, status, headers: new Headers(headers), json: async () => body,
});
const tick = () => new Promise(resolve => setImmediate(resolve));
const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../web/styles.css', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://console.test/' });
const { window: win } = dom;
const doc = win.document;
const $ = id => doc.getElementById(id);
const style = doc.createElement('style'); style.textContent = css; doc.head.append(style);
const intervals = new Map();
win.setInterval = (callback, ms) => { intervals.set(ms, callback); return ms; };
win.clearInterval = ms => intervals.delete(ms);
let fetchHook = async () => response(measurement(12500));
let requests = 0, verifyFails = false, sends = 0;
const net = {
  core: { settledThroughRound: '1000', blockHeight: '6800', paused: false },
  mining: { lagRounds: '0', minted: { sqk: '27000000' } },
  nft: { totalSupply: '9972' }, checkpoint: { canCheckpoint: false, reason: 'No new rounds' },
};
const adapter = {
  networkStatus: async () => net,
  verify: async () => ({ ok: !verifyFails, problems: verifyFails ? ['Identity mismatch'] : [] }),
  walletStatus: async () => ({ owner, ethBalance: { eth: '0.1' },
    totals: { count: 1, deposited: 0, claimable: { sqk: '1' } },
    squeeks: [{ tokenId: '1', level: 1, nextMergeHeight: '2', deposited: false }] }),
  // Dialog-only fixtures. No real transaction or contract simulation occurs in this test.
  claimPreview: async () => ({ ok: true, total: { sqk: '1' }, batches: [] }),
  mergePreview: async () => ({ ok: true, gas: '100', tx: {} }),
  art: async tokenId => ({ tokenId, name: 'Test Squeek', attributes: [], image: 'data:image/svg+xml;base64,PHN2Zy8+' }),
};
win.ethereum = {
  request: async ({ method }) => {
    if (method === 'eth_chainId') return '0xaa36a7';
    if (method === 'eth_requestAccounts') return [owner];
    if (method === 'eth_sendTransaction') { sends++; throw new Error('Unexpected signing request'); }
    throw new Error(`Unexpected wallet method: ${method}`);
  },
  on() {},
};
win.localStorage.setItem("squeekchain:profile", "sepolia");
const api = mount({ doc, win, adapterFactory: () => adapter, fetcher: (...args) => { requests++; return fetchHook(...args); } });
try {
  await api.refresh(); await tick();
  const fields = ['wheel-state', 'wheel-rpm', 'wheel-speed', 'wheel-distance', 'wheel-note'];
  const reading = () => fields.map(id => $(id).textContent);
  assert.equal($('wheel-rpm').textContent, '12.5');

  let release;
  fetchHook = () => new Promise(resolve => { release = resolve; });
  const beforeManual = reading();
  await $('btn-refresh').onclick();
  assert.deepEqual(reading(), beforeManual, 'manual refresh keeps the complete reading while fetching');
  release(response(measurement(20000))); await tick();
  assert.equal($('wheel-rpm').textContent, '20.0');

  const beforePoll = reading();
  intervals.get(15_000)(); await tick();
  assert.deepEqual(reading(), beforePoll, 'polling keeps the complete reading while fetching');
  release(response(null, 403)); await tick();
  assert.equal($('wheel-state').textContent, 'Unknown');
  for (const id of ['wheel-rpm', 'wheel-speed', 'wheel-distance']) assert.equal($(id).textContent, '—');
  assert.equal($('net-round').textContent, '1000', 'API failure leaves chain panels alone');

  // An in-flight reading may not repaint a different profile.
  intervals.get(15_000)(); await tick();
  await api.switchProfile('mainnet');
  const unavailable = reading(), previousRequests = requests;
  release(response(measurement(30000))); await tick();
  await $('btn-refresh').onclick(); intervals.get(15_000)(); await tick(); await tick();
  assert.deepEqual(reading(), unavailable);
  assert.equal($('wheel-state').textContent, 'Unavailable');
  assert.equal(requests, previousRequests, 'non-Sepolia refreshes never fetch device telemetry');

  const switchingBack = api.switchProfile('sepolia');
  assert.equal($('wheel-state').textContent, 'Loading', 'profile change resets rather than reusing old readings');
  assert.equal($('wheel-rpm').textContent, '—');
  await switchingBack; release(response(measurement(5000))); await tick();
  assert.equal($('wheel-rpm').textContent, '5.0');
  fetchHook = async () => response(measurement(5000));
  console.log('PASS review: retain telemetry during manual/poll fetches, clear failures, isolate profiles');

  await api.connect();
  assert.match($('wallet-chip').textContent, /0x5989/);
  assert.match($('wallet-chip').textContent, /0\.100 ETH/);
  verifyFails = true; await api.refresh();
  assert.equal($('verified-chip').classList.contains('bad'), true);
  // jsdom does not lay out responsive viewports. Check the applicable CSS declarations
  // explicitly at each breakpoint; this is not a real-browser visual/layout assertion.
  for (const width of [320, 760, 1050, 1200]) {
    const visit = rules => {
      for (const rule of rules) {
        if (rule.media) {
          const max = /max-width:\s*(\d+)px/.exec(rule.conditionText);
          if (max && width <= Number(max[1])) visit(rule.cssRules);
        } else if (rule.selectorText && rule.style.display === 'none') {
          for (const id of ['wallet-chip', 'verified-chip']) {
            for (let node = $(id); node; node = node.parentElement) {
              assert.equal(node.matches(rule.selectorText), false, `${id} hidden at ${width}px by ${rule.selectorText}`);
            }
          }
        }
      }
    };
    visit(style.sheet.cssRules);
  }
  assert.notEqual(win.getComputedStyle($('wallet-chip')).display, 'none');
  console.log('PASS review: wallet text and verification failure remain visible in base and breakpoint CSS');

  verifyFails = false;
  await api.switchProfile('sepolia-v6');
  await api.connect();
  api.selectTab('holdings');
  const key = (name, shiftKey = false) => {
    const event = new win.KeyboardEvent('keydown', { key: name, shiftKey, bubbles: true, cancelable: true });
    doc.activeElement.dispatchEvent(event); return event;
  };
  const modalVisible = () => !$('modal').classList.contains('hidden');
  $('btn-claim').focus();
  const claim = api.requestClaim(); await tick();
  assert.ok(modalVisible());
  assert.equal(doc.activeElement, $('btn-modal-cancel'), 'untyped dialog focuses the safe cancel button');
  key('Tab'); assert.equal(doc.activeElement, $('btn-modal-confirm'));
  key('Tab'); assert.equal(doc.activeElement, $('btn-modal-cancel'));
  key('Tab', true); assert.equal(doc.activeElement, $('btn-modal-confirm'));
  $('btn-refresh').focus();
  assert.equal(doc.activeElement, $('btn-modal-cancel'), 'programmatic/background focus cannot escape');
  key('Escape');
  assert.equal((await claim).reason, 'cancelled');
  assert.equal(modalVisible(), false);
  assert.equal(doc.activeElement, $('btn-claim'));
  assert.equal(key('Tab').defaultPrevented, false, 'keyboard listener is removed on dismissal');

  // Confirmation follows the same close/restore lifecycle (zero-call fixture).
  const confirmed = api.requestClaim(); await tick();
  $('btn-modal-confirm').click(); await confirmed;
  assert.equal(doc.activeElement, $('btn-claim'));
  assert.equal(modalVisible(), false);

  $('btn-custom-merge').focus();
  const merge = api.requestMerge({ survivor: '1', donor: '2', nextLevel: 2 }); await tick();
  assert.equal(doc.activeElement, $('modal-input'), 'typed confirmation starts in the input');
  assert.ok($('btn-modal-confirm').disabled);
  key('Tab', true); assert.equal(doc.activeElement, $('btn-modal-cancel'), 'disabled confirm is excluded');
  key('Tab'); assert.equal(doc.activeElement, $('modal-input'));
  $('btn-modal-cancel').click(); await merge;
  assert.equal(doc.activeElement, $('btn-custom-merge'));

  api.selectTab('art'); await api.loadArt(['1']);
  $('btn-art-one').focus(); $('art-grid').firstElementChild.click();
  assert.ok(modalVisible());
  assert.equal(doc.activeElement, $('btn-modal-cancel'));
  key('Tab'); assert.equal(doc.activeElement, $('btn-modal-confirm'));
  key('Escape');
  assert.equal(doc.activeElement, $('btn-art-one'), 'art detail also restores focus');
  $('art-grid').firstElementChild.click(); $('btn-modal-confirm').click();
  assert.equal(modalVisible(), false);
  assert.equal(doc.activeElement, $('btn-art-one'));

  api.selectTab('holdings'); $('btn-claim').focus();
  const dismissedOnSwitch = api.requestClaim(); await tick();
  await api.switchProfile('mainnet');
  assert.equal((await dismissedOnSwitch).reason, 'cancelled');
  assert.equal(modalVisible(), false);
  assert.equal(sends, 0);
  console.log('PASS review: confirmation/art focus entry, Tab/Shift+Tab trap, Escape, click dismissal and focus restoration');
} finally {
  api.destroy(); win.close();
}

// Backoff tests use a fake clock: no network requests and no actual waiting.
const start = Date.UTC(2026, 10, 2, 12, 0, 0);
for (const status of [429, 503]) {
  for (const [header, seconds] of [
    ['60', 60], ['300', 300], ['301', 30], ['0', 30], ['-1', 30],
    [new Date(start + 90_000).toUTCString(), 90],
    [new Date(start + 300_000).toUTCString(), 300],
    [new Date(start + 301_000).toUTCString(), 30],
    [new Date(start - 1000).toUTCString(), 30],
    ['bad date', 30], ['Infinity', 30], ['', 30], [null, 30],
  ]) {
    let clock = start, calls = 0;
    const telemetry = createTelemetry({ now: () => clock, fetcher: async () => {
      calls++;
      return calls === 1 ? response(null, status, header === null ? {} : { 'Retry-After': header }) : response(measurement(1000));
    } });
    await assert.rejects(telemetry.read(), new RegExp(`HTTP ${status}`));
    clock = start + seconds * 1000 - 1;
    await assert.rejects(telemetry.read(), /Rate limited/);
    assert.equal(calls, 1, `${status}: ${header} blocks until ${seconds}s`);
    clock++;
    await telemetry.read();
    assert.equal(calls, 2, `${status}: ${header} resumes at ${seconds}s`);
  }
}
console.log('PASS review: Retry-After seconds/HTTP-date, 300s ceiling, and 30s fallback for invalid/past/over-ceiling waits');
