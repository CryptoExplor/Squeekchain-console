import fs from 'node:fs';
// Deterministic screenshots only: no production verification bypass or live RPC.
export async function installReviewFixture(page,{built=false}={}) {
  const builtScripts=new Set();
  await page.route('**/*',route=>{const url=new URL(route.request().url());if(url.hostname!=='127.0.0.1')return route.abort();
    if(built&&/^\/[\w-]+\.js$/.test(url.pathname)){builtScripts.add(url.pathname);return route.fulfill({body:fs.readFileSync(new URL('../dist'+url.pathname,import.meta.url)),contentType:'text/javascript'});}
    return route.continue();
  });
  // Prevent the normal adapter from starting. The test explicitly mounts its fake.
  await page.addInitScript(() => { window.__squeekMounted = true; });
  await page.goto('/');
  await page.evaluate(async () => {
    localStorage.setItem('wheelhouse:disconnected','true');
    const { mount } = await import('/app.js');
    localStorage.setItem('squeekchain:profile','sepolia-v6'); history.replaceState(null,'','#sepolia-v6/network');
    const owner = '0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54';
    const verification = { ok: true, trusted: true, blockNumber: '12101024', fullVerificationBlockNumber: '12101024', problems: [] };
    const verificationFor=key=>({...verification,fullVerificationBlockNumber:key==='sepolia-v9'?'12101025':'12101024'});
    const network = {
      core: { settledThroughRound: '2048', blockHeight: '8192', paused: false },
      mining: { lagRounds: '0', minted: { sqk: '12500000' } }, nft: { totalSupply: '512' },
      checkpoint: { canCheckpoint: false, roundSettled: false, nextRound: '2049', reason: 'Next round is not settled; no checkpoint is available.' },
      verification, snapshot: { blockNumber: '12101024', blockHash: `0x${'ab'.repeat(32)}` },
    };
    network.policy={maximumLevel:10,levels:Array.from({length:10},(_,i)=>({level:i+1,weight:String(1000*(i+1)),cooldownBlocks:String(i===9?0:2*(i+1))}))};
    window.reviewNetwork = network;
    const plan = { note: 'Mocked same-level pair. You choose which ID survives. Donor burn is permanent.', pairs: [
      { survivor: '41', donor: '42', level: 1, nextLevel: 2, powerBefore: '2000', powerAfter: '2400', powerGainPercent: 20 },
    ] };
    const wallet = {
      owner, ethBalance: { eth: '0.125' }, totals: { count: 3, power: '3000', sharePercent: .12, claimable: { sqk: '2.5' } }, net: network, verification, mergePlan: plan,
      squeeks: [
        { tokenId: '41', level: 1, activeWeight: '1000', pendingRound: '0', nextMergeBlock: '8192', claimable: { sqk: '1.25' } },
        { tokenId: '42', level: 1, activeWeight: '1000', pendingRound: '0', nextMergeBlock: '8192', claimable: { sqk: '1.25' } },
        { tokenId: '87', level: 1, activeWeight: null, pendingRound: null, nextMergeBlock: null, claimable: null },
      ],
    };
    const counters = window.reviewCounters = { simulations: 0, sends: 0 };
    window.ethereum = { request: async ({ method }) => {
      if (method === 'eth_chainId') return '0xaa36a7';
      if (method === 'eth_requestAccounts' || method === 'eth_accounts') return [owner];
      if (method === 'eth_sendTransaction') counters.sends++;
      throw new Error(`Offline review forbids wallet method ${method}`);
    }, on() {}, removeListener() {} };
    window.squeek = mount({ profileBalanceReader: async () => ({"sepolia-v6":{"wallet":"0","staked":"0","nftPower":"0"},"sepolia-v9":{"wallet":"0","staked":"0","nftPower":"0"}}),
      adapterFactory: profileKey => ({
        networkStatus: async () => ({...network,verification:verificationFor(profileKey)}), verify: async () => verificationFor(profileKey), walletStatus: async owner => ({...wallet,owner,net:{...network,verification:verificationFor(profileKey)},verification:verificationFor(profileKey)}), mergePlan: async () => plan,
        mergePreview: async () => { counters.simulations++; throw new Error('Screenshot must stop before simulation or wallet submission'); },
        art: async tokenId => ({ tokenId, name: `Mock Squeek #${tokenId}`, attributes: [], image: 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 8 8"><rect width="8" height="8" fill="#fff6dd"/><path d="M2 2h4v4H2z" fill="#8a6a10"/><path d="M3 3h1v1H3zM5 3h1v1H5z" fill="#292b26"/></svg>') }),
      }),
      fetcher: async (url, options) => { if (window.reviewRpcTest && url === 'https://custom-rpc.test/') return fetch(url, options); throw new Error('No API in offline review'); },
      activityReader: async () => { throw new Error('No receipt reads in offline review'); },
    });
    await window.squeek.refresh();
    const notice = document.createElement('p'); notice.className = 'notice'; notice.id = 'mock-review-notice';
    notice.textContent = 'MOCKED REVIEW · Synthetic data. No live RPC, contract simulation or transaction signing.';
    document.querySelector('main').prepend(notice);
  });
  return builtScripts;
}
