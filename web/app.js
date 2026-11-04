/**
 * Wheelhouse — a Squeekchain holder console.
 *
 * Profile-driven: each deployment profile maps onto an adapter with the same surface
 * (verify / networkStatus / walletStatus / capability-driven actions / art).
 *   sepolia-v9   → pinned issuance v9 + staking + NFT graph (guarded reads/actions)
 *   sepolia-v6   → the published SqueekMining v6 graph        (reads + checkpoint/claim/merge)
 *   mainnet      → no deployment
 *
 * Every action is simulated first and signed in the user's wallet. No key ever reaches this code.
 */
import {
  createDisplayApi, createDisplayCache, displayKey, apiNetwork, apiWallet, createWheelPoller, DAY, DISPLAY_TTL,
  createSqueekchain,
  createSqueek9,
  PROFILES,
  DEFAULT_PROFILE,
  getProfile,
  TOOL_SPECS,
  buildManifest,
  CHAIN,
  abortable,
  createDiscoveryStore,
  createRpcContext,
  rpcToolError,
  ACTION_REASONS,
  PUBLIC_RPC_ENDPOINTS,
  readToolResult, runPublicReadTool, toolProfile, settlementStatus, requireBurn,
  profileBalances, chooseProfile, profileFromHash, profileInput, parseEther, formatEther, profileHeld, profileCountLabel, unstakeQuoteError,
} from "./bundle.js";

import { Panel, Stat, Table, TokenCard, ConfirmDialog, Toast, UNKNOWN, valueText, formatNumber, formatAmount } from './components.js';
import {createHoldings} from './holdings.js';
import {wheelFeed,formingBlock} from './wheel-feed.js';
import {createWallet} from './wallet.js';
import {createImages} from './images.js';
import { createActivity } from "./activity.js";
import { createTelemetry, telemetryView } from "./telemetry.js";

// EIP-1193 prompts outlive view cancellation and even remounts in this page.
const outstandingPrompts=new WeakMap();
const EXPLORER = "https://eth-sepolia.blockscout.com";
const THEME_KEY = "squeekchain:theme";

export function mount({ doc = document, win = window, adapterFactory, fetcher = globalThis.fetch, activityReader, profileBalanceReader } = {}) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    profileSelect: $("profile-select"),
    verified: $("verified-chip"),
    walletEth: $("wallet-eth"),
    connect: $("btn-connect"),
    theme: $("btn-theme"),
    refresh: $("btn-refresh"),
    banner: $("banner"),
    tabs: [...doc.querySelectorAll(".tab")],
    panels: [...doc.querySelectorAll("[data-panel]")],
    net: {
      chain: $("net-chain"),
      kind: $("net-kind"),
      round: $("net-round"),
      blocks: $("net-blocks"),
      lag: $("net-lag"),
      issued: $("net-issued"),
      squeeks: $("net-squeeks"),
      paused: $("net-paused"),
      release: $("profile-release"),
      notice: $("profile-notice"),
      settlement: $("settlement-notice"),
    },
    cp: { button: $("btn-checkpoint"), reason: $("cp-reason"), out: $("cp-result"), explain: $("cp-explain") },
    holder: {
      owner: $("holder-owner"),
      body: $("holder-body"),
      empty: $("holder-empty"),
      count: $("holder-count"),
      power: $("holder-power"),
      share: $("holder-share"),
      claimable: $("holder-claimable"),
      claim: $("btn-claim"),
      refresh: $("btn-holder-refresh"),
      claimOut: $("claim-result"),
      head: $("squeeks-head"),
      tbody: $("squeeks-tbody"),
      mergeList: $("merge-list"),
      mergeNote: $("merge-note"),
      watchRow: $("watch-row"),
      watchInput: $("watch-input"),
      watch: $("btn-watch"),
    },
    art: { token: $("art-token"), one: $("btn-art-one"), mine: $("btn-art-mine"), grid: $("art-grid"), status: $("art-status") },
    agent: { select: $("tool-call"), run: $("btn-run-tool"), args: $("tool-args"), out: $("tool-result"), copy: $("btn-copy-manifest") },
    modal: { root: $("modal"), title: $("modal-title"), body: $("modal-body"), input: $("modal-input"), cancel: $("btn-modal-cancel"), confirm: $("btn-modal-confirm") },
    toasts: $("toasts"),
  };

  doc.querySelectorAll('.panel').forEach(node => Panel(node));
  doc.querySelectorAll('.stat').forEach(node => Stat(node));
  const networkPanel = Panel($("profile-panel"));
  const dialog = ConfirmDialog({ doc, win, elements: el.modal });
  const openModal = dialog.open;
  const confirmModal = dialog.confirm;

  const store = {
    get: (k) => {
      try {
        return win.localStorage?.getItem(k) ?? null;
      } catch {
        return null;
      }
    },
    set: (k, v) => {
      try {
        win.localStorage?.setItem(k, v);
      } catch {
        /* private mode */
      }
    },
  };

  const wallet=createWallet({win,storage:store,pick:pickWallet});
  const state = {
    profileKey: profileFromHash(win.location.hash) ?? profileInput(store.get("squeekchain:profile")),
    profileCounts: {},
    adapter: null,
    get account(){return wallet.get().account;},
    get chainId(){return wallet.get().chainId;},
    get walletEth(){const value=wallet.get().ethBalance;return value==null?null:Number(value).toFixed(3);},
    inspected: null,
    net: null,
    status: null,
    plan: null,
    art: new Map(),
    get walletPromptPending(){return outstandingPrompts.has(wallet.provider());},
    busy: false, // transaction signing ONLY; never used to gate reads or navigation
    receipts: [],
    artifactsLoaded: false,
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  const toast = (msg, kind = "", options = {}) => Toast({ doc, host: el.toasts, message: msg, kind, ...options });
  function pendingSwitchNotice(){const count=activity.list().filter(item=>!['confirmed','reverted'].includes(item.status)).length;if(count)toast(`${count} transaction${count===1?'':'s'} still pending. Switching won't cancel ${count===1?'it':'them'}.`,'warn',{action:'View',onAction:()=>openSheet('activity-drawer')});}
  let readBanner=false;
  const header=doc.querySelector('.topbar');
  const positionBanner=()=>doc.documentElement.style.setProperty('--header-bottom',`${Math.max(0,header?.getBoundingClientRect().bottom??0)}px`);
  const headerObserver=win.ResizeObserver?new win.ResizeObserver(positionBanner):null;
  if(header)headerObserver?.observe(header);
  win.addEventListener('resize',positionBanner);win.addEventListener('scroll',positionBanner,{passive:true});
  positionBanner();
  const showBanner = (msg, kind = "") => {
    readBanner=false;positionBanner();
    el.banner.textContent = msg;
    el.banner.className = `notice ${kind}`;
  };
  const hideBanner = () => {readBanner=false;el.banner.classList.add('hidden');};
  const clearReadBanner=()=>{if(readBanner)hideBanner();};
  function showReadFailure(error,scope) {
    const failure=rpcToolError(error,state.adapter?.rpcDiagnostics?.()??[]);
    state.lastReadFailure={scope,profile:state.profileKey,...failure};
    const availability=failure.diagnostics.availability;
    const message=availability?'RPC unavailable. Verified reads need two independent Sepolia peers. Nothing was signed.':'Network or contract checks could not be completed. Actions are stopped. Nothing was signed.';
    el.verified.textContent=availability?'Unavailable':'Stopped';
    $('profile-status').textContent=availability?'Unavailable':failure.diagnostics.trust?'Mismatch: stop':'Unverified';
    $('profile-status').className=`chip ${availability?'warn':'bad'}`;
    $('profile-status').title=el.verified.title='';
    renderTrust(availability?null:{ok:false,trusted:false});$('trust-block').textContent=UNKNOWN;$('trust-result').textContent=(availability?'Unavailable':failure.diagnostics.trust?'Stopped':'Unverified')+' — '+errorMessage(error);
    showBanner(message,availability?'warn':'bad');readBanner=true;
  }
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : UNKNOWN);
  const num = formatNumber;
  const sqk = formatAmount;
  const setStat = (node, value, formatter = valueText) => Stat(node.closest('.stat')).set(value, formatter);
  const json = (v) => JSON.stringify(v, null, 2);
  const actionNames={merge:'Merge Squeeks',mergeDeposited:'Merge deposited',deposit:'Deposit',withdraw:'Withdraw',claim:'Claim',claimAndStake:'Claim and stake',stake:'Stake',unstake:'Unstake',approveNft:'Approve one Squeek',approveAll:'Approve all Squeeks',approveSqk:'Approve SQK'};
  const technical=value=>JSON.stringify(value,(_key,v)=>typeof v==='string'&&v.includes(getProfile('sepolia-v9').identities?.release??'\u0000')?'[internal deployment]':v,2);
  const showOut = (node,value) => {
    if(node.id==='tool-result'){node.textContent=technical(value);node.classList.remove('hidden');return;}
    node.replaceChildren();const title=doc.createElement('p');title.textContent=value.ok?'Simulation passed':value.reason?errorMessage({message:value.reason}):'Preview unavailable';node.append(title);
    const facts=doc.createElement('dl');facts.className='preview-facts';
    const labels={merge:'Merge Squeeks',mergeDeposited:'Merge deposited Squeeks',claim:'Claim SQK',claimAndStake:'Claim and stake',stake:'Stake SQK',unstake:'Unstake SQK',deposit:'Deposit Squeeks',withdraw:'Withdraw Squeeks',approveNft:'Approve one Squeek',approveAll:'Approve all Squeeks',approveSqk:'Approve SQK'};
    for(const [label,raw] of [['Action',labels[value.action]??(value.nextRound?'Checkpoint':null)],['Amount',value.total??value.amount],['Keep',value.survivor],['Burn',value.donor],['Squeeks',value.tokenIds?.join(', ')],['Recipient',value.recipient],['Fee',value.fee],['You receive',value.net]]){if(raw==null)continue;const group=doc.createElement('div'),dt=doc.createElement('dt'),dd=doc.createElement('dd');dt.textContent=label;dd.textContent=raw?.sqk!=null?sqk(raw):label==='Amount'&&/^\d+$/.test(String(raw))?`${formatEther(BigInt(raw))} SQK`:String(raw);group.append(dt,dd);facts.append(group);}node.append(facts);
    const details=doc.createElement('details'),summary=doc.createElement('summary'),raw=doc.createElement('pre'),copy=doc.createElement('button');summary.textContent='Technical details';raw.textContent=technical(value);copy.className='btn';copy.textContent='Copy';copy.onclick=async()=>{try{await win.navigator.clipboard.writeText(raw.textContent);}catch{toast('Copy unavailable','warn');}};details.append(summary,copy,raw);node.append(details);node.classList.remove('hidden');
  };
  const errorMessage = err => {
    const message=String(err?.message??err);
    return err?.revert||/\b(?:storage|slots?|digest|revision|release|runtime)\b|\w+\(/i.test(message)||message.includes(getProfile('sepolia-v9').identities.release)
      ? 'The network or contract check failed. Actions are stopped. See Info › Developers for technical details.' : message;
  };
  const provider = () => wallet.provider();

  // ── theme ──────────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    const choice = ['light', 'dark', 'system'].includes(theme) ? theme : 'light';
    theme = choice === 'system' ? (win.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : choice;
    $('theme-choice').value = choice;
    doc.documentElement.dataset.theme = theme;
    // Authored UI icon, not untrusted artwork/metadata SVG.
    const icon = doc.createElementNS('http://www.w3.org/2000/svg', 'svg');
    for (const [key, value] of Object.entries({ width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'aria-hidden': true, focusable: false })) icon.setAttribute(key, value);
    const path = doc.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', theme === 'dark'
      ? 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0ZM12 2v2m0 16v2M2 12h2m16 0h2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'
      : 'M20.9 13A9 9 0 0 1 11 3.1 9 9 0 1 0 20.9 13Z');
    icon.append(path); el.theme.replaceChildren(icon);
    el.theme.setAttribute("aria-pressed", String(theme === "dark"));
    el.theme.title = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
    const surface = win.getComputedStyle?.(doc.documentElement)?.getPropertyValue("--sqk-bg").trim();
    doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", surface || (theme === "dark" ? "#10120f" : "#fafaf7"));
    store.set(THEME_KEY, choice);
  }
  const themeMedia = win.matchMedia?.('(prefers-color-scheme: dark)');
  const onSystemTheme = () => { if (store.get(THEME_KEY) === 'system') applyTheme('system'); };
  themeMedia?.addEventListener?.('change', onSystemTheme);
  el.theme.onclick = () => applyTheme(doc.documentElement.dataset.theme === "dark" ? "light" : "dark");

  // ── profile switching ──────────────────────────────────────────────────────
  let generation = 0,verifiedForGeneration=null;
  let loadController = new AbortController();
  const captureLoad = () => ({ generation, signal: loadController.signal, adapter: state.adapter, profileKey: state.profileKey });
  const isCurrent = load => !destroyed && load.generation === generation && !load.signal.aborted;
  const assertCurrent = load => { if (!isCurrent(load)) throw new DOMException("Profile changed; result discarded", "AbortError"); };
  async function viewAwait(load, operation) {
    assertCurrent(load);
    const value = await abortable(operation, load.signal);
    assertCurrent(load);
    return value;
  }
  const readFor = (load, method, ...args) => viewAwait(load, async () => {
    if(['mergePreview','claimPreview','actionPreview','checkpointPreview'].includes(method)&&state.account&&state.chainId!==11155111)throw new Error('Wrong chain: Sepolia required');
    // API rows are display hints, NEVER a transaction ID/eligibility source.
    if(!adapterFactory&&['mergePreview','claimPreview','actionPreview'].includes(method)){
      const action=method==='mergePreview'?'merge':method==='claimPreview'?'claim':args[1];
      const needsIds=['merge','mergeDeposited','deposit','withdraw','approveNft'].includes(action)||(action==='claim'&&getProfile(load.profileKey).abiSet!=='v9'&&args[1]?.length);
      if(needsIds){const live=await load.adapter.walletStatus(args[0]);assertCurrent(load);const owned=id=>{const found=live.squeeks.find(item=>String(item.tokenId)===String(id));if(!found)throw new Error('Token not in fresh on-chain inventory');return found.tokenId;};
        if(method==='mergePreview')args=[args[0],owned(args[1]),owned(args[2]),args[3]];
        else if(method==='claimPreview')args=[args[0],args[1].map(owned)];
        else {const input={...args[2]};for(const field of ['survivor','donor','tokenId'])if(input[field])input[field]=owned(input[field]);if(input.tokenIds)input.tokenIds=input.tokenIds.map(owned);args=[args[0],action,input];}
      }
    }
    const value=await load.adapter[method](...args);assertCurrent(load);
    const verification=method==='verify'?value:value?.verification;if(verification)renderVerification(verification);
    return value;
  });
  function resetLoad(){verifiedForGeneration=null;loadController.abort();generation++;loadController=new AbortController();state.adapter=buildAdapter(state.profileKey);}
  const displayCache=createDisplayCache(win.indexedDB),lastGood=new Map();let apiScope;
  function displayApi(load){if(adapterFactory||load.profileKey!=='sepolia-v9')return null;if(apiScope?.generation!==load.generation)apiScope={generation:load.generation,client:createDisplayApi({profile:getProfile(load.profileKey),fetcher:fetcher??win.fetch?.bind(win)??globalThis.fetch,cache:displayCache,signal:load.signal})};return apiScope.client;}
  function displayStamp(value){const source=value?.source;if(!source)return;const age=Math.max(0,Math.floor((Date.now()-source.at)/60000)),text=`${source.kind==='api'?'API · 12 blocks behind':'RPC display snapshot'}${age?` · as of ${age} min`:''}`;for(const node of doc.querySelectorAll('.stat'))node.title=text;$('display-age').textContent=age?`as of ${age} min`:'';}
  function displayVerification(value){
    if(!value.source||value.source.kind==='rpc'){if(value.verification)renderVerification(value.verification);return;}
    if(state.lastReadFailure?.profile===state.profileKey)return;
    if(verifiedForGeneration){renderVerification(verifiedForGeneration);return;}
    renderTrust(null);$('trust-block').textContent=UNKNOWN;
    $('trust-result').textContent='Checking… No contract verification has completed. API data is display only; fresh independent checks run before actions.';
    $('profile-status').textContent='Checking…';$('profile-status').className='chip';
    $('profile-status').title='Awaiting contract verification. Display data is not transaction authority. Open Info › Trust for details.';
    el.verified.textContent='Checking…';
  }
  async function displayRead(load,kind,owner,{force=false}={}){
    if(adapterFactory)return readFor(load,kind==='network'?'networkStatus':'walletStatus',...(owner?[owner]:[]));
    const profile=getProfile(load.profileKey),key=displayKey(profile,kind+':'+(owner??'')),ttl=profile.abiSet==='v6'&&kind==='network'?DAY:DISPLAY_TTL;
    let saved=lastGood.get(key);if(!saved&&profile.abiSet==='v6'&&kind==='network')saved=await displayCache.get(key);assertCurrent(load);
    if(!force&&profile.abiSet==='v6'&&kind==='network'&&saved&&Date.now()-saved.at<ttl)return {...saved.value,source:{kind:'cached-rpc',at:saved.at}};
    try{let value;const api=displayApi(load);
      if(api){if(kind==='network'){const economy=await api.economy(),core=await api.core();value=apiNetwork(core,economy);}
        else {const net=!force&&state.net?.source?.kind==='api'?state.net:await displayRead(load,'network',null,{force});value=apiWallet(await api.account(owner),net,owner);}
      }else value=await readFor(load,kind==='network'?'networkStatus':'walletStatus',...(owner?[owner]:[]));
      assertCurrent(load);if(!value.source)value={...value,source:{kind:'rpc',at:Date.now()}};const entry={value,at:value.source.at};lastGood.set(key,entry);if(profile.abiSet==='v6'&&kind==='network')await displayCache.set(key,entry);return value;
    }catch(error){assertCurrent(load);if(error.name==='TypeError'&&!error.kind)throw error;if(error.name==='RpcTrustError'||error.kind==='mismatch'){lastGood.delete(key);await displayCache.delete(key);saved=null;}
      if(error.kind==='unavailable'||error.kind==='schema'){lastGood.delete(key);await displayCache.delete(key);saved=null;}
      if(saved&&Date.now()-saved.at<ttl&&(error.kind==='transport'||error.name==='TypeError'))return {...saved.value,source:{...saved.value.source,kind:saved.value.source?.kind==='api'?'api':'cached-rpc',at:saved.at,stale:true}};
      // Unavailable API is not zero. Only the fresh guarded SDK may supply fallback.
      if(displayApi(load)){const value=await readFor(load,kind==='network'?'networkStatus':'walletStatus',...(owner?[owner]:[]));assertCurrent(load);return {...value,source:{kind:'rpc',at:Date.now()}};}
      throw error;
    }
  }
  let wheelEvents=[],wheelSettlements=[],feedLimit=5;
  function feedRows(id,rows){const root=$(id);root.replaceChildren(...rows.map(row=>{const li=$('wheel-feed-item').content.firstElementChild.cloneNode(true),icon=li.querySelector('.feed-icon'),text=li.querySelector('.feed-text');icon.textContent={round:'◷',sqk:'↗',squeek:'◇'}[row.icon]??'◇';text.textContent=row.text;return li;}));root.title='API · 12 blocks behind';}
  function renderWheelFeed(){const rows=wheelFeed(wheelEvents,wheelSettlements);feedRows('network-events',rows.slice(0,feedLimit));$('wheel-show-more').classList.toggle('hidden',rows.length<=feedLimit);$('wheel-show-more').setAttribute('aria-expanded',String(feedLimit>5));}
  $('wheel-show-more').onclick=()=>{feedLimit+=5;renderWheelFeed();};
  async function readWheelEvents(){const load=captureLoad(),api=displayApi(load);const result=await api.feed();assertCurrent(load);wheelEvents=result.data.events;renderWheelFeed();return result;}
  async function displayFeeds(load){const api=displayApi(load);if(!api)return;
    for(const [kind,read] of [['events',()=>api.feed()],['settlements',()=>api.settlements()],...(state.inspected?[['account',()=>api.feed(`/accounts/${state.inspected.toLowerCase()}/activity?limit=25`)]]:[])]){
      try{const result=await read();assertCurrent(load);if(kind==='events')wheelEvents=result.data.events;else if(kind==='settlements')wheelSettlements=result.data.recentSettlements;else feedRows('account-activity',wheelFeed(result.data.events??result.data.activity));renderWheelFeed();}
      catch(error){if(!isCurrent(load))return;if(error.name==='RpcTrustError'){clearDisplayMismatch(error);return;}if(error.kind&&error.kind!=='transport'){if(kind==='events')wheelEvents=[];else if(kind==='settlements')wheelSettlements=[];else $('account-activity').replaceChildren();renderWheelFeed();}}
    }
  }
  function clearWheelFeed(){wheelEvents=[];wheelSettlements=[];feedLimit=5;renderWheelFeed();for(const id of ['account-activity','provisional-blocks'])$(id).replaceChildren();$('provisional-blocks').classList.add('hidden');}
  function clearDisplayMismatch(error){wheelGoodAt=0;lastGood.clear();state.net=null;renderNetworkPlaceholder();renderHolder(null);for(const id of ['wheel-rpm','wheel-speed','wheel-distance'])$(id).textContent=UNKNOWN;$('wheel-state').textContent='Unknown';clearWheelFeed();showReadFailure(error,'API identity');}

  let destroyed = false;
  const telemetry = createTelemetry({ fetcher });
  const verificationCache = new Map();
  const chainCache = new Map();
  const discoveryCache = createDiscoveryStore(win.indexedDB);
  let receiptContext, receiptRpcUrl;
  const activityNotices=new Map();let activityReady=false;
  const activity = createActivity({ storage: store, eventTarget:win, onChange: renderActivity, receiptReader: activityReader ?? (async (item, { signal }) => {
    const rpcUrl = store.get('wheelhouse:rpc') || undefined;
    if (!receiptContext || rpcUrl !== receiptRpcUrl) {
      receiptContext = createRpcContext({ rpcUrl, chainCache, signal, provider: () => state.account ? provider() : null });
      receiptRpcUrl = rpcUrl;
    }
    const receipt = await receiptContext.client.getTransactionReceipt({ hash: item.hash });
    const snapshot = await receiptContext.snapshot(receipt.blockNumber);
    if (snapshot.blockHash.toLowerCase() !== receipt.blockHash.toLowerCase()) throw new Error('Receipt block hash mismatch');
    await receiptContext.check(snapshot);
    const head = await receiptContext.client.getBlockNumber({ cacheTime: 0 });
    if (head < receipt.blockNumber) throw new Error('Receipt is ahead of the RPC head');
    return { receipt, confirmations: head - receipt.blockNumber + 1n };
  }) });
  function renderActivity(items) {
    el.connect.dataset.activityCount = String(items.length);
    if (!state.account) renderWalletChip();
    $('activity-empty').classList.toggle('hidden', items.length !== 0);
    const pending = items.filter(item => !['confirmed', 'reverted'].includes(item.status)).length;
    for(const item of items){const key=item.hash.toLowerCase(),before=activityNotices.get(key);if(activityReady&&before!==item.status){if(!before)toast(`${item.label} submitted.`, '', {action:'View',onAction:()=>openSheet('activity-drawer')});if(item.status==='confirmed')toast(`${item.label} confirmed.`, 'ok', {action:'View',onAction:()=>openSheet('activity-drawer')});if(item.status==='reverted')toast(`${item.label} failed.`, 'err', {action:'View',onAction:()=>openSheet('activity-drawer')});}activityNotices.set(key,item.status);}
    activityReady=true;
    $('pending-count').textContent = String(pending);
    $('pending-count').classList.toggle('hidden', !pending);
    $('btn-open-activity').setAttribute('aria-label', `Activity, ${pending} pending`);
    $('activity-list').replaceChildren(...items.map(item => {
      const row = doc.createElement('li');
      const link = doc.createElement('a');
      link.href = `${EXPLORER}/tx/${item.hash}`; link.target = '_blank'; link.rel = 'noreferrer';
      link.textContent = `${item.label} · ${item.hash.slice(0, 10)}…`;
      const detail = doc.createElement('span');
      detail.textContent = `${getProfile(item.profile).label} · ${item.chain ?? 'Sepolia'} · ${item.status}${item.receiptStatus === 'reverted' && item.status === 'mined' ? ' (reverted)' : ''} · ${item.time}${item.lastError ? ` · ${item.lastError}` : ''}`;
      row.append(link, detail);
      return row;
    }));
  }
  $('btn-refresh-activity').onclick = () => activity.refresh();


  function buildAdapter(profileKey) {
    const profile = getProfile(profileKey);
    if (!profile.addresses) return null;
    if (adapterFactory) return adapterFactory(profileKey, { signal: loadController.signal, generation });
    return profile.abiSet === "v9"
      ? createSqueek9({ profileKey, cache: store, verificationCache, chainCache, discoveryCache, signal: loadController.signal, rpcUrl: store.get("wheelhouse:rpc") || undefined, provider: () => state.account ? provider() : null })
      : createSqueekchain({ addresses: profile.addresses, cache: store, verificationCache, chainCache, discoveryCache, signal: loadController.signal, rpcUrl: store.get("wheelhouse:rpc") || undefined, provider: () => state.account ? provider() : null });
  }

  function renderProfileOptions() {
    el.profileSelect.replaceChildren(
      ...Object.values(PROFILES).map((p) => {
        const option = doc.createElement("option");
        option.value = p.key;
        const count = state.profileCounts[p.key];
        option.textContent = p.label + (state.account && p.addresses ? ` · ${profileCountLabel(count)}` : "");
        // Mainnet remains selectable as an honest launch-status view.
        return option;
      }),
    );
    el.profileSelect.value = state.profileKey;
    const badge = $('profile-status');
    badge.setAttribute('aria-label', 'Live verification: open Info Trust');
    $('profile-choice').classList.toggle('hidden', !state.account || !(profileHeld(state.profileCounts['sepolia-v6']) && profileHeld(state.profileCounts['sepolia-v9'])));
    $('profile-choice').textContent = `v6: ${profileCountLabel(state.profileCounts['sepolia-v6'])}. v9: ${profileCountLabel(state.profileCounts['sepolia-v9'])}. Choose either profile in the selector.`;
  }

  async function switchProfile(profileKey, { preserveWallet = false } = {}) {
    if(getProfile(profileKey).key!==state.profileKey)pendingSwitchNotice();
    $('fee-rose').classList.add('hidden');
    $('claim-update').classList.add('hidden');
    // The signer belongs to the wallet store, never to a deployment profile.

    // Navigation ALWAYS wins, including while a simulation or wallet prompt is pending.
    loadController.abort();
    generation++;verifiedForGeneration=null;
    loadController = new AbortController();
    dialog.close();
    closeSheet();
    closeWalletMenu();
    state.profileKey = getProfile(profileKey).key;
    poller.start();
    state.adapter = null;
    if(!watching())state.inspected=state.account;
    state.net = state.status = state.plan = null;
    state.lastReadFailure=null;

    state.receipts = [];
    wheelGoodAt=0;clearWheelFeed();
    state.art.clear();
    state.artifactsLoaded = false;
    el.art.grid.replaceChildren();
    el.art.status.textContent = "";
    el.holder.tbody.replaceChildren();
    el.holder.head.replaceChildren();
    el.holder.mergeList.replaceChildren();
    for (const node of [el.cp.out, el.holder.claimOut, el.agent.out]) {
      node.textContent = "";
      node.classList.add("hidden");
    }
    for (const node of [el.holder.count, el.holder.power, el.holder.share, el.holder.claimable]) node.textContent = UNKNOWN;
    el.holder.mergeNote.textContent = "";
    for (const id of ["claim-ids", "merge-survivor", "merge-donor", "watch-input", "art-token", "tool-args", "modal-input", "v9-ids", "v9-token", "v9-survivor", "v9-donor", "v9-amount"]) $(id).value = "";
    el.modal.body.replaceChildren();
    el.modal.title.textContent = "";

    networkPanel.setBusy(false);
    store.set("squeekchain:profile", state.profileKey);
    renderWalletChip();
    renderProfileOptions();
    renderNetworkPlaceholder();
    renderHolder(null);
    hideBanner();
    renderDeploymentVisibility();
    state.adapter = buildAdapter(state.profileKey);
    renderToolOptions();
    void refreshTelemetry();
    if (!state.adapter) {
      if (state.busy) showBanner("A prior wallet request may still complete; check that wallet before retrying.", "warn");
      return;
    }
    await refreshAll();
  }

  function renderDeploymentVisibility() {
    const deployed = Boolean(getProfile(state.profileKey).addresses);
    $("deployment-content").classList.toggle("hidden", !deployed);
    $("not-deployed").classList.toggle("hidden", deployed);
    $("not-deployed-note").textContent = deployed ? "" : getProfile(state.profileKey).notes;
    el.refresh.classList.toggle("hidden", !deployed);
    el.verified.classList.remove('hidden');
    selectTab(currentRoute());
  }

  const capabilities = () => ({...getProfile(state.profileKey).capabilities,reasons:ACTION_REASONS});

  function renderNetworkPlaceholder() {
    const profile = getProfile(state.profileKey);
    $("holder-rewards-notice").textContent = ""; $("holder-rewards-notice").classList.add("hidden");
    $("settlement-status").textContent = "";
    el.net.settlement.textContent = "";
    el.net.settlement.classList.add("hidden");
    for (const key of ["round", "blocks", "lag", "issued", "squeeks", "paused"]) el.net[key].textContent = UNKNOWN;
    el.net.paused.parentElement.className = "stat";
    el.cp.button.disabled = true;
    el.cp.reason.textContent = profile.addresses ? "Waiting for verified chain state." : "Unavailable until a mainnet deployment is published and verified.";
    el.verified.textContent = profile.addresses ? "Checking…" : "Not deployed";
    el.verified.className = "sr-only";
    $('profile-status').title=el.verified.title='';
    $('net-issued-label').textContent='SQK issued';

    $("profile-status").className = "chip";
    $("profile-status").textContent = profile.addresses ? "Checking…" : "Not deployed";
    renderTrust(null);
    renderPolicy(null);
    renderContracts(profile);
    renderCapabilities(profile);
    el.net.chain.textContent = profile.chainId === CHAIN.id ? "Sepolia" : "Ethereum";
    el.net.kind.textContent = profile.kind;
    el.net.release.textContent = profile.addresses?`${profile.short.toUpperCase()} · Sepolia`:"Not deployed";
    el.net.notice.textContent = profile.addresses?"Test network. Use test funds only.":"Not deployed on Ethereum.";
    el.net.notice.className = `notice ${profile.addresses ? "" : "warn"}`;
  }

  function renderCapabilities(profile) {
    $('capability-profile').textContent = profile.label;
    const cards = [['Claim', 'claim'], ['Merge', 'merge'], ['Checkpoint', 'checkpoint'], ['Art', 'art'], ['Staking', 'deposit']];
    $('capability-grid').replaceChildren(...cards.map(([title, cap]) => {
      const row = doc.createElement('div'); row.className = 'capability';
      const heading = doc.createElement('h3'); heading.textContent = title;
      const badge = doc.createElement('span'); badge.className = `chip ${cap && profile.capabilities[cap] ? 'ok' : 'warn'}`;
      badge.textContent = !profile.addresses ? 'Not deployed' : cap && profile.capabilities[cap] ? 'Supported' : capabilities().reasons.unavailable;
      row.append(heading, badge); return row;
    }));
  }

  function renderContracts(profile) {
    $('contracts-release').textContent = profile.addresses?`${profile.short.toUpperCase()} contracts`:'Not deployed';
    $('contracts-list').replaceChildren(...Object.entries(profile.addresses ?? {}).map(([name, address]) => {
      const row = doc.createElement('li'), link = doc.createElement('a');
      link.textContent = `${name}: ${address}`; link.href = `${EXPLORER}/address/${address}`;
      link.target = '_blank'; link.rel = 'noopener noreferrer'; row.append(link); return row;
    }));
  }

  let lastVerificationTime = null;
  function updateTrustAge() {
    $('trust-time').textContent=lastVerificationTime==null?UNKNOWN:new Date(lastVerificationTime).toISOString();
  }
  function renderTrust(v) {
    lastVerificationTime=v?Date.now():null;
    $('trust-block').textContent=valueText(v?.blockNumber ?? state.net?.snapshot?.blockNumber);
    $('trust-result').textContent=v ? v.ok && v.trusted ? 'Verified' : capabilities().reasons.mismatch : UNKNOWN;
    updateTrustAge();
    $('trust-checklist').dataset.state=v ? v.ok && v.trusted ? 'verified' : 'stopped' : 'unknown';
    doc.querySelectorAll('[data-trust-check]').forEach(node=>{node.textContent=v ? v.ok && v.trusted ? 'Checked' : 'Stopped' : UNKNOWN;});
    $('core-pause-note').classList.toggle('hidden',state.net?.core?.paused!==true);
    $('info-reward-status').textContent=el.net.settlement.textContent || (state.net?.core?.paused===true?capabilities().reasons.paused:state.net?.core?.settledThroughRound != null ? `Settled through round ${state.net.core.settledThroughRound}.` : UNKNOWN);
    const peers = [...(store.get('wheelhouse:rpc')?['Custom RPC']:[]),...PUBLIC_RPC_ENDPOINTS.map(peer=>new URL(peer.url).hostname)];
    const checked=state.net?.snapshot?.peers??[];
    $('trust-rpcs').replaceChildren(...(getProfile(state.profileKey).addresses?peers:[]).map(label=>{
      const item=doc.createElement('li');item.textContent=`${label} · ${checked.some(peer=>peer.label===label&&peer.state==='agreed')?'Agreed':'Not sampled'}`;return item;
    }));
  }
  function renderPolicy(policy) {
    const levels=policy?.levels;
    $('policy-levels').replaceChildren(...(levels?.length?levels:[null]).map(level=>{
      const row=doc.createElement('tr');
      for(const value of level?[level.level,level.weight??level.basePower,level.cooldownBlocks]:[null,null,null]) {const cell=doc.createElement('td');cell.textContent=valueText(value);row.append(cell);}return row;
    }));
  }

  let wheelGoodAt=0;const errorIsTransient=error=>error.name!=='RpcTrustError'&&(!error.kind||error.kind==='transport');
  async function refreshTelemetry({ reset = true } = {}) {
    const load = captureLoad();
    const enabled = state.profileKey === "sepolia-v9";
    if (reset || !enabled) {
      for (const id of ["wheel-rpm", "wheel-speed", "wheel-distance"]) $(id).textContent = UNKNOWN;
      $("wheel-state").textContent = enabled ? "Loading" : "Unavailable";
      $("wheel-note").textContent = enabled ? "Reading official device telemetry…" : "Device telemetry belongs to the live Sepolia deployment only.";
    }
    if (!enabled) return;
    try {
      const api=displayApi(load);const result=await viewAwait(load,()=>api?api.status():telemetry.read({signal:load.signal}));const data=api?result.data:result;const view=telemetryView(data);
      if (!isCurrent(load)) return;
      $("wheel-state").textContent = view.state;
      $("wheel-rpm").textContent = view.rpm;
      $("wheel-speed").textContent = view.speed;
      $("wheel-distance").textContent = view.distance;
      $("wheel-note").textContent = view.note;wheelGoodAt=result.at??Date.now();
    } catch (err) {
      if (!isCurrent(load)) return;
      if(errorIsTransient(err)&&wheelGoodAt&&Date.now()-wheelGoodAt<DISPLAY_TTL){$("wheel-note").textContent=`as of ${Math.max(1,Math.floor((Date.now()-wheelGoodAt)/60000))} min`;return;}
      for (const id of ["wheel-rpm", "wheel-speed", "wheel-distance"]) $(id).textContent = UNKNOWN;
      $("wheel-state").textContent = "Unknown";
      $("wheel-note").textContent = `${err.message} No live reading to display.`;
    }
  }

  // ── wallet ────────────────────────────────────────────────────────────────
  async function ensureChain(p, profileKey = state.profileKey) {
    const profile = getProfile(profileKey);
    const current = await p.request({ method: "eth_chainId" });
    if (String(current).toLowerCase() === profile.hexChainId) return;
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: profile.hexChainId }] });
    } catch (err) {
      if (err?.code === 4902 || /Unrecognized chain/i.test(err?.message ?? "")) {
        await p.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: profile.hexChainId,
              chainName: profile.chainId === CHAIN.id ? "Sepolia" : "Ethereum",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: CHAIN.rpcUrls,
              blockExplorerUrls: [EXPLORER],
            },
          ],
        });
      } else throw err;
    }
  }

  function watching(){return Boolean(state.inspected&&state.inspected.toLowerCase()!==state.account?.toLowerCase());}
  let walletWork=Promise.resolve();
  async function connect(){
    if(!getProfile(state.profileKey).addresses){showBanner('Mainnet is not deployed. Select Sepolia to connect and inspect.','warn');return null;}
    try{await wallet.connect();await walletWork;selectTab('squeeks');return state.account;}catch(error){showBanner(errorMessage(error),'bad');return null;}
  }
  async function loadWalletSession(){
    const load=captureLoad(),account=state.account;
    if(!account||!state.adapter||state.chainId!==11155111)return;
    try{
      const counts=await viewAwait(load,()=>profileBalanceReader?profileBalanceReader(account):profileBalances(account,{rpcUrl:store.get('wheelhouse:rpc')||undefined,provider,chainCache,discoveryCache,signal:load.signal}));
      assertCurrent(load);state.profileCounts=counts;renderProfileOptions();
      const chosen=chooseProfile(state.profileKey,counts);
      if(chosen!==state.profileKey){await switchProfile(chosen,{preserveWallet:true});return;}
    }catch(error){if(!isCurrent(load))return;state.profileCounts={};renderProfileOptions();}
    await refreshAll();
  }
  function onWallet(next,previous,reason){
    if(destroyed)return;
    renderWalletChip();
    const changed=next.account?.toLowerCase()!==previous.account?.toLowerCase()||next.chainId!==previous.chainId||next.providerInfo?.rdns!==previous.providerInfo?.rdns;
    if(!changed||(!next.account&&!previous.account&&next.chainId===previous.chainId))return;
    const wasWatch=state.inspected&&state.inspected.toLowerCase()!==previous.account?.toLowerCase();
    resetLoad();chainCache.clear();dialog.close();state.lastReadFailure=null;closeWalletMenu();state.profileCounts={};
    if(previous.account&&next.account?.toLowerCase()!==previous.account.toLowerCase())pendingSwitchNotice();
    if(!wasWatch)state.inspected=next.account;
    renderHolder(null);renderProfileOptions();renderCheckpointGate();renderActivity(activity.list());
    if(next.status==='wrong-chain'){showBanner('Wrong chain: Sepolia required. Actions stopped.','warn');return;}
    clearReadBanner();
    if(next.account){hideBanner();walletWork=loadWalletSession();}
    else if(wasWatch)walletWork=refreshWallet();
  }
  let finishWalletPick;
  function pickWallet(entries){
    return new Promise(resolve=>{openSheet('wallet-picker');finishWalletPick=resolve;const root=$('wallet-provider-options');root.replaceChildren(...entries.map(entry=>{const button=doc.createElement('button');button.className='btn';button.textContent=entry.info.name;button.dataset.rdns=entry.info.rdns;button.onclick=()=>{finishWalletPick=null;closeSheet();resolve(entry);};return button;}));});
  }
  function renderWalletChip() {
    const deployed = Boolean(getProfile(state.profileKey).addresses);
    const hasMenu = state.account || Number(el.connect.dataset.activityCount) > 0 || !deployed;
    el.connect.textContent = wallet.get().status==='connecting'?'Connecting…':state.account ? `${short(state.account)} ▾` : hasMenu ? 'Activity ▾' : 'Connect wallet';
    el.connect.setAttribute('aria-label', hasMenu ? 'Wallet menu' : 'Connect wallet');
    $('btn-menu-connect').classList.toggle('hidden', Boolean(state.account) || !deployed);
    $('btn-copy-address').classList.toggle('hidden', !state.account);
    $('btn-disconnect').classList.toggle('hidden', !state.account);
    el.connect.setAttribute('aria-expanded', String(!$('wallet-menu').classList.contains('hidden')));
    el.walletEth.classList.toggle('hidden',!state.account||state.walletEth==null);
    el.walletEth.textContent=state.account?`ETH balance: ${state.walletEth??UNKNOWN}${state.walletEth==null?'':' ETH'}`:'';
  }

  let signingTicket;
  function releaseSigning(ticket){if(signingTicket!==ticket)return;signingTicket=null;state.busy=false;$('wallet-wait').classList.add('hidden');if(state.net)renderNetwork(state.net);renderHolder(state.status,state.plan);}
  $('wallet-cancel').onclick=()=>{const ticket=signingTicket;if(!ticket)return;ticket.cancelled=true;if(state.walletPromptPending)ticket.notice=toast('Wallet prompt may still be open. Close or reject it in your wallet before starting another transaction.','warn',{timeout:0});ticket.reject(Object.assign(new Error('Wallet request cancelled in this app'),{walletOutcome:true}));releaseSigning(ticket);};
  async function followLateHash(hash,profileKey,owner){
    try{await activity.wait(hash);if(!destroyed&&state.profileKey===profileKey&&state.account?.toLowerCase()===owner.toLowerCase())await refreshAll({force:true});}
    catch(error){if(!destroyed)toast('Receipt outcome unclear. Saved in Activity; check your wallet before retrying.','warn',{action:'View',onAction:()=>openSheet('activity-drawer')});}
  }
  async function sendTransaction(tx, label, owner = state.account, load = captureLoad()) {
    assertCurrent(load);
    const p = provider();
    if (!p || !state.account) throw new Error("connect a wallet to sign");
    if(state.busy||state.walletPromptPending)throw Object.assign(new Error('A wallet request is still outstanding. Close or reject it in your wallet before starting another transaction.'),{walletOutcome:true});
    const ticket={cancelled:false,rpcPending:false};signingTicket=ticket;outstandingPrompts.set(p,ticket);const cancelled=new Promise((_,reject)=>ticket.reject=reject);cancelled.catch(()=>{});
    state.busy = true;$('wallet-wait').classList.remove('hidden');
    let hash;
    try {
      if (state.net) renderNetwork(state.net);
      if(state.chainId!=null&&state.chainId!==11155111)throw new Error('Wrong chain: Sepolia required. Start again.');
      await ensureChain(p, load.profileKey);
      assertCurrent(load);
      const accounts = await p.request({ method: "eth_accounts" });
      assertCurrent(load);
      if (!owner || state.account?.toLowerCase() !== owner.toLowerCase() || accounts?.[0]?.toLowerCase() !== owner.toLowerCase()) throw new Error("Wallet changed; start again");
      // A profile switch cannot cancel this wallet popup or an already-broadcast transaction.
      if(ticket.cancelled)throw Object.assign(new Error('Wallet request cancelled'),{walletOutcome:true});
      ticket.rpcPending=true;
      const response=Promise.resolve().then(()=>p.request({method:'eth_sendTransaction',params:[{from:owner,to:tx.to,data:tx.data,value:`0x${BigInt(tx.value??0).toString(16)}` }]})).then(result=>{
        activity.record(result,label,CHAIN.id,load.profileKey);void activity.refresh();
        if(ticket.cancelled||!isCurrent(load))void followLateHash(result,load.profileKey,owner);
        return result;
      }).finally(()=>{if(outstandingPrompts.get(p)===ticket)outstandingPrompts.delete(p);ticket.notice?.remove();if(!destroyed){renderCheckpointGate();renderHolder(state.status,state.plan);}});
      hash=await Promise.race([response,cancelled]);
    } catch(error){if(error?.code===4001||/reject|closed|cancel/i.test(error?.message??''))error.walletOutcome=true;throw error;} finally { if(!ticket.rpcPending&&outstandingPrompts.get(p)===ticket){outstandingPrompts.delete(p);ticket.notice?.remove();}releaseSigning(ticket); }

    assertCurrent(load);

    const receipt = await viewAwait(load, () => activity.wait(hash));
    const ok = receipt.receiptStatus === "success";
    if (!ok) throw new Error(`${label} reverted. Stopped; no changed-input retry.`);
    const result = { hash, ok, blockNumber: receipt.blockNumber, status: receipt.status };
    state.receipts.push(result);

    return result;
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  const observedRounds = new Map();
  function renderCheckpointGate() {
    const unknownHoldings=Boolean(state.inspected) && (state.status?.owner?.toLowerCase()!==state.inspected.toLowerCase() || num(state.status?.totals?.count)===UNKNOWN);
    el.cp.button.disabled=state.busy || state.walletPromptPending || (!adapterFactory&&state.chainId!=null&&state.chainId!==11155111) || (adapterFactory&&unknownHoldings) || !(capabilities().checkpoint && state.net?.checkpoint?.canCheckpoint===true);
  }
  function renderNetwork(net) {
    const previous = observedRounds.get(state.profileKey);
    const round = net.core?.settledThroughRound;
    if (/^\d+$/.test(String(round))) observedRounds.set(state.profileKey, BigInt(round));
    state.net = net;
    const core=net.core??{},mining=net.mining??{},checkpoint=net.checkpoint??{};
    setStat(el.net.round,core.settledThroughRound);
    const hasRound=/^\d+$/.test(String(round));
    const advancement=hasRound&&previous!=null&&BigInt(round)>previous&&core.paused!==true?' Mining live: rounds advanced.':'';
    const stalled=settlementStatus(net).stalled===true;
    const notice=stalled?`Rewards paused: settlement stopped at round ${round}.`:'';
    for (const node of [el.net.settlement,$('holder-rewards-notice')]) { node.textContent=notice; node.classList.toggle('hidden',!stalled); }
    $('settlement-status').textContent=advancement.trim();
    setStat(el.net.blocks, core.blockHeight, num);
    setStat(el.net.lag, mining.lagRounds, value => num(value) === UNKNOWN ? UNKNOWN : `${num(value)} ${BigInt(value)===1n?'round':'rounds'}`);
    const v9=getProfile(state.profileKey).abiSet==='v9';
    setStat(el.net.issued,v9?mining.issued:mining.minted,sqk);
    $('net-issued-label').textContent='SQK issued';
    setStat(el.net.squeeks, net.nft?.totalSupply, num);
    setStat(el.net.paused, core.paused, value => value === true ? 'yes' : value === false ? 'no' : UNKNOWN);
    el.net.paused.parentElement.className = `stat ${core.paused === true ? 'bad' : core.paused === false ? 'ok' : ''}`;

    const caps = capabilities();
    renderCheckpointGate();
    el.cp.reason.textContent = caps.checkpoint
      ? checkpoint.canCheckpoint
        ? `next round ${valueText(checkpoint.nextRound)} is settled — a checkpoint will fund it`
        : checkpoint.reason ?? UNKNOWN
      : caps.reasons.unavailable;
    renderPolicy(net.policy);
    el.cp.explain.textContent = "Turns settled rounds into issued SQK. Holders cannot claim until someone checkpoints, so this is the job a wallet without Squeeks can do.";
  }

  function renderWalletChipStats(status) {
    if (!status || !state.account || status.owner?.toLowerCase() !== state.account.toLowerCase()) return;
    wallet.acceptBalance(status.owner,state.chainId,status.ethBalance?.eth);
    el.walletEth.classList.toggle('hidden',!state.account||state.walletEth==null);
    el.walletEth.textContent=`ETH balance: ${state.walletEth??UNKNOWN}${state.walletEth==null?'':' ETH'}`;
  }

  function columnsForProfile() {
    const isV9 = getProfile(state.profileKey).abiSet === "v9";
    return isV9
      ? [
          { key: "tokenId", label: "token" },
          { key: "level", label: "level" },
          { key: "nextMergeHeight", label: "next merge" , num: true },
          { key: "deposited", label: "deposited" },
          { key: "art", label: "art" },
        ]
      : [
          { key: "tokenId", label: "token" },
          { key: "level", label: "level" },
          { key: "activeWeight", label: "power", num: true },
          { key: "pendingRound", label: "pending" },
          { key: "nextMergeBlock", label: "merge @", num: true },
          { key: "claimable", label: "claimable SQK", num: true },
          { key: "art", label: "art" },
        ];
  }

  function renderWatchMode() {
    const viewing=Boolean(state.inspected && state.inspected.toLowerCase()!==state.account?.toLowerCase());
    $('watch-mode').classList.toggle('hidden',!viewing);
    $('watch-chip').textContent=viewing?`Viewing ${short(state.inspected)}`:'';
    $('watch-chip').title=viewing?state.inspected:'';
    el.holder.watchRow.classList.remove('hidden');
  }
  function renderHolder(status, plan = null) {
    renderWatchMode();
    state.status = status;
    state.plan = plan;
    renderCheckpointGate();
    const caps = capabilities();
    const isV9 = getProfile(state.profileKey).abiSet === 'v9';
    el.holder.power.parentElement.querySelector('.label').textContent = isV9 ? 'Deposited' : 'Power';
    const inspected=status?.owner??state.inspected??state.account;
    el.holder.owner.textContent=inspected?short(inspected):'';el.holder.owner.title=inspected??'';el.holder.owner.classList.toggle('hidden',!inspected);
    el.holder.refresh.disabled=!state.adapter||!inspected;
    el.holder.empty.classList.toggle("hidden", Boolean(status));
    el.holder.body.classList.toggle("hidden", !status);
    if (!status) {
      holdings.render(null);
      for (const node of [el.holder.count, el.holder.power, el.holder.share, el.holder.claimable]) setStat(node, null);
      el.holder.tbody.replaceChildren(); el.holder.head.replaceChildren(); el.holder.mergeList.replaceChildren();
      el.holder.claim.disabled = true; $("btn-custom-merge").disabled = true;$("v9-review").disabled=true; $("v9-actions").classList.add("hidden"); return;
    }
    const totals = status.totals ?? {};

    const has = num(totals.count) !== UNKNOWN && Number(totals.count) > 0;
    const signerOwns = Boolean((state.chainId==null||state.chainId===11155111) && state.account && status.owner?.toLowerCase() === state.account.toLowerCase());
    setStat(el.holder.count, totals.count, num);
    setStat(el.holder.power, isV9 ? totals.deposited : totals.power, num);
    setStat(el.holder.share, totals.sharePercent, value => num(value, 4) === UNKNOWN ? UNKNOWN : `${num(value, 4)}%`);
    setStat(el.holder.claimable, totals.claimable, sqk);
    el.holder.claim.disabled = state.busy || state.walletPromptPending || num(totals.count) === UNKNOWN || (!has && !isV9) || !signerOwns || !caps.claim;
    $("btn-custom-merge").disabled = state.busy || state.walletPromptPending || !has || !signerOwns || !caps.merge;
    $("claim-ids").disabled = !caps.claim || isV9;
    $("claim-ids").classList.toggle("hidden", isV9);
    $("v9-actions").classList.toggle("hidden", !isV9);$("action-fields").classList.remove("hidden");
    $("v9-review").disabled = !signerOwns || state.busy || state.walletPromptPending;


    holdings.render(status);
    if(!isV9&&$('v9-action').value!=='merge'){$('v9-action').value='merge';renderActionFields();}
    else if(isV9&&$('v9-action').value==='merge'){$('v9-action').value='deposit';renderActionFields();}
    updatePreviewGate();

    // merge plan
    el.holder.mergeList.replaceChildren();
    el.holder.mergeNote.textContent = !caps.merge
      ? caps.reasons.unavailable
      : "Merge permanently burns one Squeek and raises the one you keep by one level.";
    for (const pair of plan?.pairs ?? []) {
      const li = doc.createElement("li");
      const text = doc.createElement("span");
      text.textContent = `keep #${pair.survivor} · burn #${pair.donor} · L${pair.level}→L${pair.nextLevel}${pair.deposited?" · Deposited":""}${pair.powerBefore==null?"":` · power ${pair.powerBefore}→${pair.powerAfter} (+${pair.powerGainPercent}%)`}`;
      if (signerOwns && caps.merge) {
        const button = doc.createElement("button");
        button.className = "btn btn-danger";
        button.textContent = "Merge";
        button.onclick = () => viewTask(() => requestMerge(pair));
        li.append(text, button);
      } else {
        const note = doc.createElement("span");
        note.className = "label";
        note.textContent = signerOwns ? "owner actions off" : "connect owner";
        li.append(text, note);
      }
      el.holder.mergeList.appendChild(li);
    }
  }

  // ── refresh ───────────────────────────────────────────────────────────────
  function renderVerification(v) {
      verifiedForGeneration=v;state.lastReadFailure=null;
      renderTrust(v);
      el.verified.textContent = v.ok && v.trusted ? "Verified" : "Stopped";
      el.verified.className = "sr-only"; $("profile-status").className = `chip ${v.ok && v.trusted ? "ok" : "bad"}`;
      $("profile-status").textContent = v.ok && v.trusted ? "Verified" : "Mismatch: stop";
      el.verified.title = v.ok && v.trusted ? `Network and contract checks passed at block ${v.fullVerificationBlockNumber ?? v.blockNumber ?? "unknown"}; latest check at block ${v.blockNumber ?? "unknown"}. Two independent connections agree.` : "Network or contract checks did not match. Actions are stopped.";
      $("profile-status").title = el.verified.title;
  }

  async function refreshNetwork(options={}) {
    if (!state.adapter) return null;
    const load = captureLoad();
    try {
      networkPanel.setBusy(true);
      const net = await displayRead(load,"network",null,options);
      const v = net.source?null:net.verification ?? await readFor(load,"verify");
      if (!isCurrent(load)) return null;
      renderNetwork(net);
      if(net.source){displayVerification(net);displayStamp(net);}else renderVerification(v);
      clearReadBanner();
      return net;
    } catch (err) {
      if (!isCurrent(load)) return null;
      state.net = null;
      renderNetworkPlaceholder();
      showReadFailure(err,'Network read');
      return null;
    } finally {
      if (isCurrent(load)){networkPanel.setBusy(false);renderCheckpointGate();}
    }
  }

  async function refreshWallet(options={}) {
    const owner = state.inspected ?? state.account;
    if (!state.adapter || !owner) {
      renderHolder(null);
      return null;
    }
    const load = captureLoad();
    try {
      const status = options.prefetched??await displayRead(load,"wallet",owner,options);
      if (!isCurrent(load) || owner.toLowerCase() !== (state.inspected ?? state.account)?.toLowerCase()) return null;
      renderWalletChipStats(status);
      let plan = status.mergePlan ?? null;
      if (!plan && capabilities().merge && status.totals?.count > 1 && state.adapter.mergePlan) {
        plan = await readFor(load, "mergePlan", owner, { status });
      }
      if (!isCurrent(load) || owner.toLowerCase() !== (state.inspected ?? state.account)?.toLowerCase()) return null;
      renderHolder(status, plan);
      if(status.net&&(status.verification||status.source)){renderNetwork({...status.net,snapshot:status.snapshot??status.net.snapshot});if(status.source){displayVerification(status);displayStamp(status);}else renderVerification(status.verification);}
      clearReadBanner();
      return status;
    } catch (err) {
      if (!isCurrent(load) || owner.toLowerCase() !== (state.inspected ?? state.account)?.toLowerCase()) return null;
      renderHolder(null);
  renderWalletChip();if(err.name==='RpcTrustError'){state.net=null;renderNetworkPlaceholder();}
      showReadFailure(err,'Wallet read');
      return null;
    }
  }

  let refreshFlight;
  function refreshAll(options={}) {
    if(refreshFlight?.generation===generation)return refreshFlight.promise;
    const load=captureLoad(),flight={generation};
    flight.promise=(async()=>{
      if(state.adapter&&(state.inspected??state.account)) {
        const status=await refreshWallet(options);
        // A failed wallet snapshot is already diagnosed. Do not immediately
        // enqueue another failing network snapshot against the same endpoints.
        if(isCurrent(load)&&status&&!status.net)await refreshNetwork(options);
      }else await refreshNetwork(options);
    })().finally(()=>{if(refreshFlight===flight)refreshFlight=null;});
    refreshFlight=flight;return flight.promise;
  }

  const viewTask = async fn => {
    const load = captureLoad();
    try { return await viewAwait(load, fn); }
    catch (err) {
      if(err.walletOutcome)return {ok:false,reason:err.message};
      if (!isCurrent(load) || err?.name === "AbortError") return { ok: false, reason: "profile-changed" };
      toast(errorMessage(err), "err");
      showBanner(errorMessage(err), "bad");
      return null;
    }
  };

  // ── actions ───────────────────────────────────────────────────────────────
  async function requestCheckpoint() {
    const load = captureLoad(), owner = state.account;
    const caps = capabilities();
    if (!caps.checkpoint) throw new Error(capabilities().reasons.unavailable);
    const preview = await readFor(load, "checkpointPreview", owner ?? undefined);
    showOut(el.cp.out, preview);
    if (!preview.ok) {
      toast(preview.reason ?? "checkpoint unavailable", "err");
      return { ok: false, reason: preview.reason };
    }
    if (!state.account) {
      showBanner("Simulation succeeded — connect a wallet to submit the checkpoint.");
      return { ok: false, reason: "no wallet" };
    }
    const result = await sendTransaction(preview.tx, "Checkpoint", owner, load);
    await displayApi(load)?.invalidateArt(state.status?.squeeks?.map(t=>t.tokenId)??[]);state.art.clear();await refreshAll({force:true});
    return { ok: true, ...result, gas: preview.gas };
  }

  const recipientOf=(preview,owner)=>String(preview.recipient??owner).toLowerCase();
  const recipientDetails=(preview,owner)=>preview.recipient?[['Recipient',preview.recipient,{warning:recipientOf(preview,owner)!==owner.toLowerCase()}]]:[];
  function showClaimIncrease(before,after) {
    $('claim-update').textContent=`Claim amount updated: ${after.sqk} SQK (reviewed ${before.sqk} SQK).`;
    $('claim-update').classList.remove('hidden');
  }
  async function requestClaim(tokenIds) {
    $('claim-update').classList.add('hidden');
    if(state.account&&state.chainId!==11155111)throw new Error('Wrong chain: Sepolia required');
    const load = captureLoad();
    const caps = capabilities();
    if (!caps.claim) throw new Error(capabilities().reasons.unavailable);
    const owner = state.inspected ?? state.account;
    const preview = await readFor(load, "claimPreview", owner, tokenIds);
    showOut(el.holder.claimOut, preview);
    if (!preview.ok) {
      toast(preview.batches?.[0]?.error ?? "claim simulation failed", "err");
      return { ok: false, ...preview };
    }
    if (!state.account || state.account.toLowerCase() !== owner.toLowerCase()) {
      showBanner("Simulation only: connect the wallet that owns these Squeeks to sign.");
      return { ok: false, reason: "not the owner wallet" };
    }
    const confirmed = await confirmModal({
      title: "Claim SQK",
      body: `Claim ${preview.total.sqk} SQK across ${preview.batches.length} transaction(s)? Simulated successfully; your wallet asks next.${recipientOf(preview,owner)!==owner.toLowerCase()?" Recipient differs from the owner. Verify the full address before signing.":""}`,
      details:recipientDetails(preview,owner),
      confirmLabel: "Sign claim",
    });
    if (!confirmed) return { ok: false, reason: "cancelled" };
    const receipts = [];
    assertCurrent(load);
    for (const batch of preview.batches) {
      if (!isCurrent(load) || state.account?.toLowerCase() !== owner.toLowerCase()) throw new Error("Wallet or profile changed. Stopped.");
      const fresh = await readFor(load, "claimPreview", owner, batch.tokenIds);
      const v9=getProfile(load.profileKey).abiSet==='v9';
      if (!fresh.ok || fresh.batches.length!==1 || (v9?BigInt(fresh.batches[0].amount.base)<BigInt(batch.amount.base):fresh.batches[0].amount.base!==batch.amount.base) || recipientOf(fresh,owner)!==recipientOf(preview,owner))throw new Error('Claim outcome changed. Review a fresh preview; no automatic retry.');
      if(v9&&BigInt(fresh.batches[0].amount.base)>BigInt(batch.amount.base)){showClaimIncrease(batch.amount,fresh.batches[0].amount);showOut(el.holder.claimOut,fresh);}
      receipts.push(await sendTransaction(fresh.batches[0].tx, 'Claim SQK', owner, load));
    }
    await displayApi(load)?.invalidateArt(state.status?.squeeks?.map(t=>t.tokenId)??[]);state.art.clear();await refreshAll({force:true});
    return { ok: true, total: preview.total, receipts };
  }

  async function requestMerge(pair) {
    if (!capabilities().merge) throw new Error(capabilities().reasons.unavailable);
    const owner = state.account ?? state.inspected;
    const load = captureLoad();
    if(!adapterFactory){const fresh=await load.adapter.walletStatus(owner);assertCurrent(load);const find=id=>{const token=fresh.squeeks.find(t=>String(t.tokenId)===String(BigInt(id)));if(!token)throw new Error('Token not in fresh on-chain inventory');return token;};const a=find(pair.survivor),b=find(pair.donor);pair={survivor:a.tokenId,donor:b.tokenId,nextLevel:a.level+1,deposited:a.deposited};}
    const confirm = `BURN-${BigInt(pair.donor)}`;
    const confirmed = await confirmModal({
      title: `Keep #${pair.survivor} · burn #${pair.donor}`,
      body: `#${pair.donor} is BURNED permanently and cannot be restored. #${pair.survivor} survives. Type ${confirm} before we build or simulate this call. You will review the simulation before your wallet opens.`,
      requireText: confirm,
      confirmLabel: "Acknowledge burn & simulate",
    });
    if (!confirmed) return { ok: false, reason: "cancelled" };
    if (!isCurrent(load) || owner?.toLowerCase() !== (state.account ?? state.inspected)?.toLowerCase()) throw new Error("Wallet or profile changed. Start again.");
    const preview = await readFor(load, "mergePreview", owner, pair.survivor, pair.donor, { confirm });
    if (!preview.ok) return preview;
    const sign = await confirmModal({ title: "Review simulated merge", body: `${preview.warning}. Result: level ${preview.nextLevel}. Simulated gas ≈ ${preview.gas}. Keep #${pair.survivor}; permanently burn #${pair.donor}.`, confirmLabel: "Review in wallet" });
    if (!sign) return { ok: false, reason: "cancelled" };
    if (!isCurrent(load) || owner?.toLowerCase() !== state.account?.toLowerCase()) throw new Error("Connect the owner wallet and start again.");
    // Fresh verification, ownership, eligibility and simulation after human review.
    const fresh = await readFor(load, "mergePreview", owner, pair.survivor, pair.donor, { confirm });
    if (!fresh.ok) return fresh;
    if(fresh.nextLevel!==preview.nextLevel)throw new Error("Outcome changed. Review a fresh preview.");
    const result = await sendTransaction(fresh.tx, `Merge #${pair.survivor} and #${pair.donor}`, owner, load);
    await displayApi(load)?.invalidateArt(state.status?.squeeks?.map(t=>t.tokenId)??[]);state.art.clear();await refreshAll({force:true});
    return { ok: true, ...result };
  }

  async function showFeeRose(action,input,load,reason='Fee rose') {
    assertCurrent(load);
    const quote=await readFor(load,'actionPreview',state.account,action,{amount:input.amount});
    assertCurrent(load);
    $('v9-result').classList.add('hidden');
    $('quote-reason').textContent=reason;
    const fee=quote.fee?.sqk;
    $('fee-quote').textContent=fee==null?'New quote unavailable. Re-quote before continuing.':`New quote: ${fee} SQK fee${quote.net?.sqk!=null?` · ${quote.net.sqk} SQK received`:''}.`;
    $('fee-rose').classList.remove('hidden');
    const {maxFee,deadline,...newInput}=input;
    $('fee-requote').onclick=()=>viewTask(()=>{assertCurrent(load);return requestAction(action,newInput);});
    $('fee-requote').focus();
    showBanner(reason,'warn');
    return {ok:false,reasonCode:reason==='Quote expired'?'quoteExpired':'feeRose',reason,quote};
  }
  async function requestAction(action,input={}) {
    $('fee-rose').classList.add('hidden');
    $('claim-update').classList.add('hidden');
    const load=captureLoad();
    try{return await requestActionInner(action,input);}
    catch(error){const quoteError=action==='unstake'?unstakeQuoteError(error):null;if(quoteError)return showFeeRose(action,input,load,quoteError.reason);throw error;}
  }
  async function requestActionInner(action, input = {}) {
    if (!capabilities().deposit) throw new Error(capabilities().reasons.unavailable);
    const load = captureLoad(), owner = state.account;
    if (!owner || owner.toLowerCase() !== state.inspected?.toLowerCase()) throw new Error('Connect the inspected owner wallet');
    if(action==='mergeDeposited'&&!adapterFactory){const fresh=await load.adapter.walletStatus(owner);assertCurrent(load);const canonical=id=>{const token=fresh.squeeks.find(t=>String(t.tokenId)===String(BigInt(id)));if(!token)throw new Error('Token not in fresh on-chain inventory');return token.tokenId;};input={...input,survivor:canonical(input.survivor),donor:canonical(input.donor)};}
    if (action === 'mergeDeposited') {
      const burn = `BURN-${BigInt(input.donor)}`;
      if (!await confirmModal({ title: `Keep #${input.survivor} · burn #${input.donor}`, body: `Keep #${input.survivor} · burn #${input.donor}. #${input.donor} is BURNED permanently and cannot be restored. #${input.survivor} survives. Type ${burn} before we build or simulate this call. You will review the simulation before your wallet opens.`, requireText: burn, confirmLabel: 'Acknowledge burn & simulate' })) return {ok:false,reason:'cancelled'};
      input = {...input,confirm:burn};
    }
    const preview = await readFor(load,'actionPreview',owner,action,input);
    showOut($('v9-result'),preview);
    if (!preview.ok) {if(['feeRose','quoteExpired'].includes(preview.reasonCode))return showFeeRose(action,input,load,preview.reason); showBanner(preview.reason,'warn'); return preview; }
    const mergeLabel=action==='mergeDeposited'?`Keep #${input.survivor} · burn #${input.donor}`:null;
    const body=mergeLabel?`${mergeLabel}. #${input.donor} is BURNED permanently and cannot be restored. #${input.survivor} survives at level ${preview.nextLevel}.`:action==='unstake'?'The quoted exit fee is burned.':`${actionNames[action]??'Review action'}. ${preview.amount?.sqk?'Rewards: '+preview.amount.sqk+' SQK.':''}`;
    const amountText=preview.amount?.sqk!=null?`${preview.amount.sqk} SQK`:typeof preview.amount==='string'?`${formatEther(BigInt(preview.amount))} SQK`:null;
    const scopeText=preview.scope==='collection'?'ALL current and future Squeeks':preview.scope==='token'?`Only Squeek #${preview.tokenId??input.tokenId}`:preview.scope;
    const details=action==='unstake'?[['Amount',`${formatEther(BigInt(preview.amount))} SQK`],['Maximum fee',`${preview.fee.sqk} SQK`],['You receive',`${preview.net.sqk} SQK`],['Deadline',new Date(Number(preview.deadline)*1000).toLocaleString(undefined,{timeZoneName:'short'})],['Gas estimate',preview.gas]]:[['Spender',preview.spender],['Amount',amountText],['Scope',scopeText],['Squeeks',preview.tokenIds?.map(id=>`#${id}`).join(', ')],['Contract',preview.tx?.to],['Gas estimate',preview.gas],...recipientDetails(preview,owner)].filter(([,value])=>value!=null);
    if (!await confirmModal({title:mergeLabel??(action==='unstake'?'Review unstake fee':`Review ${actionNames[action]??'action'}`),body:body+(preview.warning?` ${preview.warning}`:''),details,confirmLabel:'Review in wallet'})) return {ok:false,reason:'cancelled'};
    assertCurrent(load);
    if (state.account?.toLowerCase() !== owner.toLowerCase()) throw new Error('Wallet changed');
    const fresh = await readFor(load,'actionPreview',owner,action,{...input,...(action==='unstake'?{maxFee:preview.maxFee,deadline:preview.deadline}:{})});
    if(action==='unstake'&&['feeRose','quoteExpired'].includes(fresh.reasonCode))return showFeeRose(action,input,load,fresh.reason);
    const terms=p=>JSON.stringify({spender:p.spender?.toLowerCase(),scope:p.scope,tokenId:p.tokenId,tokenIds:p.tokenIds,amount:typeof p.amount==='string'&&action!=='unstake'?p.amount:undefined,to:p.tx?.to?.toLowerCase()});
    if (!fresh.ok || terms(fresh)!==terms(preview) || (action==='mergeDeposited' && fresh.nextLevel!==preview.nextLevel) || (preview.amount?.base!=null && (action==='claimAndStake'?BigInt(fresh.amount?.base)<BigInt(preview.amount.base):fresh.amount?.base!==preview.amount.base)) || (action==='claimAndStake'&&recipientOf(fresh,owner)!==recipientOf(preview,owner)) || (action==='unstake' && (fresh.maxFee!==preview.maxFee || fresh.net.base!==preview.net.base))) throw new Error('Outcome or fee changed. Review a fresh preview; no automatic retry.');
    if(action==='claimAndStake'&&BigInt(fresh.amount.base)>BigInt(preview.amount.base)){showClaimIncrease(preview.amount,fresh.amount);showOut($('v9-result'),fresh);}
    const result=await sendTransaction(fresh.tx,actionNames[action]??'Action',owner,load);await displayApi(load)?.invalidateArt(state.status?.squeeks?.map(t=>t.tokenId)??[]);state.art.clear();await refreshAll({force:true});return result;
  }
  function updatePreviewGate(){
    const owner=state.status?.owner,signer=Boolean(!state.busy&&!state.walletPromptPending&&state.account&&owner?.toLowerCase()===state.account.toLowerCase()&&state.chainId===11155111&&state.status?.totals?.count!=null),action=$('v9-action').value;
    const rows=state.status?.squeeks??[],ids=$('v9-ids').value.split(/[\s,]+/).filter(Boolean),find=id=>rows.find(t=>String(t.tokenId)===id),validIds=ids.length>0&&new Set(ids).size===ids.length&&ids.every(id=>/^\d+$/.test(id)&&find(id));
    let valid=true;
    if(['deposit','withdraw'].includes(action))valid=validIds&&ids.every(id=>Boolean(find(id).deposited)===(action==='withdraw'));
    if(['merge','mergeDeposited'].includes(action)){const pair=ids.map(find);valid=validIds&&ids.length===2&&pair[0].level!=null&&pair[0].level===pair[1].level&&pair.every(t=>Boolean(t.deposited)===(action==='mergeDeposited'));}
    if(action==='approveNft')valid=Boolean(find($('v9-token').value)&&!find($('v9-token').value).deposited);
    if(['stake','unstake','approveSqk'].includes(action))valid=/^\d+(?:\.\d{1,18})?$/.test($('v9-amount').value)&&Number($('v9-amount').value)>0;
    $('v9-review').disabled=!signer||!valid;
  }
  function renderActionFields() {
    $('fee-rose').classList.add('hidden');
    const action=$('v9-action').value;
    const host=['claimAndStake','stake','unstake','approveSqk'].includes(action)?$('sqk-action-host'):$('nft-action-host');host.append($('action-fields'));
    for(const [id,visible] of [['v9-ids',['deposit','withdraw','merge','mergeDeposited'].includes(action)],['v9-token',action==='approveNft'],['v9-amount',['stake','unstake','approveSqk'].includes(action)],['v9-survivor',false],['v9-donor',false]]) {
      $(id).closest('label').classList.toggle('hidden',!visible); if(!visible)$(id).value='';
    }
    $('nft-action-label').textContent=action==='merge'?'Squeek IDs':`${actionNames[action]??'Squeek IDs'} · Squeek IDs`;
    updatePreviewGate();
    $('approval-scope').classList.toggle('hidden',!['approveAll','approveNft','approveSqk'].includes(action));
    $('approval-scope').textContent=action==='approveAll'?'Allows ALL current and future NFTs.':action==='approveNft'?'Allows only this NFT (preferred).':'Allows exactly this SQK amount.';
  }
  $('v9-action').onchange=renderActionFields;renderActionFields();
  for(const id of ['v9-ids','v9-token','v9-amount'])$(id).addEventListener('input',updatePreviewGate);
  $('v9-review').onclick = () => viewTask(() => {
    const input = {tokenIds:$('v9-ids').value.split(/[\s,]+/).filter(Boolean),tokenId:$('v9-token').value,survivor:$('v9-survivor').value,donor:$('v9-donor').value};
    const raw=$('v9-amount').value.trim(); if(raw) { if(!/^\d+(?:\.\d{1,18})?$/.test(raw))throw new Error('Use up to 18 decimal places'); input.amount=String(parseEther(raw)); }
    if(['merge','mergeDeposited'].includes($('v9-action').value)){[input.survivor,input.donor]=input.tokenIds;if($('v9-action').value==='merge')return requestMerge(input);}
    return requestAction($('v9-action').value,input);
  });
  // ── art ───────────────────────────────────────────────────────────────────
  async function loadArt(tokenIds) {
    const load = captureLoad();
    if (!state.adapter?.art) {
      toast("this profile has no art adapter", "err");
      return [];
    }
    el.art.status.textContent = `rendering ${tokenIds.length} token(s)…`;
    const loaded = [];
    const missing = tokenIds.filter(id => !state.art.has(String(id)));
    for (let offset = 0; offset < missing.length; offset += 24) {
      const ids = missing.slice(offset, offset + 24);
      try {
        const api=displayApi(load);const batch=api?await Promise.all(ids.map(async id=>{const level=state.status?.squeeks.find(item=>String(item.tokenId)===String(id))?.level;try{const result=await api.squeek(String(id),level),m=result.data.metadata;if(m?.status!=='available'||!/^data:image\/svg\+xml;base64,/.test(m.imageDataUri??''))throw new Error('Metadata unavailable');return {tokenId:String(id),level:result.data.level,name:m.name,description:m.description,image:m.imageDataUri,attributes:(m.attributes??[]).map(a=>({trait:a.traitType,value:a.value}))};}catch(error){if(error.name==='RpcTrustError')throw error;return readFor(load,'art',id);}})):load.adapter.artBatch?await readFor(load,'artBatch',ids):await Promise.all(ids.map(id=>readFor(load,'art',id)));
        if (!isCurrent(load)) return [];
        for (const item of batch) {
          if (item.error) toast(`art ${item.tokenId}: ${item.error}`, 'err');
          else state.art.set(String(item.tokenId), item);
        }
      } catch (err) {
        if (!isCurrent(load)) return [];
        toast(`art unavailable: ${errorMessage(err)}`, 'err');
      }
    }
    for (const id of tokenIds) { const item = state.art.get(String(id)); if (item) loaded.push(item); }
    if (!isCurrent(load)) return [];
    renderArt(loaded);
    el.art.status.textContent = `${state.art.size} rendered`;
    return loaded;
  }

  function renderArt(items) {
    for (const item of items) {
      if (!item?.image) continue;
      const card = TokenCard({ doc, item, onOpen: () => openArtDetail(item) });
      el.art.grid.prepend(card);
    }
  }

  function openArtDetail(item) {
    dialog.close();
    el.modal.title.textContent = item.name ?? `Squeek #${item.tokenId}`;
    el.modal.body.replaceChildren();
    const wrap = doc.createElement("div");
    wrap.className = "art-detail";
    const img = doc.createElement("img");
    img.src = item.image;
    img.alt = item.name ?? "";
    const side = doc.createElement("div");
    const desc = doc.createElement("p");
    desc.className = "muted small";
    desc.textContent = `${item.description ?? ""}${item.artworkIntegrity ? ` · Artwork integrity: ${item.artworkIntegrity}` : ""}`;
    const attrs = doc.createElement("div");
    attrs.className = "attrs";
    for (const a of item.attributes ?? []) {
      const row = doc.createElement("div");
      row.className = "attr";
      const k = doc.createElement("span");
      k.textContent = a.trait;
      const v = doc.createElement("span");
      v.textContent = a.value;
      row.append(k, v);
      attrs.appendChild(row);
    }
    side.append(desc, attrs);
    wrap.append(img, side);
    el.modal.body.appendChild(wrap);
    el.modal.input.classList.add("hidden");
    el.modal.confirm.textContent = "Close";
    el.modal.confirm.disabled = false;
    el.modal.confirm.className = "btn btn-primary";
    const close = openModal({
      onClose: () => {
        el.modal.confirm.onclick = null;
        el.modal.cancel.onclick = null;
        el.modal.confirm.className = "btn btn-danger";
      },
    });
    el.modal.confirm.onclick = () => close();
    el.modal.cancel.onclick = () => close();
  }

  // ── tool registry ─────────────────────────────────────────────────────────
  const ownerOrDefault = (args) => args.owner ?? state.inspected ?? state.account ?? null;
  const requireOwner = (args) => {
    const owner = ownerOrDefault(args);
    if (!owner) throw new Error("no address: connect a wallet or pass owner");
    return owner;
  };

  function buildTools() {
    if (!state.adapter) return {};
    return Object.fromEntries(TOOL_SPECS.filter(spec=>spec.surfaces.includes('web')).map(spec=>[spec.name,{description:spec.description,run:args=>{
      const selected=toolProfile(args.profile??state.profileKey);
      if (spec.sideEffects==='wallet-popup') {
        if (selected.key!==state.profileKey) throw new Error('Select the requested profile before opening a wallet prompt.');
        if (!state.account) throw new Error('Connect your wallet first.');
        for (const address of [args.owner,args.from]) if (address != null && address.toLowerCase()!==state.account.toLowerCase()) throw new Error('Connect the owner wallet.');
        const action=spec.name.slice('squeek_request_'.length);
        if (action!=='checkpoint' && state.inspected?.toLowerCase()!==state.account.toLowerCase()) throw new Error('Exit view-only mode before requesting an owner action.');
        if (action==='merge' || action==='merge_deposited') requireBurn(args.donor,args.confirm);
        if (action==='checkpoint') return requestCheckpoint();
        if (action==='claim') return requestClaim(args.tokenIds);
        if (action==='merge') return requestMerge({survivor:args.survivor,donor:args.donor});
        return requestAction({merge_deposited:'mergeDeposited',claim_and_stake:'claimAndStake'}[action]??action,args);
      }
      const adapter=selected.key===state.profileKey?state.adapter:buildAdapter(selected.key);
      return readToolResult(adapter,spec.name,{...args,owner:ownerOrDefault(args),from:args.from??state.account});
    }}]));
  }

  const tools = () => buildTools();
  const manifest = () => ({ ...buildManifest({ surface: "web" }), activeProfile: state.profileKey, availableTools: Object.keys(buildTools()) });

  async function callTool(name, args = {}) {
    const load = captureLoad();
    if (!state.adapter) return { error: `profile ${state.profileKey} has no deployment`, available: [] };
    const tool = buildTools()[name];
    if (!tool) return { error: `unknown tool for profile ${state.profileKey}: ${name}`, available: Object.keys(buildTools()) };
    try {
      return await viewAwait(load, () => tool.run(args ?? {}));
    } catch (err) {
      if (!isCurrent(load)) return { error: "Profile changed; tool result discarded", cancelled: true };
      return rpcToolError(err, state.adapter?.rpcDiagnostics?.() ?? []);
    }
  }

  // Routes are display-only; legacy API tab names remain aliases for integrations.
  function currentRoute() {
    const parts = win.location.hash.slice(1).split('/');
    if (profileFromHash(win.location.hash)) parts.shift();
    const hash = parts.join('/');
    return /^(squeeks|art|network|info)(\/|$)/.test(hash) ? hash : (state.account || state.inspected ? 'squeeks' : 'network');
  }
  function selectTab(route) {
    const aliases = { overview: 'network', holdings: 'squeeks', agent: 'info/developers' };
    route = aliases[route] ?? route;
    let [name, section] = String(route).split('/');
    if (!['squeeks', 'art', 'network', 'info'].includes(name)) name = state.account || state.inspected ? 'squeeks' : 'network';
    const deployed = Boolean(getProfile(state.profileKey).addresses);
    if(!deployed)name='info';
    doc.querySelectorAll('a[href^="#info/"], a[data-info-route]').forEach(link => { const route = link.dataset.infoRoute ?? link.getAttribute('href').slice(1); link.dataset.infoRoute = route; link.href = `#${state.profileKey}/${route}`; });
    el.tabs.forEach(t => { t.setAttribute('aria-selected', String(t.dataset.tab === name)); t.tabIndex = t.dataset.tab === name ? 0 : -1; });
    el.panels.forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== name || (!deployed && name !== 'info')));
    const hash = `#${state.profileKey}/${name}${name === 'info' && ['how-it-works', 'trust', 'status', 'contracts', 'developers', 'about'].includes(section) ? '/' + section : ''}`;
    // replaceState avoids hashchange loops, while tab clicks below create history entries.
    if (win.location.hash !== hash) win.history.replaceState(null, '', hash);
    if (name === 'info' && section) $("info-" + section)?.scrollIntoView?.({ block: 'start' });
  }
  const onHashChange = () => { const key = profileFromHash(win.location.hash); if (key && key !== state.profileKey) void switchProfile(key); else selectTab(currentRoute()); };
  win.addEventListener('hashchange', onHashChange);
  for (const tab of el.tabs) {
    tab.onclick = () => { win.location.hash = `${state.profileKey}/${tab.dataset.tab}`; selectTab(tab.dataset.tab); };
    tab.onkeydown = event => {
      const index = el.tabs.indexOf(tab);
      const next = event.key === 'ArrowRight' ? (index + 1) % el.tabs.length : event.key === 'ArrowLeft' ? (index + el.tabs.length - 1) % el.tabs.length : event.key === 'Home' ? 0 : event.key === 'End' ? el.tabs.length - 1 : -1;
      if (next >= 0) { event.preventDefault(); el.tabs[next].click(); el.tabs[next].focus(); }
    };
  }
  $('profile-status').onclick = () => { win.location.hash = `${state.profileKey}/info/trust`; selectTab('info/trust'); $('info-trust').focus(); };

  let activeSheet = null, sheetFocus = null;
  function closeSheet() {
    if(finishWalletPick){const resolve=finishWalletPick;finishWalletPick=null;resolve(null);}
    if (!activeSheet) return;
    activeSheet.classList.add('hidden'); activeSheet = null;
    if (sheetFocus?.isConnected) sheetFocus.focus();
  }
  function openSheet(id) {
    closeWalletMenu(); closeSheet(); sheetFocus = doc.activeElement.closest('#wallet-menu') ? el.connect : doc.activeElement;
    activeSheet = $(id); activeSheet.classList.remove('hidden');
    activeSheet.querySelector('[data-close-sheet]').focus();
  }
  for (const sheet of doc.querySelectorAll('.sheet-overlay')) {
    sheet.querySelector('[data-close-sheet]').onclick = closeSheet;
    sheet.onclick = event => { if (event.target === sheet) closeSheet(); };
  }
  $('btn-settings').onclick = showSettings;
  doc.querySelectorAll('[data-open-settings]').forEach(button => { button.onclick = showSettings; });
  function closeWalletMenu() { $('wallet-menu').classList.add('hidden'); el.connect.setAttribute('aria-expanded', 'false'); }
  const onDocumentClick = event => { if (!$('wallet-menu').contains(event.target) && !el.connect.contains(event.target)) closeWalletMenu(); };
  const onSheetFocus = event => { if (activeSheet && !$('modal').classList.contains('hidden')) return; if (activeSheet && !activeSheet.contains(event.target)) activeSheet.querySelector('[data-close-sheet]').focus(); };
  const onOverlayKey = event => {
    if (!$('modal').classList.contains('hidden')) return;
    if (activeSheet) {
      if (event.key === 'Escape') { event.preventDefault(); closeSheet(); }
      if (event.key === 'Tab') {
        const nodes = [...activeSheet.querySelectorAll('button, input, select, a[href]')].filter(node => !node.disabled && !node.closest('.hidden'));
        const index = nodes.indexOf(doc.activeElement), next = (index + (event.shiftKey ? -1 : 1) + nodes.length) % nodes.length;
        event.preventDefault(); nodes[next]?.focus();
      }
    } else if (!$('wallet-menu').classList.contains('hidden')) {
      const buttons = [...$('wallet-menu').querySelectorAll('button:not(.hidden)')];
      if (event.key === 'Escape') { closeWalletMenu(); el.connect.focus(); }
      if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) {
        event.preventDefault(); const i = buttons.indexOf(doc.activeElement);
        buttons[event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (i + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length].focus();
      }
      if (event.key === 'Tab') closeWalletMenu();
    }
  };
  doc.addEventListener('click', onDocumentClick);
  doc.addEventListener('keydown', onOverlayKey);
  doc.addEventListener('focusin', onSheetFocus);
  el.profileSelect.onchange = () => switchProfile(el.profileSelect.value, { preserveWallet: true });
  el.connect.onclick = async () => {
    if (!state.account && !Number(el.connect.dataset.activityCount) && getProfile(state.profileKey).addresses) return viewTask(connect);
    const open = $('wallet-menu').classList.contains('hidden');
    $('wallet-menu').classList.toggle('hidden', !open); el.connect.setAttribute('aria-expanded', String(open));
    if (open) $('wallet-menu').querySelector('button:not(.hidden)').focus();
  };
  $('btn-menu-connect').onclick = () => { closeWalletMenu(); return viewTask(connect); };
  $('btn-copy-address').onclick = async () => {
    try { await win.navigator.clipboard.writeText(state.account); toast('Address copied', 'ok'); } catch { toast('Clipboard unavailable; copy the address from your wallet', 'warn'); }
    closeWalletMenu(); el.connect.focus();
  };
  $('btn-open-activity').onclick = () => openSheet('activity-drawer');
  $('btn-disconnect').onclick = () => {
    const p=provider();wallet.disconnect();void p?.request({method:'wallet_revokePermissions',params:[{eth_accounts:{}}]}).catch(()=>{});
    $('account-activity').replaceChildren();closeWalletMenu();selectTab('network');el.connect.focus();
  };
  el.refresh.onclick = () => {void refreshTelemetry({reset:false});void displayFeeds(captureLoad());return viewTask(()=>refreshAll({force:true}));};
  el.cp.button.onclick = () => viewTask(requestCheckpoint);
  el.holder.claim.onclick = () => viewTask(() => {
    const raw = $("claim-ids").value.trim();
    if (raw && !/^\d+(?:[\s,]+\d+)*$/.test(raw)) throw new Error("Use comma- or space-separated positive token IDs.");
    const ids = raw ? raw.split(/[\s,]+/) : undefined;
    if (ids?.some(id => BigInt(id) === 0n)) throw new Error("Token IDs must be positive.");
    return requestClaim(ids);
  });
  $("btn-custom-merge").onclick = () => viewTask(() => {
    const survivor = $("merge-survivor").value.trim(), donor = $("merge-donor").value.trim();
    if (![survivor, donor].every(id => /^\d+$/.test(id) && BigInt(id) > 0n) || BigInt(survivor) === BigInt(donor)) throw new Error("Choose two different positive token IDs.");
    const position = state.status?.squeeks.find(s => BigInt(s.tokenId) === BigInt(survivor));
    if (!position) throw new Error("The survivor must be in the inspected wallet.");
    return requestMerge({ survivor: String(BigInt(survivor)), donor: String(BigInt(donor)), nextLevel: Number(position.level) + 1 });
  });
  el.holder.refresh.onclick = () => viewTask(()=>refreshWallet({force:true}));
  el.holder.owner.onclick=async()=>{const address=el.holder.owner.title;if(!address)return;try{await win.navigator.clipboard.writeText(address);toast('Address copied','ok');}catch{toast('Clipboard unavailable','warn');}};
  $('btn-exit-watch').onclick = () => viewTask(async()=>{
    state.inspected=state.account;el.holder.watchInput.value='';renderHolder(null);
    await refreshWallet();
  });
  el.holder.watch.onclick = async () => {
    const value = el.holder.watchInput.value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return toast("enter a valid 0x address", "err");
    state.inspected = value;
    renderHolder(null);
    selectTab('squeeks');
    await viewTask(refreshWallet);
  };
  el.art.one.onclick = () => {
    const id = el.art.token.value.trim();
    if (!/^\d+$/.test(id)) return toast("enter a token id", "err");
    viewTask(() => loadArt([id]));
  };
  el.art.mine.onclick = () => {
    const ids = (state.status?.squeeks ?? []).map((s) => s.tokenId);
    if (ids.length === 0) return toast("no Squeeks in the current view", "err");
    viewTask(() => loadArt(ids));
  };

  let developersReady;
  const developerUI = async () => { developersReady ??= import('./developers.js').then(module => module.initDevelopers({el,win,json,toast,showOut,viewTask,callTool,captureLoad,isCurrent,manifest})); await developersReady; };
  el.agent.run.onclick = async () => { await developerUI(); return el.agent.run.onclick(); };
  el.agent.copy.onclick = async () => { await developerUI(); return el.agent.copy.onclick(); };

  const onToolMessage = async (event) => {
    const msg = event.data;
    if (!msg || msg.type !== "squeek.tool" || typeof msg.name !== "string") return;
    // Opaque origins cannot receive an origin-bound reply. Never broadcast one.
    if(!event.source?.postMessage || !event.origin || event.origin==='null')return;
    const result=event.origin===win.location.origin
      ? await callTool(msg.name,msg.args??{})
      : await runPublicReadTool(msg.name,msg.args??{});
    const payload = { type: "squeek.result", id: msg.id ?? null, ok: !result?.error, result };
    event.source.postMessage(payload,event.origin);
  };
  win.addEventListener("message", onToolMessage);

  function renderToolOptions() {
    const names = Object.keys(buildTools());
    el.agent.select.replaceChildren(
      ...names.map((n) => {
        const option = doc.createElement("option");
        option.value = n;
        option.textContent = n;
        return option;
      }),
    );
  }

  let settingsReady;
  async function showSettings() {
    settingsReady ??= import('./settings.js').then(module => module.initSettings({$,state,store,fetcher,captureLoad,assertCurrent,isCurrent,getProfile,switchProfile,discoveryCache,buildAdapter,refreshAll,resetLoad:()=>{loadController.abort();generation++;loadController=new AbortController();},closeSheet,confirmModal,activity,destroyed:()=>destroyed,openSheet,showBanner,errorMessage,applyTheme}));
    await settingsReady; if (!destroyed) openSheet('settings-sheet');
  }
  const images=createImages({cache:displayCache,fetcher,win});
  const holdings=createHoldings({doc,win,state,onSelection:updatePreviewGate,onConnect:()=>viewTask(connect),onMerge:()=>$('btn-custom-merge').click(),onAction:action=>{$('v9-action').value=action;renderActionFields();$('v9-review').focus();},loadImage:async token=>{const load=captureLoad();let item;try{item=await images.load({profile:getProfile(load.profileKey),token,api:displayApi(load),fallback:()=>readFor(load,'art',token.tokenId),signal:load.signal});}catch(error){if(isCurrent(load)&&error.name==='RpcTrustError')clearDisplayMismatch(error);throw error;}assertCurrent(load);state.art.set(String(token.tokenId),item);return item;}});
  $('sqk-claim-host').append($('btn-claim'),$('claim-ids'),$('holder-rewards-notice'));
  // ── boot ──────────────────────────────────────────────────────────────────
  store.set("squeekchain:profile", state.profileKey);
  applyTheme(store.get(THEME_KEY) ?? "light");
  renderProfileOptions();
  renderWalletChip();
  state.adapter = buildAdapter(state.profileKey);
  renderNetworkPlaceholder();
  renderDeploymentVisibility();
  if (state.adapter) refreshAll().then(() => { if (!destroyed) renderToolOptions(); });
  if(adapterFactory)void refreshTelemetry();
  renderActivity(activity.list());
  void activity.refresh();
  let provisionalResult,liveMeasurement;
  function renderProvisional(result=provisionalResult){provisionalResult=result;const active=liveMeasurement?.freshness==='online'&&liveMeasurement.coreStatus==='ACTIVE'&&Date.now()-Date.parse(liveMeasurement.receivedAt)<120000;const text=formingBlock(result?.data,active);$('provisional-blocks').textContent=text??'';$('provisional-blocks').classList.toggle('hidden',!text);}
  const poller=createWheelPoller({enabled:()=>state.profileKey==='sepolia-v9',doc,setTimer:win.setTimeout.bind(win),clearTimer:win.clearTimeout.bind(win),
    contextKey:()=>`${generation}:${state.profileKey}`,
    readStatus:async()=>{const load=captureLoad();if(load.profileKey!=='sepolia-v9')throw new Error('No v6 wheel poll');const api=displayApi(load);const result=api?await api.status():{data:await telemetry.read({signal:load.signal})};assertCurrent(load);return result;},
    readEvents:adapterFactory?null:readWheelEvents,
    readBlocks:adapterFactory?null:async()=>displayApi(captureLoad()).blocks(),
    frontier:()=>({settled:state.net?.core?.settledThroughRound,processed:state.net?.mining?.processedThroughRound}),
    onStatus:async(data,result)=>{liveMeasurement=result.stale?null:data.measurement;renderProvisional();const view=telemetryView(data);if(result.stale)view.note=`as of ${Math.max(1,Math.floor((Date.now()-result.at)/60000))} min`;for(const [id,value] of [['wheel-state',view.state],['wheel-rpm',view.rpm],['wheel-speed',view.speed],['wheel-distance',view.distance],['wheel-note',view.note]])$(id).textContent=value;wheelGoodAt=result.at??Date.now();},
    onFrontier:async()=>{const net=await refreshNetwork();if(!net||net.source?.stale)return false;await refreshAll();if(state.inspected&&!state.status)return false;if(provisionalResult)renderProvisional(provisionalResult);await displayFeeds(captureLoad());if(activity.list().some(item=>!['confirmed','reverted'].includes(item.status)))void activity.refresh();return true;},
    onBlocks:renderProvisional,
    onError:(error,scope)=>{if(error.name==='AbortError'||state.profileKey!=='sepolia-v9')return;if(error.name==='RpcTrustError'){clearDisplayMismatch(error);}else if(scope==='status'&&wheelGoodAt&&Date.now()-wheelGoodAt<DISPLAY_TTL&&errorIsTransient(error))$('wheel-note').textContent=`as of ${Math.max(1,Math.floor((Date.now()-wheelGoodAt)/60000))} min`;else if(scope==='status'){liveMeasurement=null;renderProvisional();for(const id of ['wheel-rpm','wheel-speed','wheel-distance'])$(id).textContent=UNKNOWN;$('wheel-state').textContent='Unknown';$('wheel-note').textContent='No available device reading.';}}
  });
  if(adapterFactory)poller.start();else void poller.tick();void displayFeeds(captureLoad());

  const unsubscribeWallet=wallet.subscribe(onWallet);
  void wallet.init();
  return {
    wallet,
    get adapter() {
      return state.adapter;
    },
    get sdk() {
      return state.adapter;
    },
    state,
    tools,
    callTool,
    manifest,
    activity,
    connect,
    refresh: ()=>refreshAll({force:true}),
    pollDisplay:()=>poller.tick(),
    switchProfile,
    loadArt,
    requestAction: (action,input) => viewTask(()=>requestAction(action,input)),
    requestCheckpoint: () => viewTask(requestCheckpoint),
    requestClaim: ids => viewTask(() => requestClaim(ids)),
    requestMerge: pair => viewTask(() => requestMerge(pair)),
    selectTab,
    destroy: () => { unsubscribeWallet();wallet.destroy();holdings.destroy();images.destroy();headerObserver?.disconnect();win.removeEventListener('resize',positionBanner);win.removeEventListener('scroll',positionBanner);dialog.close(); closeSheet(); win.removeEventListener('hashchange', onHashChange); win.removeEventListener('message', onToolMessage); themeMedia?.removeEventListener?.('change', onSystemTheme); doc.removeEventListener('click', onDocumentClick); doc.removeEventListener('keydown', onOverlayKey); doc.removeEventListener('focusin', onSheetFocus); destroyed = true; generation++; loadController.abort(); activity.destroy(); poller.stop(); },
  };
}

if (typeof window !== "undefined" && typeof document !== "undefined") {
  const start = () => {
    if (window.__squeekMounted) return;
    window.__squeekMounted = true;
    window.squeek = mount();
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
}
