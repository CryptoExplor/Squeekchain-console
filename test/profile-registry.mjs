import assert from 'node:assert/strict';
import fs from 'node:fs';
import { spawnSync } from 'node:child_process';
import { JSDOM } from 'jsdom';
import { PROFILES, DEFAULT_PROFILE, getProfile } from '../sdk/deployments.js';
import { profileInput } from '../sdk/profile-input.js';
import { profileFromHash, chooseProfile } from '../sdk/profile-selection.js';
import { toolProfile } from '../sdk/tool-runtime.js';
import { TOOL_SPECS, buildManifest } from '../sdk/tools.js';
import { mount } from '../web/app.js';
assert.equal(profileInput('sepolia'),DEFAULT_PROFILE);
assert.equal(profileFromHash('#sepolia/info/trust'),DEFAULT_PROFILE);
assert.equal(toolProfile('sepolia').key,DEFAULT_PROFILE);
assert.throws(()=>getProfile('sepolia'),/canonical/);
assert.equal(PROFILES.sepolia,undefined);
for(const file of ['sdk/deployments.js','sdk/v9.js','sdk/deposits.js','web/app.js','web/activity.js','mcp/server.js','sdk/tool-runtime.js'])assert.doesNotMatch(fs.readFileSync(file,'utf8'),/['"]sepolia['"]|PROFILES\.sepolia\b/,file+' must not read the legacy key');
const counts=(a,b)=>({'sepolia':{wallet:a,staked:'0',nftPower:'0'},'sepolia':{wallet:b,staked:'0',nftPower:'0'}});
assert.equal(chooseProfile('sepolia',counts('1','0')),'sepolia');
assert.equal(chooseProfile('sepolia',counts('0','2')),'sepolia');
for(const pair of [counts('2','3'),counts('0','0'),counts(null,'3'),counts('2',null)])assert.equal(chooseProfile('sepolia',pair),'sepolia');
const html=fs.readFileSync('web/index.html','utf8');
for(const legacySource of ['storage','hash']) {
 const dom=new JSDOM(html,{url:`https://console.test/${legacySource==='hash'?'#sepolia/network':''}`}),win=dom.window;
 win.localStorage.setItem('squeekchain:profile',legacySource==='storage'?'sepolia':'sepolia');
 const keys=[];
 const app=mount({win,doc:win.document,adapterFactory:key=>{keys.push(key);return {networkStatus:async()=>({core:{},mining:{},nft:{},checkpoint:{}}),verify:async()=>({ok:true,trusted:true})};},fetcher:async()=>{throw new Error('Offline');}});
 try { await app.refresh();assert.equal(app.state.profileKey,DEFAULT_PROFILE);assert.equal(win.localStorage.getItem('squeekchain:profile'),DEFAULT_PROFILE);assert.match(win.location.hash,new RegExp('^#'+DEFAULT_PROFILE+'\\/'));assert.ok(keys.every(key=>key===DEFAULT_PROFILE));
 const canonical=specs=>specs.map(({name,description,inputSchema,sideEffects})=>({name,description,inputSchema,sideEffects}));
 assert.deepEqual(canonical(app.manifest().tools),canonical(TOOL_SPECS));
 assert.deepEqual(Object.keys(app.tools()),TOOL_SPECS.map(t=>t.name));
 assert.deepEqual(JSON.parse(fs.readFileSync('web/tools.json')).tools,buildManifest().tools);
 for(const profile of ['sepolia','sepolia','sepolia']) {
 const input=[{jsonrpc:'2.0',id:1,method:'tools/list'},{jsonrpc:'2.0',id:2,method:'tools/call',params:{name:'squeek_request_checkpoint',arguments:{}}}].map(JSON.stringify).join('\n')+'\n';
 const child=spawnSync(process.execPath,['mcp/server.js'],{input,encoding:'utf8',env:{PATH:process.env.PATH,SQUEEK_PROFILE:profile},timeout:10000});
 assert.equal(child.status,0,child.stderr);const replies=child.stdout.trim().split('\n').map(JSON.parse);const tools=replies.find(reply=>reply.id===1).result.tools;assert.equal(replies.find(reply=>reply.id===2).error.code,-32602);
 assert.deepEqual(tools,canonical(TOOL_SPECS.filter(spec=>spec.surfaces.includes('mcp'))));
 assert.ok(tools.every(tool=>!tool.name.startsWith('squeek_request_')));
 }
 } finally {app.destroy();win.close();}
}
console.log('PASS canonical profile input migration, no legacy runtime lookups, Unknown-safe autopick, and exact SDK/JSON/window/MCP registry parity');

for(const action of ['deposit','withdraw','merge_deposited','approve_nft','approve_all','approve_sqk','claim_and_stake','stake','unstake'])for(const name of [`squeek_${action}_preview`,`squeek_prepare_${action}`,`squeek_request_${action}`]) {
 const spec=TOOL_SPECS.find(tool=>tool.name===name);if(spec)assert.deepEqual(spec.inputSchema.properties.profile.enum,['sepolia']);
}
console.log('PASS staking-only tools advertise v9, not an unsupported v6 adapter');

for(const tool of TOOL_SPECS)assert.equal(tool.inputSchema.properties.profile.default,undefined,'Context-dependent profiles must not advertise a static JSON-schema default');
