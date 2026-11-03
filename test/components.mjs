import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { Panel, Stat, Table, TokenCard, ConfirmDialog, Toast, UNKNOWN, valueText, formatNumber, formatAmount } from '../web/components.js';
import { mount } from '../web/app.js';

const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://console.test/' });
const { window: win } = dom, doc = win.document, $ = id => doc.getElementById(id);
try {
  const referral = doc.querySelector('.hero-actions a');
  assert.equal(referral.href, 'https://squeekchain.com/genesis/i/kbxh52st');
  assert.equal(referral.textContent, 'Discover Genesis ↗');
  assert.equal(referral.target, '_blank');
  assert.ok(referral.relList.contains('noopener'));
  assert.ok(referral.relList.contains('noreferrer'));
  for (const value of [null, undefined, '', ' ', NaN, Infinity, 'unavailable', '—']) {
    assert.equal(valueText(value), UNKNOWN); assert.equal(formatNumber(value), UNKNOWN);
  }
  for (const value of [0, '0', 0n]) assert.equal(formatNumber(value), '0');
  assert.equal(formatNumber(false), UNKNOWN);
  assert.equal(formatNumber('9007199254740993'), '9,007,199,254,740,993');
  assert.equal(formatAmount({}), UNKNOWN); assert.equal(formatAmount({ sqk: '0' }), '0 SQK');

  const panel = Panel($('profile-panel')), stat = Stat($('net-round').parentElement);
  stat.set(null); panel.setBusy(true);
  assert.equal($('net-round').textContent, UNKNOWN);
  assert.equal($('net-round').classList.contains('is-skeleton'), true);
  stat.set(0); assert.equal($('net-round').textContent, '0');
  assert.equal($('net-round').classList.contains('is-skeleton'), false, 'known values are not hidden by skeletons');
  panel.setBusy(false);
  assert.equal($('profile-panel').getAttribute('role'), 'region');
  Table({ head: $('squeeks-head'), body: $('squeeks-tbody'), columns: [{ key: 'power', label: 'Power' }], rows: [{}, { power: 0 }], cell: row => row.power });
  assert.deepEqual([...$('squeeks-tbody').querySelectorAll('td')].map(node => node.textContent), [UNKNOWN, '0']);
  assert.equal($('squeeks-head').querySelector('th').scope, 'col');
  assert.ok($('squeeks-head').closest('table').caption);

  let opened = 0;
  const card = TokenCard({ doc, item: { tokenId: '41', name: '<script>not markup</script>', image: 'data:image/svg+xml;base64,PHN2Zy8+' }, onOpen: () => opened++ });
  assert.equal(card.tagName, 'BUTTON'); assert.equal(card.querySelector('script, svg'), null);
  assert.equal(card.querySelector('img').getAttribute('src'), 'data:image/svg+xml;base64,PHN2Zy8+');
  card.click(); assert.equal(opened, 1);
  const toast = Toast({ doc, host: $('toasts'), message: '<img>literal error', kind: 'err', timeout: 1 });
  assert.equal(toast.getAttribute('role'), 'alert'); assert.equal(toast.children.length, 0);

  const dialog = ConfirmDialog({ doc, win, elements: Object.fromEntries(Object.entries({ root: 'modal', title: 'modal-title', body: 'modal-body', input: 'modal-input', cancel: 'btn-modal-cancel', confirm: 'btn-modal-confirm' }).map(([key, id]) => [key, $(id)])) });
  let confirmed = false;
  const result = dialog.confirm({ title: 'Merge', body: 'Permanent burn', requireText: 'BURN-42' }).then(value => { confirmed = value; });
  $('modal-input').value = 'BURN-41'; $('modal-input').dispatchEvent(new win.Event('input'));
  $('btn-modal-confirm').onclick(); await Promise.resolve(); assert.equal(confirmed, false);
  assert.equal($('btn-modal-confirm').disabled, true);
  $('modal-input').value = 'BURN-42'; $('modal-input').dispatchEvent(new win.Event('input'));
  $('btn-modal-confirm').click(); await result; assert.equal(confirmed, true);

  const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
  let net = { core: {}, mining: {}, nft: {}, checkpoint: {} };
  let wallet = { owner, totals: { count: null }, squeeks: [{ tokenId: '41', level: null }] }, failed = false;
  const adapter = { networkStatus: async () => net, verify: async () => ({ ok: true, trusted: true }), walletStatus: async () => { if (failed) throw new Error('RPC offline'); return wallet; } };
  win.ethereum = { request: async ({ method }) => method === 'eth_chainId' ? '0xaa36a7' : [owner], on() {} };
  const app = mount({ doc, win, adapterFactory: () => adapter, fetcher: async () => { throw new Error('No external requests'); } });
  try {
    await app.refresh(); await app.connect();
    for (const id of ['net-round', 'net-blocks', 'net-lag', 'net-issued', 'net-squeeks', 'net-paused', 'holder-count', 'holder-power', 'holder-share', 'holder-claimable']) assert.equal($(id).textContent, UNKNOWN, id);
    assert.equal($('btn-checkpoint').disabled, true); assert.equal($('btn-claim').disabled, true);
    assert.equal($('profile-status').textContent, 'Supported');
    assert.match(doc.querySelector('footer').textContent, /independent community console.*not affiliated with Squeekchain/i);
    net = { core: { settledThroughRound: '0', blockHeight: '0', paused: false }, mining: { lagRounds: '0', minted: { sqk: '0' } }, nft: { totalSupply: '0' }, checkpoint: {} };
    wallet = { owner, totals: { count: 0, power: 0, sharePercent: 0, claimable: { sqk: '0' } }, squeeks: [] };
    await app.refresh();
    for (const id of ['net-round', 'net-blocks', 'net-squeeks', 'holder-count', 'holder-power']) assert.equal($(id).textContent, '0', `known zero ${id}`);
    assert.equal($('holder-claimable').textContent, '0 SQK'); assert.equal($('net-paused').textContent, 'no');
    failed = true; await app.refresh();
    assert.equal($('holder-count').textContent, UNKNOWN); assert.equal(app.state.status, null);
    assert.equal($('btn-custom-merge').disabled, true);
    await app.switchProfile('sepolia'); assert.equal($('profile-status').textContent, 'Read-only');
    await app.switchProfile('mainnet'); assert.equal($('profile-status').textContent, 'Not deployed');
    assert.equal($('deployment-content').classList.contains('hidden'), true);
  } finally { app.destroy(); }
  console.log('PASS components: Panel/Stat/Table/TokenCard/ConfirmDialog/Toast/Skeleton, Unknown vs genuine zero, typed BURN guard, failed-wallet clearing, profile badges and independent footer');
} finally { win.close(); }
