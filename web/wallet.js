// One EIP-1193 session store. Broadcast messages are hints: accounts are always
// re-read from this tab's selected provider, never trusted from another tab.
const DISCONNECTED='wheelhouse:disconnected', CHOICE='wheelhouse:wallet-rdns';
const address=value=>typeof value==='string'&&/^0x[\da-f]{40}$/i.test(value)?value:null;
const chain=value=>{try{const n=Number(BigInt(value));return Number.isSafeInteger(n)?n:null;}catch{return null;}};
export function createWallet({win=window,storage,pick=async()=>null,discoveryMs=40}={}){
 let state=Object.freeze({status:'disconnected',account:null,chainId:null,providerInfo:null,ethBalance:null});
 let chosen,epoch=0,destroyed=false,initializing,connecting,detach=()=>{};
 const listeners=new Set(),announced=new Map();
 const channel=win.BroadcastChannel?new win.BroadcastChannel('wheelhouse-wallet-v1'):null;
 const get=key=>{try{return storage?.get(key);}catch{return null;}};
 const set=(key,value)=>{try{storage?.set(key,value);}catch{}};
 const publish=type=>channel?.postMessage({type,rdns:chosen?.info.rdns});
 function update(patch,reason){if(destroyed)return;const previous=state;state=Object.freeze({...state,...patch});for(const fn of listeners)fn(state,previous,reason);}
 const status=(account,chainId)=>!account?'disconnected':chainId===11155111?'connected':'wrong-chain';
 function providers(){if(announced.size)return [...announced.values()];return win.ethereum?[{provider:win.ethereum,info:{rdns:'injected',name:'Browser wallet'}}]:[];}
 function announce(event){const {provider,info}=event.detail??{};if(typeof provider?.request!=='function'||typeof info?.rdns!=='string'||!info.rdns||info.rdns.length>200)return;announced.set(info.rdns,{provider,info:{rdns:info.rdns,name:String(info.name??info.rdns).slice(0,100)}});}
 win.addEventListener('eip6963:announceProvider',announce);
 async function balance(version=epoch){const provider=chosen?.provider,account=state.account;if(!provider||!account||state.chainId!==11155111)return;
  try{const raw=await provider.request({method:'eth_getBalance',params:[account,'latest']});if(!/^0x[\da-f]+$/i.test(raw))return;const n=BigInt(raw);if(version===epoch)update({ethBalance:`${n/10n**18n}.${String(n%10n**18n).padStart(18,'0')}`},'balance');}catch{/* Missing wallet balance is Unknown, never zero. */}
 }
 function accountsChanged(accounts){const version=++epoch,account=get(DISCONNECTED)==='true'?null:address(accounts?.[0]);update({account,status:status(account,state.chainId),ethBalance:null},'accounts');if(get(DISCONNECTED)!=='true')publish('account');if(account){if(state.chainId==null)void refresh();else void balance(version);}}
 function chainChanged(value){const version=++epoch,chainId=chain(value);update({chainId,status:status(state.account,chainId),ethBalance:null},'chain');void balance(version);}
 function locked(){accountsChanged([]);}
 function select(entry){if(chosen?.provider===entry.provider)return;detach();epoch++;chosen=entry;const p=entry.provider;
  p.on?.('accountsChanged',accountsChanged);p.on?.('chainChanged',chainChanged);p.on?.('disconnect',locked);
  detach=()=>{p.removeListener?.('accountsChanged',accountsChanged);p.removeListener?.('chainChanged',chainChanged);p.removeListener?.('disconnect',locked);};
  update({account:null,chainId:null,ethBalance:null,status:'disconnected',providerInfo:entry.info},'provider');
 }
 async function refresh(){if(destroyed||get(DISCONNECTED)==='true'||!chosen)return state;const version=++epoch,p=chosen.provider;
  try{const accounts=await p.request({method:'eth_accounts'});if(version!==epoch)return state;const chainId=chain(await p.request({method:'eth_chainId'}));if(version!==epoch)return state;const account=address(accounts?.[0]);update({account,chainId,ethBalance:null,status:status(account,chainId)},'restore');void balance(version);}catch{if(version===epoch)update({account:null,ethBalance:null,status:'disconnected'},'lock');}return state;
 }
 function init(){return initializing??=(async()=>{win.dispatchEvent(new win.Event('eip6963:requestProvider'));await new Promise(resolve=>win.setTimeout(resolve,discoveryMs));if(destroyed)return;const found=providers(),saved=get(CHOICE),entry=found.find(p=>p.info.rdns===saved)??(!saved&&found.length===1?found[0]:null);if(entry)select(entry);if(get(DISCONNECTED)!=='true')await refresh();})();}
 async function connect(){if(connecting)return connecting;connecting=(async()=>{await init();let found=providers();if(!found.length)throw new Error('No wallet found. Open this app in a browser tab with a wallet installed.');
  if(!chosen){const entry=found.length===1?found[0]:await pick(found);if(!entry)return state;select(entry);set(CHOICE,entry.info.rdns);}else set(CHOICE,chosen.info.rdns);
  const wasDisconnected=get(DISCONNECTED)==='true';set(DISCONNECTED,'false');update({status:'connecting'},'connecting');const version=++epoch;
  try{const accounts=await chosen.provider.request({method:'eth_requestAccounts'});if(version!==epoch)return state;const chainId=chain(await chosen.provider.request({method:'eth_chainId'}));if(version!==epoch)return state;set(DISCONNECTED,'false');const account=address(accounts?.[0]);update({account,chainId,status:status(account,chainId),ethBalance:null},'connect');publish('connect');void balance(version);return state;}
  catch(error){if(version===epoch){if(wasDisconnected&&!state.account)set(DISCONNECTED,'true');update({status:status(state.account,state.chainId)},'error');}throw error;}
 })().finally(()=>connecting=null);return connecting;}
 function disconnect({remote=false}={}){epoch++;set(DISCONNECTED,'true');update({account:null,chainId:null,ethBalance:null,status:'disconnected'},'disconnect');if(!remote)publish('disconnect');}
 if(channel)channel.onmessage=async({data})=>{if(destroyed)return;if(data?.type==='disconnect'){disconnect({remote:true});return;}if(!['connect','account'].includes(data?.type))return;await init();const entry=providers().find(p=>p.info.rdns===data.rdns);if(!entry)return;set(DISCONNECTED,'false');select(entry);set(CHOICE,entry.info.rdns);await refresh();};
 return {get:()=>state,provider:()=>chosen?.provider??null,providers,init,connect,refresh,disconnect,
  subscribe(fn){listeners.add(fn);fn(state,state,'initial');return()=>listeners.delete(fn);},
  acceptBalance(owner,chainId,value){if(owner?.toLowerCase()===state.account?.toLowerCase()&&chainId===state.chainId&&value!=null&&/^\d+(?:\.\d+)?$/.test(String(value)))update({ethBalance:String(value)},'balance');},
  destroy(){destroyed=true;epoch++;detach();listeners.clear();channel?.close();win.removeEventListener('eip6963:announceProvider',announce);}
 };
}
