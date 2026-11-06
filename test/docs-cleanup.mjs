import assert from 'node:assert/strict';
import fs,{writeFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {assertWritable} from './docs-write-guard.mjs';

for(const [file,max]of [['README.md',6000],['docs/STATUS.md',4000]])assert.ok(fs.statSync(file).size<max,file+' exceeds short-doc budget');
for(const file of ['docs/SECURITY.md','docs/CHANGELOG.md','test/budgets.json'])assert.ok(fs.existsSync(file));
assert.equal(fs.existsSync('docs/audit'),false);assert.equal(fs.existsSync('docs/screenshots'),false);
const pin=fs.readFileSync('docs/deployments/core-sepolia-20261103.json');
assert.equal(createHash('sha256').update(pin).digest('hex'),'219ef9a6fe40d483b43a82ff5e445313af2a3b88f0b324622ab528769a97d095');
const code={code:'ERR_TEST_DOCS_WRITE'},target=new URL('../docs/.forbidden-test-output',import.meta.url);
assert.throws(()=>writeFileSync(target,'forbidden'),code);
assert.throws(()=>fs.appendFileSync(target,'forbidden'),code);
assert.throws(()=>fs.openSync(target,'w'),code);
assert.throws(()=>fs.mkdirSync(new URL('../docs/forbidden',import.meta.url)),code);
assert.throws(()=>fs.renameSync('artifacts/unused',target),code);
assert.throws(()=>fs.copyFileSync('README.md',target),code);
assert.throws(()=>fs.createWriteStream(target),code);
await assert.rejects(async()=>fs.promises.writeFile(target,'forbidden'),code);
await assert.rejects(async()=>fs.promises.open(target,'r+'),code);
assert.throws(()=>assertWritable(new URL('../',import.meta.url),{ancestors:true}),code);
fs.mkdirSync('artifacts',{recursive:true});
const link='artifacts/docs-guard-link';if(fs.existsSync(link))fs.unlinkSync(link);fs.symlinkSync('../docs',link,'dir');
try{assert.throws(()=>writeFileSync(link+'/forbidden','forbidden'),code);}finally{fs.unlinkSync(link);}
// Child propagation: even a test spawning another Node process cannot write docs.
const child=spawnSync(process.execPath,['--input-type=module','-e',`import fs from 'node:fs';fs.writeFileSync(new URL(${JSON.stringify(target.href)}),'forbidden');`],{encoding:'utf8'});
assert.notEqual(child.status,0);assert.match(child.stderr,/ERR_TEST_DOCS_WRITE/);
assert.equal(fs.existsSync(target),false);
const ci=fs.readFileSync('.github/workflows/ci.yml','utf8'),live=fs.readFileSync('.github/workflows/live.yml','utf8');
for(const text of [ci,live]){assert.match(text,/actions\/upload-artifact@v4/);assert.match(text,/path: artifacts\//);assert.match(text,/retention-days: 7/);}
for(const name of ['test','test:web','test:audit','test:browser','test:live','test:fork'])assert.match(JSON.parse(fs.readFileSync('package.json')).scripts[name],/^node test\/run-guarded.mjs /);
assert.ok(fs.readFileSync('playwright.config.mjs','utf8').includes("import './test/docs-write-guard.mjs'"));
console.log('PASS short current docs, immutable pin, consolidated budgets, sync/async/named/stream/open/rename/copy/symlink/child docs write denial and seven-day CI artifacts');
