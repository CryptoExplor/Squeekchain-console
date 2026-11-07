// Share card: pure data shaping and file naming. Drawing and recording are covered in the browser spec.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { cardData, shortAddress, fileName, pickVideoType } from '../web/share-card.js';

const owner = '0x5C5a38168517B610fe06b00c07a2D45BBB10c2e8';
const d = cardData({ owner, count: '10', power: '1,234', claimable: '9.00 SQK', levels: [2, 1, 1, null, 3, 0, 1], network: 'Sepolia', date: new Date('2026-11-08T00:00:00Z') });
assert.equal(d.address, '0x5C5a…c2e8');
assert.deepEqual(d.levels, [{ level: 1, count: 3 }, { level: 2, count: 1 }, { level: 3, count: 1 }]);
assert.equal(d.date, '2026-11-08');
assert.equal(d.powerLabel, 'Power');
assert.equal(fileName(d, 'png'), 'wheelhouse-0x5C5a-c2e8-2026-11-08.png');

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
console.log('share-card: ok');
