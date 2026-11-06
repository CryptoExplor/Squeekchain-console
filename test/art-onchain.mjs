import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { parseSqueekMetadata } from '../sdk/metadata.js';
import { createImages } from '../web/images.js';
import { createDisplayCache } from '../sdk/display-cache.js';
import { createBrowseGrid } from '../web/browse-grid.js';
import { getProfile } from '../sdk/deployments.js';

// A real on-chain tokenURI: data:application/json;base64 of metadata whose image
// is a data:image/svg+xml;base64 DotGrid page. No API and no image HTTP at all.
const svg = 'data:image/svg+xml;base64,' + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1568" height="1568" viewBox="0 0 25088 25088" role="img" aria-label="Squeek #1"><title>Squeek #1</title><circle cx="40" cy="40" r="12"/></svg>').toString('base64');
const metadata = { name: 'Squeek #1', description: 'Squeek is a dot-grid character rendered fully onchain from an immutable art page.', image: svg, attributes: [{ trait_type: 'Level', value: 1 }] };
const tokenUri = 'data:application/json;base64,' + Buffer.from(JSON.stringify(metadata)).toString('base64');

const parsed = parseSqueekMetadata(tokenUri);
assert.equal(parsed.image, svg, 'tokenURI decodes to the on-chain SVG');
assert.equal(parsed.name, 'Squeek #1');

// The API is DOWN: no fetcher may be used. Art comes only from tokenURI.
const cache = createDisplayCache(null);
const images = createImages({ cache, fetcher: async () => { throw new Error('No API/HTTP allowed'); }, win: { URL: {} } });
const profile = getProfile();
const onchainArt = { tokenId: '1', level: 1, name: parsed.name, description: parsed.description, image: parsed.image, attributes: parsed.attributes };
const loaded = await images.load({ profile, token: { tokenId: '1', level: 1 }, api: null, fallback: async () => onchainArt, stage: 0 });
assert.equal(loaded.image, svg, 'tokenURI-only art is returned without the display API');
assert.equal(loaded.name, 'Squeek #1');

// The Browse grid must paint that art even while the index is still partial, and
// it must show a failure state instead of a dotted placeholder forever.
const dom = new JSDOM('<main><div id="cards"></div></main>', { url: 'https://console.test/#sepolia-core-20261103/explore' });
const { window: win } = dom, doc = win.document, root = doc.getElementById('cards');
let observed = 0;
win.IntersectionObserver = class { constructor(cb) { this.cb = cb; } observe(node) { observed += 1; this.cb([{ isIntersecting: true, target: node }]); } unobserve() {} disconnect() {} };
const net = { core: { blockHeight: '100' }, policy: { maximumLevel: 10, mergesOpen: true, levels: Array.from({ length: 10 }, (_, i) => ({ level: i + 1, basePower: String(1000 * (i + 1)) })) } };
const rows = [{ tokenId: '1', owner: `0x${'1'.repeat(40)}`, level: 1, nextMergeHeight: '0', deposited: false, basePower: '1000', hydratedAtBlock: '1' }];
const grid = createBrowseGrid({
  doc, win, root, context: () => ({ profile: profile.key, owner: rows[0].owner }),
  imagesEnabled: () => true, indexComplete: () => false,
  loadImage: token => images.load({ profile, token, api: null, fallback: async () => onchainArt }),
});
grid.render(rows, net);
const card = root.firstChild, frame = card.querySelector('.squeek-image');
const image = frame.querySelector('img');
assert.ok(image, 'a card asks for artwork even when the index is not complete');
await new Promise(resolve => setTimeout(resolve, 30));
assert.equal(image.getAttribute('src'), svg, 'the card renders tokenURI art');
assert.equal(frame.classList.contains('is-skeleton'), true, 'skeleton clears on the real <img> load event, not before');
image.onload?.();
assert.equal(frame.classList.contains('is-skeleton'), false);
// Partial index: the cross-wallet pair count stays hidden.
assert.equal(doc.querySelector('.pairs-chip').hidden, true, 'ready-pair count stays hidden while the index is incomplete');
grid.destroy();

// Failure is visible, not an endless placeholder.
const failing = createBrowseGrid({ doc, win, root: doc.getElementById('cards'), context: () => ({ profile: profile.key }), imagesEnabled: () => true, loadImage: async () => { throw new Error('tokenURI unavailable'); } });
failing.render(rows, net);
await new Promise(resolve => setTimeout(resolve, 20));
const failedCard = doc.getElementById('cards').firstChild;
assert.equal(failedCard.querySelector('.squeek-image').classList.contains('image-failed'), true, 'a failed artwork load shows a failure state');
assert.match(failedCard.querySelector('.squeek-image').getAttribute('aria-label'), /Image unavailable for Squeek #1/);
assert.ok(observed > 0);
failing.destroy(); images.destroy(); win.close();
console.log('PASS on-chain art: real token #1 tokenURI renders without the API, partial-index cards load art, and failures are visible');
