import assert from 'node:assert/strict';
import fs from 'node:fs';
import {JSDOM} from 'jsdom';
import {createWallet} from '../web/wallet.js';
import {wheelFeed,formingBlock} from '../web/wheel-feed.js';
const owner='0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54',other='0x1111111111111111111111111111111111111111';
const html=fs.readFileSync('web/index.html','utf8'),dom=new JSDOM(html,{url:'https://wallet.test/'}),win=dom.window;
// Static literal lookups across the app, including lazy modules, plus a runtime
// guard below for indirect element IDs. Deliberately exercise the regression.
const ids=[...fs.readdirSync('web').filter(p=>p.endsWith('.js')&&p!=='bundle.js').flatMap(file=>[...fs.readFileSync('web/'+file,'utf8').matchAll(/(?:\$|getElementById)\(\s*['"]([^'"]+)['"]\s*\)/g)].map(m=>m[1]))];
for(const id of ids)assert.ok(win.document.getElementById(id),`Missing static app element #${id}`);
assert.equal(win.document.getElementById('wheel-feed-item'),null,'public round list removed, never confused with owner Activity');
function mock(name){let accounts=[owner],chain='0xaa36a7';const calls=[],listeners=new Map();return {info:{name,rdns:'test.'+name},calls,listeners,
 request:async({method})=>{calls.push(method);if(method==='eth_accounts'||method==='eth_requestAccounts')return accounts;if(method==='eth_chainId')return chain;if(method==='eth_getBalance')return '0x1bc16d674ec8000';throw new Error('Signing forbidden');},
 on(type,fn){if(!listeners.has(type))listeners.set(type,new Set());listeners.get(type).add(fn);},removeListener(type,fn){listeners.get(type)?.delete(fn);},
 emit(type,value){if(type==='accountsChanged')accounts=value;if(type==='chainChanged')chain=value;for(const fn of [...listeners.get(type)??[]])fn(value);}};}
const storage={get:key=>win.localStorage.getItem(key),set:(key,v)=>win.localStorage.setItem(key,v)};
try{
 const p=mock('one');win.ethereum=p;
 let wallet=createWallet({win,storage,discoveryMs:0});await wallet.init();assert.equal(wallet.get().account,owner);assert.equal(p.calls.includes('eth_requestAccounts'),false,'silent restore never opens popup');
 await wallet.connect();await wallet.connect();assert.equal(p.listeners.get('accountsChanged').size,1);assert.equal(p.listeners.get('chainChanged').size,1);
 wallet.destroy();wallet=createWallet({win,storage,discoveryMs:0});await wallet.init();assert.equal(wallet.get().account,owner,'reload restores authorised session');
 wallet.disconnect();wallet.destroy();const before=p.calls.length;wallet=createWallet({win,storage,discoveryMs:0});await wallet.init();assert.equal(wallet.get().account,null);assert.equal(p.calls.length,before,'explicit disconnect survives reload without eth_accounts');
 await wallet.connect();p.emit('chainChanged','0x1');assert.equal(wallet.get().status,'wrong-chain');p.emit('chainChanged','0xaa36a7');assert.equal(wallet.get().status,'connected');p.emit('accountsChanged',[other]);assert.equal(wallet.get().account,other);p.emit('accountsChanged',[]);assert.equal(wallet.get().account,null);assert.equal(wallet.get().ethBalance,null);
 wallet.destroy();const second=mock('two');win.localStorage.clear();const announce=()=>{for(const provider of [p,second])win.dispatchEvent(new win.CustomEvent('eip6963:announceProvider',{detail:{provider,info:provider.info}}));};win.addEventListener('eip6963:requestProvider',announce);
 let offered=0;wallet=createWallet({win,storage,discoveryMs:0,pick:async entries=>{offered=entries.length;return entries[1];}});await wallet.init();assert.equal(wallet.provider(),null,'ambiguous discovery does not silently pick');await wallet.connect();assert.equal(offered,2);assert.equal(wallet.provider(),second);assert.equal(storage.get('wheelhouse:wallet-rdns'),'test.two');wallet.destroy();
 wallet=createWallet({win,storage,discoveryMs:0,pick:()=>{throw new Error('remembered choice must not reprompt');}});await wallet.init();assert.equal(wallet.provider(),second);assert.equal(second.calls.filter(c=>c==='eth_requestAccounts').length,1);wallet.destroy();win.removeEventListener('eip6963:requestProvider',announce);
 // Event during an outstanding restore wins over its stale response.
 win.localStorage.clear();let resolve;const race=mock('race'),request=race.request;race.request=args=>args.method==='eth_accounts'?new Promise(r=>resolve=r):request(args);win.ethereum=race;
 wallet=createWallet({win,storage,discoveryMs:0});const ready=wallet.init();await new Promise(r=>win.setTimeout(r,2));race.emit('chainChanged','0xaa36a7');race.emit('accountsChanged',[other]);resolve([owner]);await ready;assert.equal(wallet.get().account,other);wallet.destroy();
 const now=Date.now(),at=new Date(now-120000).toISOString();const events=[{id:'settle',type:'system.settlement_completed',occurredAt:at,payload:{settledThroughRound:'1273',completedBlockCount:'56'}},{id:'checkpoint',type:'system.mining_checkpointed',occurredAt:at,payload:{throughRound:'1273',amountBaseUnits:'5600000000000000000000'}},{type:'nft.merged',occurredAt:at,payload:{donorTokenId:'812',survivorTokenId:'77'}},{type:'unknown',payload:{}}];
 const rows=wheelFeed(events,[{settledThroughRound:'1273',completedBlockCount:'56',blockTimestamp:at}],now);assert.equal(rows.length,2);assert.match(rows.find(r=>r.text.startsWith('Round')).text,/Round 1,273 settled · 56 blocks · 5,600 SQK issued \(checkpoint\) · 2m/);assert.match(rows.find(r=>r.text.startsWith('Squeek')).text,/Squeek #812 merged into #77 · 2m/);assert.equal(wheelFeed([{type:'system.mining_checkpointed',payload:{throughRound:'1'}}]).length,0);
 assert.equal(formingBlock({projected:{blockHeight:'2393',blockProgress:'130983659'}},true),'Block 2,394 forming · 13% · provisional');assert.equal(formingBlock({},false),null);
 console.log('PASS wallet store: silent reload, persistent disconnect, once-only listeners, lock, chain/account changes, discovery/picker/rdns, restore race; real wheel rows/dedupe; all static app IDs exist');
}finally{win.close();}
