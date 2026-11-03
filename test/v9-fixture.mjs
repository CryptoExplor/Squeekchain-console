import { installReviewFixture } from './review-fixture.mjs';
export async function installV9Fixture(page) {
 await installReviewFixture(page);
 await page.evaluate(async()=>{
  window.squeek.destroy();
  const {mount}=await import('/app.js');
  history.replaceState(null,'','#sepolia-v9/network');localStorage.setItem('squeekchain:profile','sepolia-v9');
  const owner='0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
  const verification={ok:true,trusted:true,blockNumber:'12101024',fullVerificationBlockNumber:'12101024',problems:[]};
  const net={core:{settledThroughRound:'2048',blockHeight:'8192',paused:false},mining:{lagRounds:'0',minted:{sqk:'12500000'}},nft:{totalSupply:'512'},policy:{maximumLevel:10,mergesOpen:true,levels:[{level:1,basePower:'2200',cooldownBlocks:'7'}]},checkpoint:{canCheckpoint:false,roundSettled:false,nextRound:'2049'},verification,snapshot:{blockNumber:'12101024',blockHash:'0x'+'ab'.repeat(32),peers:[{label:'sepolia.gateway.tenderly.co',state:'agreed'},{label:'ethereum-sepolia-rpc.publicnode.com',state:'agreed'}]}};
  const plan={pairs:[{survivor:'41',donor:'42',level:1,nextLevel:2,deposited:true}]};
  const wallet={owner,net,verification,ethBalance:{eth:'0.125'},totals:{count:3,deposited:2,claimable:{base:'2500000000000000000',sqk:'2.5'}},staking:{principal:{base:'100000000000000000000',sqk:'100'}},mergePlan:plan,squeeks:[{tokenId:'41',level:1,nextMergeHeight:'8192',custody:'Staked',deposited:true},{tokenId:'42',level:1,nextMergeHeight:'8192',custody:'Staked',deposited:true},{tokenId:'87',level:2,nextMergeHeight:null,custody:'Wallet',deposited:false}]};
  const h=window.v9={owner,net,wallet,counts:{'sepolia-v6':'0','sepolia-v9':'1'},previews:[],sends:0,fee:'10000000000000000',claimAmount:'2500000000000000000',approvalRequired:false,fail:false};
  const tx={to:owner,data:'0x1234',value:'0',chainId:11155111};
  async function actionPreview(_owner,action,input={}) {
   h.previews.push({action,input});
   if(action==='deposit'&&h.approvalRequired)return{ok:false,approvalRequired:true,tokenIds:['87'],reason:'NFT approval required.'};
   if(action==='unstake'&&input.maxFee!=null&&BigInt(input.maxFee)<BigInt(h.fee))return{ok:false,reason:'Fee increased'};
   return{ok:true,action,tx,gas:'80000',amount:action==='claimAndStake'?{base:h.claimAmount,sqk:'2.5'}:input.amount,fee:{base:h.fee,sqk:'0.01'},net:{base:String(BigInt(input.amount??'1000000000000000000')-BigInt(h.fee)),sqk:'0.99'},maxFee:h.fee,deadline:input.deadline??'1900000000',warning:action==='approveAll'?'Allows ALL current and future NFTs.':action==='approveNft'?'Allows only this NFT.':action};
  }
  window.ethereum={request:async({method})=>{if(method==='eth_chainId')return '0xaa36a7';if(['eth_accounts','eth_requestAccounts'].includes(method))return[owner];if(method==='eth_sendTransaction'){h.sends++;throw new Error('Mock wallet stops: no transaction submitted');}throw new Error('Unexpected '+method);},on(){},removeListener(){}};
  window.squeek=mount({profileBalanceReader:async()=>h.counts,adapterFactory:()=>({networkStatus:async()=>{if(h.fail)throw new Error('Mock RPC unavailable');return net;},verify:async()=>verification,walletStatus:async()=>wallet,mergePlan:async()=>plan,actionPreview,mergePreview:async(_owner,survivor,donor,{confirm})=>{h.previews.push({action:'merge',input:{survivor,donor,confirm}});return{ok:true,tx,gas:'80000',nextLevel:2,warning:'Donor burns permanently'};},claimPreview:async()=>{h.previews.push({action:'claim'});const amount={base:h.claimAmount,sqk:'2.5'};return{ok:true,total:amount,batches:[{tx,gas:'80000',tokenIds:[],amount}]};}}),fetcher:async()=>{throw new Error('Offline fixture');},activityReader:async()=>{throw new Error('No receipts');}});
  await window.squeek.refresh();
 });
}
