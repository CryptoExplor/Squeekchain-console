// Share card: pure data shaping and file naming. Drawing and recording are covered in the browser spec.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { EXPORT_W, EXPORT_H, VIDEO_BITRATE, cardData, shortAddress, fileName, pickVideoType, orbList, levelColor, applyShow, DEFAULT_SHOW, MAX_STATS, cardTurn, LOOP_SECONDS } from '../web/share-card.js';

assert.equal(EXPORT_W,1920);assert.equal(EXPORT_H,1080);assert.equal(VIDEO_BITRATE,16_000_000);

const owner = '0x5C5a38168517B610fe06b00c07a2D45BBB10c2e8';
const d = cardData({ owner, count: '10', power: '1,234', claimable: '9.00 SQK', levels: [2, 1, 1, null, 3, 0, 1], network: 'Sepolia', date: new Date(2026, 10, 8) });
assert.equal(d.address, '0x5C5a…c2e8');
assert.deepEqual(d.levels, [{ level: 1, count: 3 }, { level: 2, count: 1 }, { level: 3, count: 1 }]);
assert.equal(d.date, '2026-11-08');
assert.equal(d.powerLabel, 'Power');
assert.equal(fileName(d, 'png'), 'wheelhouse-0x5C5a-c2e8-2026-11-08.png');

assert.deepEqual(orbList(d.levels), [1, 1, 1, 2, 3]);
assert.equal(orbList([{ level: 1, count: 40 }]).length, 14);
assert.equal(levelColor(1), '#FCBE46'); assert.equal(levelColor(2), '#597AF7');
// Show options: hidden address, lifetime numbers, cap of MAX_STATS, unknown values skipped
{
  const base = cardData({ owner: '0x5C5a38168517B610fe06b00c07a2D45BBB10c2e8', count: '10', power: '10', powerLabel: 'Deposited', claimable: '0 SQK', claimed: '12.5 SQK', levels: [1, 2] });
  const def = applyShow(base);
  assert.deepEqual(def.stats.map(s => s[1]), ['Squeeks', 'Deposited', 'Claimable SQK']);
  const anon = applyShow(base, { ...DEFAULT_SHOW, address: false, claimable: false, claimed: true, compounded: true, levels: false });
  assert.equal(anon.address, null); assert.deepEqual(anon.levels, []); assert.deepEqual(anon.orbLevels, []);
  assert.deepEqual(anon.stats, [['10', 'Squeeks'], ['10', 'Deposited'], ['12.5', 'SQK claimed']]); // compounded unknown, skipped
  assert.equal(fileName(anon, 'png').startsWith('wheelhouse-holder-'), true);
  const all = applyShow({ ...base, compounded: '3 SQK' }, { claimed: true, compounded: true });
  assert.equal(all.stats.length, MAX_STATS);
}
// Two sides: front numbers vs back SQK numbers, and the card turns over within one loop
{
  const two = applyShow(cardData({ count: '3', power: '3', claimable: '1 SQK', claimed: '2 SQK' }), { claimed: true });
  assert.deepEqual(two.front.map(s => s[1]), ['Squeeks', 'Power']); assert.deepEqual(two.back.map(s => s[1]), ['Claimable SQK', 'SQK claimed']);
  assert.ok(Math.cos(cardTurn(1)) > 0.5 && Math.cos(cardTurn(5)) < -0.5 && Math.cos(cardTurn(1 + LOOP_SECONDS)) > 0.5);
}
// Unknown stays unknown: never invent a zero.
const empty = cardData({ owner: 'nope', count: '', power: null, claimable: 'Not available' });
assert.equal(empty.address, ''); assert.equal(empty.count, '—'); assert.equal(empty.power, '—'); assert.equal(empty.claimable, '—');
assert.deepEqual(empty.levels, []);
assert.equal(shortAddress('0x123'), '');

// MP4 first (X accepts it), WebM only as fallback, null when nothing records.
assert.equal(pickVideoType(t => t.startsWith('video/mp4')).ext, 'mp4');
assert.equal(pickVideoType(t => t === 'video/webm').ext, 'webm');
assert.equal(pickVideoType(() => false), null);

// Read-only: the card module never touches wallets, signing or transactions.
const src = fs.readFileSync(new URL('../web/share-card.js', import.meta.url), 'utf8');
for (const word of ['sendTransaction', 'eth_sendTransaction', 'signMessage', 'request(', 'writeContract']) assert.ok(!src.includes(word), `share-card.js must not use ${word}`);
const styleSrc = fs.readFileSync(new URL('../web/share-styles.js', import.meta.url), 'utf8');
for (const word of ['sendTransaction', 'eth_sendTransaction', 'signMessage', 'request(', 'writeContract']) assert.ok(!styleSrc.includes(word), `share-styles.js must not use ${word}`);
const { STYLES, styleSeconds } = await import('../web/share-card.js');
assert.deepEqual(STYLES.map(s => s[0]), ['flip', 'night', 'classic']); assert.equal(styleSeconds('flip'), LOOP_SECONDS); assert.equal(styleSeconds('classic'), 5);
const buildSrc = fs.readFileSync(new URL('../build.mjs', import.meta.url), 'utf8'); assert.equal((buildSrc.match(/share-styles\.js/g) || []).length, 2, 'build must ship share-styles.js');
console.log('share-card: ok');

// Cancellation before capture and constructor failures must not leak tracks.
const { recordCanvas } = await import('../web/share-card.js');
const previousRecorder = globalThis.MediaRecorder;
const previousCancel = globalThis.cancelAnimationFrame;
let stopped = 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.MediaRecorder = class {
  static isTypeSupported() { return true; }
  constructor() { throw new Error('Encoder unavailable'); }
};
try {
  const canvas = { captureStream: () => ({ getTracks: () => [{ stop: () => stopped++ }] }) };
  await assert.rejects(recordCanvas(canvas, () => {}), /Encoder unavailable/);
  assert.equal(stopped, 1);
  const controller = new AbortController(); controller.abort();
  await assert.rejects(recordCanvas(canvas, () => {}, { signal: controller.signal }), /cancelled/);
  assert.equal(stopped, 1);
  await assert.rejects(recordCanvas(canvas, () => {}, { seconds: 0 }), /Invalid recording/);
} finally {
  globalThis.MediaRecorder = previousRecorder;
  globalThis.cancelAnimationFrame = previousCancel;
}
console.log('share-card recording lifecycle: ok');

const stylesMod = await import('../web/share-styles.js');
for (const fn of ['drawNight', 'drawClassic', 'drawClassicMoving']) assert.equal(typeof stylesMod[fn], 'function', fn);
const heroSrc = fs.readFileSync(new URL('../web/hero3d-src.js', import.meta.url), 'utf8');
assert.match(heroSrc, /export function nightStage\(/); assert.match(heroSrc, /export function cardStage\(/);
assert.deepEqual(orbList([{level:1,count:Infinity},{level:-1,count:3},{level:2,count:999}], Infinity), Array(14).fill(2));
assert.deepEqual(orbList([{level:1,count:2}], -1), []);
assert.equal(levelColor(NaN), levelColor(1));

// Recorder settlement: error, draw failure, abort, success and stale callbacks all release the stream once.
{
 const saved = {recorder:globalThis.MediaRecorder,raf:globalThis.requestAnimationFrame,cancel:globalThis.cancelAnimationFrame};
 let current, scheduled, stops=0;
 globalThis.requestAnimationFrame=fn=>{scheduled=fn;return 1;};
 globalThis.cancelAnimationFrame=()=>{};
 globalThis.MediaRecorder=class {
  static isTypeSupported(){return true;}
  state='inactive';
  constructor(_stream,options){current=this;assert.equal(options.videoBitsPerSecond,16_000_000);assert.equal(options.mimeType,'video/mp4;codecs=avc1.420028');}
  start(){this.state='recording';}
  stop(){this.state='inactive';queueMicrotask(()=>{this.ondataavailable?.({data:new Blob(['video'])});this.onstop?.();});}
 };
 const canvas={captureStream:()=>({getTracks:()=>[{stop:()=>{stops++;}}]})};
 try{
  const error=recordCanvas(canvas,()=>{});current.onerror({error:new Error('encoder error')});
  await assert.rejects(error,/encoder error/);assert.equal(stops,1);
  let frames=0;const drawError=recordCanvas(canvas,()=>{if(frames++)throw new Error('draw error');});
  scheduled(performance.now()+16);await assert.rejects(drawError,/draw error/);assert.equal(stops,2);
  const controller=new AbortController(), cancel=recordCanvas(canvas,()=>{},{signal:controller.signal});
  controller.abort();await assert.rejects(cancel,/cancelled/);assert.equal(stops,3);
  const ok=await recordCanvas(canvas,()=>{},{seconds:0.005});
  assert.ok(ok.blob.size>0);assert.equal(stops,4);
 }finally{globalThis.MediaRecorder=saved.recorder;globalThis.requestAnimationFrame=saved.raf;globalThis.cancelAnimationFrame=saved.cancel;}
}
console.log('share-card recorder settlement: ok');
