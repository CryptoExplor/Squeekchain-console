import assert from 'node:assert/strict';
import fs from 'node:fs';
import { JSDOM } from 'jsdom';
import { Panel, Stat, Table, TokenCard, ConfirmDialog, Toast, UNKNOWN, valueText, formatNumber, formatAmount, formatSqk, formatPower } from '../web/components.js';
import { mount } from '../web/app.js';

const html = fs.readFileSync(new URL('../web/index.html', import.meta.url), 'utf8');
const dom = new JSDOM(html, { url: 'https://console.test/' });
const { window: win } = dom, doc = win.document, $ = id => doc.getElementById(id);
try {
  const referral = doc.querySelector('#info-about a');
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
  assert.equal(formatAmount({ profileBalanceReader: async () => ({"sepolia":{"wallet":"0","staked":"0","nftPower":"0"},"sepolia":{"wallet":"0","staked":"0","nftPower":"0"}}),}), UNKNOWN); assert.equal(formatAmount({ profileBalanceReader: async () => ({"sepolia":{"wallet":"0","staked":"0","nftPower":"0"},"sepolia":{"wallet":"0","staked":"0","nftPower":"0"}}), sqk: '0' }), '0 SQK');

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
  assert.equal(toast.getAttribute('role'), 'alert'); assert.equal(toast.querySelector('img'), null);assert.equal(toast.querySelector('.toast-message').textContent,'<img>literal error');assert.ok(toast.querySelector('[aria-label="Dismiss notification"]'));

  const dialog = ConfirmDialog({ doc, win, elements: Object.fromEntries(Object.entries({ root: 'modal', title: 'modal-title', body: 'modal-body', input: 'modal-input', cancel: 'btn-modal-cancel', confirm: 'btn-modal-confirm' }).map(([key, id]) => [key, $(id)])) });
  let confirmed = false;
  const result = dialog.confirm({ title: 'Merge', body: 'Permanent burn', requireText: 'BURN-42' }).then(value => { confirmed = value; });
  $('modal-input').value = 'BURN-41'; $('modal-input').dispatchEvent(new win.Event('input'));
  $('btn-modal-confirm').onclick(); await Promise.resolve(); assert.equal(confirmed, false);
  assert.equal($('btn-modal-confirm').disabled, true);
  $('modal-input').value = 'BURN-42'; $('modal-input').dispatchEvent(new win.Event('input'));
  $('btn-modal-confirm').click(); await result; assert.equal(confirmed, true);
  // Phase 6: the burn warning renders directly above the typed BURN-<id> input; the typed guard is unchanged.
  const warned = ConfirmDialog({ doc, win, elements: Object.fromEntries(Object.entries({ root: 'modal', title: 'modal-title', body: 'modal-body', input: 'modal-input', warning: 'modal-warning', cancel: 'btn-modal-cancel', confirm: 'btn-modal-confirm' }).map(([key, id]) => [key, $(id)])) });
  let warnedResult = null;
  const warnedPromise = warned.confirm({ title: 'Merge', body: 'Keep #41', warning: '#42 is BURNED permanently. Type BURN-42 below.', requireText: 'BURN-42' }).then(value => { warnedResult = value; });
  assert.equal($('modal-warning').textContent, '#42 is BURNED permanently. Type BURN-42 below.'); assert.equal($('modal-warning').classList.contains('hidden'), false);
  assert.equal($('modal-warning').nextElementSibling.getAttribute('for'), 'modal-input'); assert.equal($('modal-warning').nextElementSibling.nextElementSibling, $('modal-input'));
  $('modal-input').value = 'BURN-41'; $('modal-input').dispatchEvent(new win.Event('input')); assert.equal($('btn-modal-confirm').disabled, true);
  $('btn-modal-cancel').onclick(); await warnedPromise; assert.equal(warnedResult, false);
  const plain = warned.confirm({ title: 'Claim', body: 'No burn' }); assert.equal($('modal-warning').classList.contains('hidden'), true); $('btn-modal-cancel').onclick(); await plain;
  // Phase 6: one SQK format (2 decimals, separators, exact zero as "0 SQK") and whole-number power.
  for (const [value, text] of [['0', '0 SQK'], ['0.0', '0 SQK'], [{ sqk: '563.9836' }, '563.98 SQK'], ['1234567.5', '1,234,567.50 SQK'], ['0.001', '< 0.01 SQK'], [null, UNKNOWN], ['nope', UNKNOWN]]) assert.equal(formatSqk(value), text);
  for (const [value, text] of [['2200', '2,200'], ['2000000000000000000000', '2,000'], [null, UNKNOWN]]) assert.equal(formatPower(value), text);

  const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
  let net = { core: {}, mining: {}, nft: {}, checkpoint: {} };
  let wallet = { owner, totals: { count: null }, squeeks: [{ tokenId: '41', level: null }] }, failed = false;
  const adapter = { networkStatus: async () => net, verify: async () => ({ ok: true, trusted: true }), walletStatus: async () => { if (failed) throw new Error('RPC offline'); return wallet; } };
  win.ethereum = { request: async ({ method }) => method === 'eth_chainId' ? '0xaa36a7' : [owner], on() {} };
  win.localStorage.setItem('squeekchain:profile','sepolia');
  const app = mount({ profileBalanceReader: async () => ({"sepolia":{"wallet":"0","staked":"0","nftPower":"0"},"sepolia":{"wallet":"0","staked":"0","nftPower":"0"}}), doc, win, adapterFactory: () => adapter, fetcher: async () => { throw new Error('No external requests'); } });
  try {
    await app.refresh(); await app.connect();
    for (const id of ['net-round', 'net-blocks', 'net-lag', 'net-issued', 'net-squeeks', 'net-paused', 'holder-count', 'holder-power', 'holder-share', 'holder-claimable']) assert.equal($(id).textContent, UNKNOWN, id);
    assert.equal($('btn-checkpoint').disabled, true); assert.equal($('btn-claim').disabled, true);
    assert.equal($('verified-chip').textContent, 'Verified');
    assert.match(doc.querySelector('footer').textContent, /Independent.*not affiliated with Squeekchain/i);
    net = { core: { settledThroughRound: '0', blockHeight: '0', paused: false }, mining: { lagRounds: '0', minted: { sqk: '0' } }, nft: { totalSupply: '0' }, checkpoint: {} };
    wallet = { owner, totals: { count: 0, power: 0, deposited: 0, sharePercent: 0, claimable: { sqk: '0' } }, squeeks: [] };
    await app.refresh();
    for (const id of ['net-round', 'net-blocks', 'net-squeeks', 'holder-count', 'holder-power']) assert.equal($(id).textContent, '0', `known zero ${id}`);
    assert.equal($('holder-claimable').textContent, '0 SQK'); assert.equal($('net-paused').textContent, 'No');
    failed = true; await app.refresh();
    // A failed refresh keeps the last view on screen (never blank the UI on a slow/failed read).
    assert.equal($('holder-count').textContent, '0', 'last holder view kept after a failed refresh'); assert.notEqual(app.state.status, null);
    assert.equal($('btn-custom-merge').disabled, true);
    await app.switchProfile('sepolia'); assert.equal($('verified-chip').textContent, 'Unavailable','connected wallet failure remains unavailable across profile switch');
    failed=false;wallet={owner,totals:{count:null},squeeks:[]};await app.connect();
    assert.equal($('btn-checkpoint').disabled,true);assert.equal($('btn-claim').disabled,true,'v9 Unknown is not the SQK-only known-zero exception');
    wallet={owner,totals:{count:0},squeeks:[]};await app.refresh();assert.equal($('btn-claim').disabled,false,'v9 known zero still allows SQK-only claims');
    await app.switchProfile('mainnet'); assert.equal($('profile-status').textContent, 'Not deployed');
    assert.equal($('deployment-content').classList.contains('hidden'), true);
  } finally { app.destroy(); }
  console.log('PASS components: Panel/Stat/Table/TokenCard/ConfirmDialog/Toast/Skeleton, Unknown vs genuine zero, typed BURN guard, failed-wallet clearing, profile badges and independent footer');
} finally { win.close(); }

// Raw SDK account power is explicitly fixed-point even below one power unit.
{
 const {formatStakingPower}=await import('../web/components.js');
 assert.equal(formatStakingPower('0'),'0');
 assert.equal(formatStakingPower('500000000000000000'),'0.5');
 assert.equal(formatStakingPower('1000000000000000000'),'1');
 assert.equal(formatStakingPower('2000000000000000000000'),'2,000');
 assert.equal(formatStakingPower('1'),'< 0.01');
 assert.equal(formatStakingPower(null),'—');
}
