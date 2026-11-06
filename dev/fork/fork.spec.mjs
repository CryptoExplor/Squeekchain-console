// Explicit opt-in local-fork tests ONLY. This file is not part of test:live or production.
import {test,expect} from '@playwright/test';
import {createSqueekchain} from '../../sdk/squeekchain.js';
import {createDisplayApi} from '../../sdk/display-api.js';
import {getProfile} from '../../sdk/deployments.js';
import {forkContext} from './context.mjs';
const endpoint=process.env.FORK_URL;
const profile=getProfile('sepolia');
let context,sdk,holder,snapshot;
const json=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));
async function rpc(method,params=[]){return context.client.request({method,params});}
async function mine(){try{await rpc('anvil_mine',['0xc']);}catch{await rpc('hardhat_mine',['0xc']);}}
async function preview(action,input={}){const p=await sdk.actionPreview(holder,action,input);if(!p.ok)throw new Error(`${action} unavailable: ${p.reason}`);return p;}
let pageForSend;
async function execute(action,input={}){const p=await preview(action,input);await pageForSend.evaluate(async({holder,tx})=>{await window.ethereum.request({method:'eth_sendTransaction',params:[{from:holder,to:tx.to,data:tx.data,value:'0x0'}]});},{holder,tx:p.tx});await mine();return p;}
async function move(token,deposited){if(token.deposited===deposited)return;if(deposited){await execute('approveNft',{tokenId:token.tokenId});await execute('deposit',{tokenIds:[token.tokenId]});}else await execute('withdraw',{tokenIds:[token.tokenId]});}
test.beforeAll(async()=>{
 if(!endpoint)throw new Error('Explicit FORK_URL=http://127.0.0.1:8545 required. Start npm run fork:start separately.');
 context=forkContext(endpoint);if(await context.client.getChainId()!==11155111)throw new Error('Local fork must use Sepolia chain id');sdk=createSqueekchain({rpcContext:context});
 const api=createDisplayApi({profile}),events=await api.feed('/events?category=players&limit=100');const candidates=[...new Set(events.data.events.filter(e=>e.type==='nft.deposited').map(e=>e.payload?.account).filter(a=>/^0x[\da-f]{40}$/i.test(a??'')))];
 for(const candidate of candidates.slice(0,10)){const status=await sdk.walletStatus(candidate);if(status.squeeks.length>=2){holder=candidate;break;}}
 if(!holder)throw new Error('No current canonical v9 holder with two NFTs among deposited-event candidates. No fabricated IDs/funding.');
});
test.beforeEach(async({page})=>{
 snapshot=await rpc('evm_snapshot');try{await rpc('anvil_impersonateAccount',[holder]);await rpc('anvil_setBalance',[holder,'0x56bc75e2d63100000']);}catch{await rpc('hardhat_impersonateAccount',[holder]);await rpc('hardhat_setBalance',[holder,'0x56bc75e2d63100000']);}await mine();pageForSend=page;
 await page.exposeFunction('forkWallet',async request=>{if(['eth_accounts','eth_requestAccounts'].includes(request.method))return[holder];if(request.method==='eth_chainId')return'0xaa36a7';if(request.method==='wallet_revokePermissions')return null;if(request.method==='eth_sendTransaction'){const tx=request.params[0];if(tx.from.toLowerCase()!==holder.toLowerCase()||!Object.values(profile.addresses).some(a=>a.toLowerCase()===tx.to.toLowerCase()))throw new Error('Fork wallet address boundary');}return rpc(request.method,request.params);});
 await page.exposeFunction('forkRead',async({method,args})=>json(await sdk[method](...args)));
 await page.addInitScript(()=>{window.__squeekMounted=true;});await page.goto('/');
 await page.evaluate(async holder=>{const{mount}=await import('/app.js');history.replaceState(null,'','#sepolia/network');window.ethereum={request:request=>window.forkWallet(request),on(){}};const methods=['networkStatus','walletStatus','verify','mergePlan','mergePreview','claimPreview','checkpointPreview','actionPreview','art','artBatch'];window.squeek=mount({adapterFactory:()=>Object.fromEntries(methods.map(method=>[method,(...args)=>window.forkRead({method,args})])),profileBalanceReader:async()=>({'sepolia':{wallet:'0',staked:'0',nftPower:'0'},'sepolia':{wallet:'1',staked:'0',nftPower:'1'}})});await window.squeek.connect();},holder);
 await expect(page.getByTestId('holder-count')).not.toHaveText('Unknown');
});
test.afterEach(async()=>{if(snapshot)await rpc('evm_revert',[snapshot]);});
for(const action of ['merge','mergeDeposited','deposit','withdraw','claim','claimAndStake','stake','unstake'])test(`canonical ${action} through mocked EIP-1193 wallet on local fork`,async()=>{
 const status=await sdk.walletStatus(holder);
 if(['merge','mergeDeposited'].includes(action)){const groups=new Map();for(const t of status.squeeks){if(t.level>=status.net.policy.maximumLevel||BigInt(t.nextMergeHeight)>BigInt(status.net.core.blockHeight))continue;const group=groups.get(t.level)??[];group.push(t);groups.set(t.level,group);}const pair=[...groups.values()].find(g=>g.length>=2);if(!pair)throw new Error('No canonical cooldown-ready same-level pair. Do not bypass eligibility.');const [a,b]=pair;await move(a,action==='mergeDeposited');await move(b,action==='mergeDeposited');await execute(action,{survivor:a.tokenId,donor:b.tokenId,confirm:`BURN-${b.tokenId}`});return;}
 if(action==='deposit'||action==='withdraw'){const token=status.squeeks[0];await move(token,action==='withdraw');if(action==='deposit')await execute('approveNft',{tokenId:token.tokenId});await execute(action,{tokenIds:[token.tokenId]});return;}
 if(action==='stake'){await execute('approveSqk',{amount:'1'});await execute(action,{amount:'1'});return;}
 if(action==='unstake'){if(BigInt(status.staking.principal.base)<1n){await execute('approveSqk',{amount:'1'});await execute('stake',{amount:'1'});}await execute(action,{amount:'1'});return;}
 await execute(action);
});
