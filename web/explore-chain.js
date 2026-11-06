// Only loaded by Explore. The same snapshot, independent peers and published pins as action reads.
import {createRpcContext,createChainVerifier,isLogRangeError} from './bundle.js';
const serial=value=>JSON.parse(JSON.stringify(value,(_,v)=>typeof v==='bigint'?String(v):v));
export function createExploreReader({profile,rpcUrl,signal,chainCache,verificationCache}){
 if(!profile.addresses)throw new Error('Not deployed');
 const context=createRpcContext({rpcUrl,signal,chainCache}),client=context.client,nft=profile.abis.nft,core=profile.abis.core,stakingAbi=profile.abis.staking,verifier=createChainVerifier(verificationCache,profile);let snapshot,prepared,network;
 const eventSets=[[profile.addresses.nft,nft,['Transfer','Merged']],[profile.addresses.staking,stakingAbi,['Deposited','Withdrawn','DepositedMerge','Recovered']]];
 const events=eventSets.flatMap(([,abi,names])=>abi.filter(x=>x.type==='event'&&names.includes(x.name)));
 const read=(address,abi,functionName,args=[])=>({address,abi,functionName,args});
 return {
  async begin(blockNumber){snapshot=await context.snapshot(blockNumber);prepared=await verifier.prepare(client,snapshot,context.readIdentity);network=null;return snapshot;},
  async hash(blockNumber){if(blockNumber===snapshot.blockNumber)return snapshot.blockHash;return (await context.snapshot(blockNumber)).blockHash;},
  rangeError:isLogRangeError,
  async logs(fromBlock,toBlock){const logs=await client.getLogs({address:eventSets.map(s=>s[0]),events,strict:true,fromBlock,toBlock});for(const log of logs){const pair=eventSets.find(s=>s[0].toLowerCase()===log.address.toLowerCase());if(!pair||!pair[2].includes(log.eventName))throw new Error('Index history address mismatch');}return serial(logs.map(log=>({eventName:log.eventName,args:log.args,blockNumber:log.blockNumber,blockHash:log.blockHash,logIndex:log.logIndex,transactionHash:log.transactionHash,removed:log.removed})));},
  async network(){if(network)return network;const calls=[read(profile.addresses.core,core,'state'),read(profile.addresses.nft,nft,'totalSupply'),read(profile.addresses.nft,nft,'MAXIMUM_LEVEL'),read(profile.addresses.nft,nft,'mergesOpen')];const values=await client.multicall({contracts:calls,allowFailure:false,batchSize:0,blockNumber:snapshot.blockNumber}),max=Number(values[2]);
   if(!Number.isInteger(max)||max<1||max>32)throw new Error('Index policy unavailable');const powers=await client.multicall({contracts:Array.from({length:max},(_,i)=>read(profile.addresses.staking,stakingAbi,'basePower',[profile.addresses.nft,i+1])),allowFailure:false,batchSize:0,blockNumber:snapshot.blockNumber});
   network={totalSupply:String(values[1]),core:{blockHeight:String(values[0].blockHeight)},policy:{maximumLevel:max,mergesOpen:values[3],levels:powers.map((p,i)=>({level:i+1,basePower:String(p)}))}};return network;
  },
  async hydrate(tokens){const calls=tokens.flatMap(t=>[read(profile.addresses.nft,nft,'ownerOf',[BigInt(t.tokenId)]),read(profile.addresses.nft,nft,'level',[BigInt(t.tokenId)]),read(profile.addresses.nft,nft,'nextMergeHeight',[BigInt(t.tokenId)])]);const values=await client.multicall({contracts:calls,allowFailure:false,batchSize:0,blockNumber:snapshot.blockNumber}),deposited=tokens.filter((t,i)=>values[i*3].toLowerCase()===profile.addresses.staking.toLowerCase()),depositors=deposited.length?await client.multicall({contracts:deposited.map(t=>read(profile.addresses.staking,stakingAbi,'depositor',[profile.addresses.nft,BigInt(t.tokenId)])),allowFailure:false,batchSize:0,blockNumber:snapshot.blockNumber}):[];const owners=new Map(deposited.map((t,i)=>[t.tokenId,depositors[i]]));return tokens.map((t,i)=>{const chainOwner=values[i*3],inVault=chainOwner.toLowerCase()===profile.addresses.staking.toLowerCase(),depositor=owners.get(t.tokenId),deposited=inVault&&depositor&&!/^0x0{40}$/i.test(depositor);return {chainOwner:chainOwner.toLowerCase(),owner:(deposited?depositor:chainOwner).toLowerCase(),depositor:deposited?depositor.toLowerCase():null,deposited:Boolean(deposited),custody:inVault?'vault':'wallet',stray:inVault&&!deposited,level:Number(values[i*3+1]),nextMergeHeight:String(values[i*3+2])};});},
  async block(blockNumber){const b=await client.getBlock({blockNumber});return {timestamp:String(b.timestamp),hash:b.hash};},
  async finish(){await context.check(snapshot);prepared.commit();}
 };
}
