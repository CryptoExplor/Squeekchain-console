import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { PROFILES, getProfile } from '../sdk/deployments.js';
import { profileInput } from '../sdk/profile-input.js';
import { profileFromHash, chooseProfile } from '../sdk/profile-selection.js';
import { toolProfile } from '../sdk/tool-runtime.js';
import { TOOL_SPECS, buildManifest } from '../sdk/tools.js';
import { mount } from '../web/app.js';
assert.equal(profileInput('sepolia'),'sepolia-v9');
assert.equal(profileFromHash('#sepolia/info/trust'),'sepolia-v9');
assert.equal(toolProfile('sepolia').key,'sepolia-v9');
assert.throws(()=>getProfile('sepolia'),/canonical/);
assert.equal(PROFILES.sepolia,undefined);
for(const file of ['sdk/deployments.js','sdk/v9.js','sdk/deposits.js','web/app.js','web/activity.js','mcp/server.js','sdk/tool-runtime.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/['"]sepolia['"]|PROFILES\.sepolia\b/,file+' must not read the legacy key');
const counts=(a,b)=>({'sepolia-v6':a,'sepolia-v9':b});
assert.equal(chooseProfile('sepolia-v9',counts('1','0')),'sepolia-v6');
assert.equal(chooseProfile('sepolia-v6',counts('0','2')),'sepolia-v9');
for(const pair of [counts('2','3'),counts('0','0'),counts(null,'3'),counts('2',null)])assert.equal(chooseProfile('sepolia-v6',pair),'sepolia-v6');
const html=fs.readFileSync('web/index.html','utf8');
for(const legacySource of ['storage','hash']) {
 const dom=new JSDOM(html,{url:`https://console.test/${legacySource==='hash'?'#sepolia/network':''}`}),win=dom.window;
 win.localStorage.setItem('squeekchain:profile',legacySource==='storage'?'sepolia':'sepolia-v6');
 const keys=[];
 const app=mount({win,doc:win.document,adapterFactory:key=>{keys.push(key);return {networkStatus:async()=>({core:{},mining:{},nft:{},checkpoint:{}}),verify:async()=>({ok:true,trusted:true})};},fetcher:async()=>{throw new Error('Offline');}});
 try { await app.refresh();assert.equal(app.state.profileKey,'sepolia-v9');assert.equal(win.localStorage.getItem('squeekchain:profile'),'sepolia-v9');assert.match(win.location.hash,/^#sepolia-v9\//);assert.ok(keys.every(key=>key==='sepolia-v9'));
 const canonical=specs=>specs.map(({name,description,inputSchema,sideEffects})=>({name,description,inputSchema,sideEffects}));
 assert.deepEqual(canonical(app.manifest().tools),canonical(TOOL_SPECS));
 assert.deepEqual(Object.keys(app.tools()),TOOL_SPECS.map(t=>t.name));
 assert.deepEqual(JSON.parse(fs.readFileSync('web/tools.json')).tools,buildManifest().tools);
 for(const profile of ['sepolia-v6','sepolia-v9','sepolia']) {
 const input=[{jsonrpc:'2.0',id:1,method:'tools/list'},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'squeek_request_checkpoint',arguments:{}}}].map(JSON.stringify).join('\n')+'\n';
 const child=spawnSync(process.execPath,['mcp/server.js'],{input,encoding:'utf8',env:{PATH:process.env.PATH,SQUEEK_PROFILE:profile},timeout:10000});
 assert.equal(child.status,0,child.stderr);const replies=child.stdout.trim().split('\n').map(JSON.parse);const tools=replies.find(reply=>reply.id===1).result.tools;assert.equal(replies.find(reply=>reply.id===2).error.code,-32602);
 assert.deepEqual(tools,canonical(TOOL_SPECS.filter(spec=>spec.surfaces.includes('mcp'))));
 assert.ok(tools.every(tool=>!tool.name.startsWith('squeek_request_')));
 }
 } finally {app.destroy();win.close();}
}
console.log('PASS canonical profile input migration, no legacy runtime lookups, Unknown-safe autopick, and exact SDK/JSON/window/MCP registry parity');
