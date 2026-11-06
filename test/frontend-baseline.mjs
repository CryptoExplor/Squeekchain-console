import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import {parse,walk,generate} from 'css-tree';
const evidence=JSON.parse(fs.readFileSync('test/fixtures/frontend-b705683.json'));
const sha=value=>createHash('sha256').update(value).digest('hex');
const html=fs.readFileSync('web/index.html','utf8'),doc=new JSDOM(html).window.document;
// The only baseline DOM normalization: seven audited style attributes moved
// verbatim to external classes for style-src 'self'. All other DOM/copy is exact.
const cspClasses={'margin: 12px 0':'my-12','margin-top: 12px':'mt-12','margin-top: 16px':'mt-16','margin-top: 20px':'mt-20','max-width: 140px':'max-w-140'};
function normalize(node) {
  node=node.cloneNode(true);
  for(const el of [node,...node.querySelectorAll('*')]) {
    const style=el.getAttribute('style');
    if(style&&cspClasses[style]){el.removeAttribute('style');el.className=cspClasses[style]+(el.className?' '+el.className:'');}
    // Attribute order is not rendered layout; keep the comparison deterministic.
    const attrs=[...el.attributes].map(a=>[a.name,a.value]).sort(([a],[b])=>a.localeCompare(b));
    for(const {name} of [...el.attributes])el.removeAttribute(name);
    for(const [name,value] of attrs)el.setAttribute(name,value);
  }
  return node.outerHTML;
}
// DATA DIET explicitly replaces the old fixed-loop label; all other baseline DOM remains exact.
for(const [selector,expected] of Object.entries(evidence.nodes).filter(([selector])=>!['#holder-empty','#btn-plan','#panel-network .section-heading','#activity-panel > p'].includes(selector)))assert.equal(normalize(doc.querySelector(selector)),normalize(new JSDOM(expected.replace('ONCHAIN READS · AUTO-REFRESH 45s','DISPLAY READS · FOLLOWS THE WHEEL').replace('rendered by the DotGrid renderer · shown as an isolated image','Your Squeek collection').replace('Clear IndexedDB log cache','Clear saved data')).window.document.body.firstElementChild),`${selector}: preserve deployed b705683 layout/copy`);
assert.equal(doc.querySelector('#activity-panel > p'),null,'approved removal of drawer-wide help');
assert.ok(doc.querySelector('#panel-network #profile-panel')&&doc.querySelector('#panel-network #checkpoint-panel'),'Network tab holds chain pulse and checkpoint');assert.equal(doc.querySelector('#info-developers #checkpoint-panel'),null,'checkpoint is not buried in Developers');assert.ok(doc.querySelector('#panel-explore'));assert.ok(doc.querySelector('.network-strip'));assert.ok(doc.querySelector('#info-about').textContent.includes('Also see'));
assert.equal(doc.querySelector('#btn-plan'),null,'text plan refresh removed');assert.equal(doc.querySelector('#btn-holder-refresh').getAttribute('aria-label'),'Refresh Squeeks');
assert.match(doc.querySelector('#holder-empty').textContent,/Connect your wallet/);assert.ok(doc.querySelector('#holder-connect'));
const styles=fs.readFileSync('web/styles.css','utf8');
// The approved strip cleanup may remove its old base/mobile rules, not rewrite other baseline styles.
const end=evidence.stylesPrefixEndAnchor,index=styles.indexOf(end);assert.ok(index>=0,'preserve original prefix boundary');assert.equal(styles.indexOf(end,index+1),-1);
const withoutStrip=css=>{const ast=parse(css);walk(ast,{visit:'Rule',enter(node,item,list){if(/^\.network-strip(?:$|[ .>:#\[])/.test(generate(node.prelude)))list.remove(item);}});return generate(ast);};
assert.equal(sha(withoutStrip(styles.slice(0,index+end.length))),evidence.stylesExceptNetworkStripSha256,'all baseline styles except the explicitly replaced network strip remain unchanged');
// Only the explicitly approved missing-value presentation and loading label are normalized.
const components=fs.readFileSync('web/components.js','utf8').replace('formatNumber(amount?.sqk, 2)','formatNumber(amount?.sqk, 4)') /* 2026-11-06: SQK shown to 2 decimals (Ravi) */.replace("UNKNOWN = '—'","UNKNOWN = 'Unknown'").replace("node.setAttribute('aria-label', 'Loading')","node.setAttribute('aria-label', 'Loading; value Unknown')").replace(/export function Toast[\s\S]*?(?=export function ConfirmDialog)/,fs.readFileSync('test/fixtures/frontend-toast-b705683.txt','utf8')).replace(', details = []','').replace(/\n      if\(details.length\) \{.*?\n      \}/s,'');
assert.equal(sha(components),evidence.componentsSha256,'original components plus structured unstake details only');
const app=fs.readFileSync('web/app.js','utf8');
const columns=app.slice(app.indexOf('  function columnsForProfile() {'),app.indexOf('\n  function renderWatchMode()',app.indexOf('  function columnsForProfile() {')));
// Approved change (one graph now): the v9 column set is chosen by 'deployed', not by abiSet.
assert.equal(sha(columns.replace('const isV9 = Boolean(getProfile(state.profileKey).addresses);','const isV9 = getProfile(state.profileKey).abiSet === "v9";')),evidence.columnsSha256,'restore baseline table labels/columns without changing SDK custody data');
assert.equal(doc.querySelector('#watch-input').getAttribute('placeholder'),'0x… (view only)');
assert.equal((html.match(/not affiliated with Squeekchain/g)??[]).length,1,'one non-affiliation line');
assert.ok(doc.querySelector('#v9-actions'));assert.equal(doc.querySelectorAll('[data-trust-check]').length,7);
assert.equal(doc.querySelector('[data-testid="developer-surfaces"] tbody tr:nth-child(2) td:last-child').textContent,'Your wallet popup');
assert.match(app,/import\('\.\/developers\.js'\)/);assert.match(app,/import\('\.\/settings\.js'\)/);
const forbidden='Read-only.*unverified|all transactions disabled|read-only here|checkpoint is read-only|claims are read-only|read-only for owner actions|v9.*read-only|read-only.*v9|undocumented|no v9 transactions|Merges are not supported on this profile';
const grep=spawnSync('git',['grep','-nEi',forbidden,'--','web/app.js','web/index.html'],{encoding:'utf8'});
assert.equal(grep.status,1,`obsolete v9 restriction copy must not return:\n${grep.stdout}\n${grep.stderr}`);
console.log(`PASS frontend restoration from ${evidence.sourceCommit}: baseline CSS except approved strip cleanup, components/layout/copy plus functional surfaces; lazy modules; git grep confirms no obsolete v9 restriction strings`);
