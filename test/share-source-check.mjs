// Focused lint gate for the V2 island; legacy JS is syntax-checked, not migrated.
import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
for(const file of ['web/app.js','web/components.js','tailwind.config.js','build.mjs']){
 const result=spawnSync(process.execPath,['--check',file],{stdio:'inherit'});assert.equal(result.status,0,`${file}: syntax`);
}
for(const file of fs.readdirSync('src/components/share').filter(f=>/\.tsx?$/.test(f))){
 const source=fs.readFileSync(`src/components/share/${file}`,'utf8');
 assert.ok(!/^(?:<{7}|={7}|>{7})/m.test(source),`${file}: conflict marker`);
 assert.ok(!/console\.log\(/.test(source),`${file}: debug logging`);
 assert.ok(!/eth_sendTransaction|signMessage|writeContract/.test(source),`${file}: sharing must be read-only`);
}
const result=spawnSync('npx',['tsc','--noEmit','--noUnusedLocals','--noUnusedParameters'],{stdio:'inherit'});assert.equal(result.status,0,'strict V2 source checks');
console.log('PASS V2 read-only source, conflict/debug and strict TypeScript checks');
