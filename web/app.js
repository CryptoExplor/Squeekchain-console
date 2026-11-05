/**
 * Wheelhouse — a Squeekchain holder console.
 *
 * Profile-driven: each deployment profile maps onto an adapter with the same surface
 * (verify / networkStatus / walletStatus / capability-driven actions / art).
 *   sepolia  → the current published deployment (guarded reads/actions)
 *   mainnet  → not deployed: no reads and no actions
 *   mainnet      → no deployment
 *
 * Every action is simulated first and signed in the user's wallet. No key ever reaches this code.
 */
import { createNetworkView } from './network.js';
import { createNetworkStrip } from './network-strip.js';
import {
  createDisplayApi, createDisplayCache, displayKey, apiNetwork, apiWallet, createWheelPoller, DAY, DISPLAY_TTL,
  createSqueekchain,
  PROFILES,
  DEFAULT_PROFILE,
  getProfile,
  TOOL_SPECS,
  buildManifest,
  abortable,
  createDiscoveryStore,
  createRpcContext,
  rpcToolError,
  ACTION_REASONS,
  PUBLIC_RPC_ENDPOINTS,
  readToolResult, runPublicReadTool, toolProfile, settlementStatus, requireBurn,
  profileFromHash, profileInput, parseEther, formatEther, unstakeQuoteError, SQUEEKS_POLICY,
} from "./bundle.js";

import { Panel, Stat, Table, TokenCard, ConfirmDialog, Toast, UNKNOWN, valueText, formatNumber, formatAmount } from './components.js';

// Sepolia is the only chain Wheelhouse talks to; the profile decides the rest.
const SEPOLIA_CHAIN_ID = 11155111;
import {holderRoute,watchAddress,watchHash} from './holder-routes.js';
import {createHoldings} from './holdings.js';
import {formingBlock} from './wheel-feed.js';
import {createWallet} from './wallet.js';
import {createImages} from './images.js';
import { createActivity } from "./activity.js";
import { createTelemetry } from "./telemetry.js";

// EIP-1193 prompts outlive view cancellation and even remounts in this page.
const outstandingPrompts=new WeakMap();
const EXPLORER = "https://eth-sepolia.blockscout.com";
const THEME_KEY = "squeekchain:theme";

export function mount({ doc = document, win = window, adapterFactory, fetcher = globalThis.fetch, activityReader, profileBalanceReader } = {}) {
  const $ = (id) => doc.getElementById(id);
  let workspace,workspaceReady;
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

  let networkRequest=null;
  const wallet=createWallet({win,storage:store,pick:pickWallet});
  const state = {
    profileKey: profileFromHash(win.location.hash) ?? profileInput(store.get("squeekchain:profile")),
    adapter: null,
    get account(){return wallet.get().account;},
    get chainId(){return wallet.get().chainId;},
    get walletEth(){const value=wallet.get().ethBalance;return value==null?null:Number(value).toFixed(3);},
    inspected: null,
    net: null,
    watchOnly: false,
    claimQuote: null,
    status: null,
    holderReadState: 'idle',
    plan: null,
    art: new Map(),
    get walletPromptPending(){return outstandingPrompts.has(wallet.provider())||Boolean(networkRequest&&networkRequest.p===wallet.provider());},
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
  // The chip and the banner are ONE state. Never let a green "Verified" chip sit
  // above a stale "Can't verify right now" banner.
  function trustDisplay({kind,chipText,bannerKind=null,title=''}) {
    const chip=$('profile-status');
    chip.textContent=chipText;
    chip.className=`chip ${kind==='verified'?'ok':kind==='unavailable'?'warn':'bad'}`;
    chip.title=el.verified.title=title;
    $('trust-checklist').dataset.state=kind==='verified'?'verified':kind==='unavailable'?'unknown':'stopped';
    if(kind==='verified')clearReadBanner();
    else showBanner(BANNER_READ_FAILURE,bannerKind??(kind==='unavailable'?'warn':'bad'));
  }
  const BANNER_READ_FAILURE="Can't verify right now";
  function showReadFailure(error,scope) {
    const failure=rpcToolError(error,state.adapter?.rpcDiagnostics?.()??[]);
    state.lastReadFailure={scope,profile:state.profileKey,...failure};
    const availability=failure.diagnostics.availability;
    el.verified.textContent=availability?'Unavailable':'Stopped';
    trustDisplay({kind:availability?'unavailable':'mismatch',chipText:availability?'Unavailable':failure.diagnostics.trust?'Mismatch: stop':'Unverified'});
    renderTrust(availability?null:{ok:false,trusted:false});$('trust-block').textContent=UNKNOWN;$('trust-result').textContent=BANNER_READ_FAILURE;$('rpc-diagnostics').textContent=JSON.stringify(failure,null,2);
    readBanner=true;
  }
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : UNKNOWN);
  const num = formatNumber;
  const sqk = formatAmount;
  const setStat = (node, value, formatter = valueText) => {const stat=node.closest('.stat');if(stat)Stat(stat).set(value,formatter);else node.textContent=valueText(formatter(value));};
  const json = (v) => JSON.stringify(v, null, 2);
  const actionNames={merge:'Merge Squeeks',mergeDeposited:'Merge deposited',deposit:'Deposit',withdraw:'Withdraw',claim:'Claim',claimAndStake:'Claim and stake',stake:'Stake',unstake:'Unstake',approveNft:'Approve one Squeek',approveAll:'Approve all Squeeks',approveSqk:'Approve SQK'};
  const hiddenDeployments=()=>Object.values(PROFILES).flatMap(profile=>[profile.identities?.release,profile.identities?.key].filter(Boolean));
  const technical=value=>JSON.stringify(value,(_key,v)=>typeof v==='string'&&hiddenDeployments().some(secret=>v.includes(secret))?'[internal deployment]':v,2);
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
    return err?.revert||/\b(?:storage|slots?|digest|revision|release|runtime)\b|\w+\(/i.test(message)||hiddenDeployments().some(secret=>message.includes(secret))
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
      const needsIds=['merge','mergeDeposited','deposit','withdraw','approveNft'].includes(action);
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
  function resetLoad(){networkView.reset(getProfile(state.profileKey));displaySources.clear();$('display-sources').replaceChildren();state.holderReadState='idle';workspace?.clear();state.claimQuote=null;verifiedForGeneration=null;loadController.abort();generation++;loadController=new AbortController();state.adapter=buildAdapter(state.profileKey);}
  const displayCache=createDisplayCache(win.indexedDB),lastGood=new Map();let apiScope;
  const displaySources=new Map();
  function recordSource(panel,kind,reason){
    displaySources.set(panel,{kind,reason:reason==='launch_unconfigured'?'Genesis not open':reason});
    $('display-sources').replaceChildren(...[...displaySources].map(([name,value])=>{const li=doc.createElement('li');li.textContent=`${name} — Source: ${value.kind==='api'?'API':'RPC'}${value.reason?` · ${value.reason}`:''}`;return li;}));
  }
  const networkView=createNetworkView({doc,source:recordSource,current:isCurrent,visible:()=>!$('panel-squeeks').classList.contains('hidden'),readContext:()=>{const load=captureLoad();return {load,api:displayApi(load)};}});
  function refreshNetworkExtras(){const load=captureLoad();return networkView.refresh(load,displayApi(load),state.account);}

  function displayApi(load){if(adapterFactory||!getProfile(load.profileKey).apiBase)return null;if(apiScope?.generation!==load.generation)apiScope={generation:load.generation,client:createDisplayApi({profile:getProfile(load.profileKey),fetcher:fetcher??win.fetch?.bind(win)??globalThis.fetch,cache:displayCache,signal:load.signal})};return apiScope.client;}
  function displayStamp(value){const source=value?.source;if(!source)return;const age=Math.max(0,Math.floor((Date.now()-source.at)/60000));$('display-age').textContent=age?`as of ${age} min`:'';}

  function displayVerification(value){
    if(!value.source||value.source.kind==='rpc'){if(value.verification)renderVerification(value.verification);return;}
    if(state.lastReadFailure?.profile===state.profileKey)return;
    if(verifiedForGeneration){renderVerification(verifiedForGeneration);return;}
    renderTrust(null);$('trust-block').textContent=UNKNOWN;
    $('trust-result').textContent=UNKNOWN;
    $('profile-status').textContent='Checking…';$('profile-status').className='chip';
    $('profile-status').title='Awaiting contract verification. Display data is not transaction authority. Open Info › Trust for details.';
    el.verified.textContent='Checking…';
  }
  async function displayRead(load,kind,owner,{force=false}={}){
    if(adapterFactory)return readFor(load,kind==='network'?'networkStatus':'walletStatus',...(owner?[owner]:[]));
    const profile=getProfile(load.profileKey),key=displayKey(profile,kind+':'+(owner??'')),ttl=DISPLAY_TTL;
    let saved=lastGood.get(key);assertCurrent(load);
    try{let value;const api=displayApi(load);
      if(api){if(kind==='network'){const economy=await api.economy(),core=await api.core();value=apiNetwork(core,economy);}
        else {const net=!force&&state.net?.source?.kind==='api'?state.net:await displayRead(load,'network',null,{force});value=apiWallet(await api.account(owner),net,owner);}
      }else value=await readFor(load,kind==='network'?'networkStatus':'walletStatus',...(owner?[owner]:[]));
      assertCurrent(load);if(!value.source)value={...value,source:{kind:'rpc',at:Date.now()}};const entry={value,at:value.source.at};lastGood.set(key,entry);return value;
    }catch(error){assertCurrent(load);if(error.name==='TypeError'&&!error.kind)throw error;if(error.name==='RpcTrustError'||error.kind==='mismatch'){lastGood.delete(key);await displayCache.delete(key);saved=null;}
      if(error.kind==='unavailable'||error.kind==='schema'){lastGood.delete(key);await displayCache.delete(key);saved=null;}
      if(saved&&Date.now()-saved.at<ttl&&(error.kind==='transport'||error.name==='TypeError'))return {...saved.value,source:{...saved.value.source,kind:saved.value.source?.kind==='api'?'api':'cached-rpc',at:saved.at,stale:true}};
      // Unavailable API is not zero. Only the fresh guarded SDK may supply fallback.
      if(displayApi(load)){for(const panel of kind==='network'?['Network']:['Squeeks'])recordSource(panel,'rpc',error.message);const value=await readFor(load,kind==='network'?'networkStatus':'walletStatus',...(owner?[owner]:[]));assertCurrent(load);return {...value,source:{kind:'rpc',at:Date.now(),reason:error.message}};}
      throw error;
    }
  }
  function clearWheelFeed(){for(const id of ['account-activity','provisional-blocks'])$(id).replaceChildren();$('provisional-blocks').classList.add('hidden');}
  function clearDisplayMismatch(error){lastGood.clear();state.net=null;state.holderReadState='unavailable';renderNetworkPlaceholder();renderHolder(null);networkStrip.invalidate();for(const id of ['wheel-speed','wheel-distance'])$(id).textContent=UNKNOWN;clearWheelFeed();recordSource('Display validation','api',error.message);showReadFailure(Object.assign(new Error('Display source does not match this network.'),{name:'RpcTrustError',kind:'mismatch'}),'Display validation');}

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
    activityReady=true;workspace?.localChanged();
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
    return createSqueekchain({ profileKey, cache: store, verificationCache, chainCache, discoveryCache, signal: loadController.signal, rpcUrl: store.get("wheelhouse:rpc") || undefined, provider: () => state.account ? provider() : null });
  }

  function renderProfileOptions() {
    // Two networks only: the published Sepolia deployment and mainnet, which is
    // listed as not deployed and never gets guessed addresses.
    el.profileSelect.replaceChildren(...Object.values(PROFILES).map(profile => {
      const option = doc.createElement("option");
      option.value = profile.key;
      option.textContent = profile.label;
      return option;
    }));
    el.profileSelect.value = state.profileKey;
    const badge = $('profile-status');
    badge.removeAttribute('aria-label');
    $('profile-choice').classList.add('hidden');
  }

  async function switchProfile(profileKey, { preserveWallet = false, syncWallet = false } = {}) {
    if(getProfile(profileKey).key!==state.profileKey)pendingSwitchNotice();
    $('fee-rose').classList.add('hidden');
    $('claim-update').classList.add('hidden');
    // The signer belongs to the wallet store, never to a deployment profile.

    // Navigation ALWAYS wins, including while a simulation or wallet prompt is pending.
    workspace?.clear();state.claimQuote=null;loadController.abort();
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
    state.lastReadFailure=null;state.holderReadState='idle';

    state.receipts = [];
    wheelOffline=false;clearWheelFeed();
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
    const primary={generation,pending:true};primary.promise=new Promise(resolve=>primary.resolve=resolve);profileRead=primary;
    try {
      void refreshTelemetry();
      const selectedProfile=state.profileKey;
      if(syncWallet)await requestProfileChain();
      if(selectedProfile!==state.profileKey||destroyed)return;
      if (!state.adapter) {
        if (state.busy) showBanner("A prior wallet request may still complete; check that wallet before retrying.", "warn");
        return;
      }
      await refreshAll();
    } finally {primary.pending=false;primary.resolve();}
  }

  function renderDeploymentVisibility() {
    const deployed = Boolean(getProfile(state.profileKey).addresses);
    $("deployment-content").classList.toggle("hidden", !deployed);
    $("not-deployed").classList.toggle("hidden", deployed);
    $("not-deployed-note").textContent = deployed ? "" : getProfile(state.profileKey).notes;
    el.refresh.classList.toggle("hidden", !deployed);
    $("checkpoint-panel").classList.toggle("hidden",!deployed);
    el.verified.classList.remove('hidden');
    selectTab(currentRoute());
  }

  const networkStrip = createNetworkStrip(doc,{wheelEnabled:key=>Boolean(getProfile(key).apiBase)});
  let wheelOffline=false,profileRead;
  const capabilities = () => ({...getProfile(state.profileKey).capabilities,reasons:ACTION_REASONS});

  function renderNetworkPlaceholder() {
    const profile = getProfile(state.profileKey);
    networkView.reset(profile);
    networkStrip.reset(state.profileKey);
    networkStrip.network(null);
    for(const id of ['net-progress','net-squeeks','net-paused'])$(id).textContent=UNKNOWN;
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
    el.net.chain.textContent = profile.chainId === SEPOLIA_CHAIN_ID ? "Sepolia" : "Ethereum";
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
    if(v?.ok&&v?.trusted)clearReadBanner();
    lastVerificationTime=v?Date.now():null;
    $('trust-block').textContent=valueText(v?.blockNumber ?? state.net?.snapshot?.blockNumber);
    if(v?.ok||!v&&!state.lastReadFailure)$('rpc-diagnostics').textContent='';
    $('trust-result').textContent=v?.ok&&v?.trusted?'Verified':v?"Can't verify right now":UNKNOWN;
    for(const id of ['trust-block','trust-time'])$(id).parentElement.hidden=!(v?.ok&&v?.trusted);
    $('trust-checklist').hidden=!(v?.ok&&v?.trusted);
    updateTrustAge();
    $('trust-checklist').dataset.state=v ? v.ok && v.trusted ? 'verified' : 'stopped' : 'unknown';
    doc.querySelectorAll('[data-trust-check]').forEach(node=>{node.textContent=v ? v.ok && v.trusted ? 'Checked' : 'Stopped' : UNKNOWN;});
    $('core-pause-note').classList.toggle('hidden',state.net?.core?.paused!==true);
    $('info-reward-status').hidden=state.net?.core?.settledThroughRound==null;
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

  let offlineNetworkFlight;
  async function offlineNetwork(load) {
    if(offlineNetworkFlight?.generation===load.generation)return offlineNetworkFlight.promise;
    const flight={generation:load.generation};offlineNetworkFlight=flight;
    flight.promise=(async()=>{
      try {
        // Reuse the profile/wallet snapshot already in progress. A device failure
        // must not start parallel chain reads or repaint a half-switched profile.
        const primary=profileRead?.generation===load.generation?profileRead:null;
        const refresh=refreshFlight?.generation===load.generation?refreshFlight:null;
        const waited=primary?.pending||Boolean(refresh);
        if(primary)await primary.promise;
        if(refresh)await refresh.promise;
        assertCurrent(load);
        // The primary read already diagnosed a failed RPC snapshot. Do not
        // immediately retry those same peers just because telemetry also failed.
        if(waited&&!state.net&&state.lastReadFailure?.profile===load.profileKey&&state.lastReadFailure.scope!=='Display validation')return;
        const current=state.net,source=current?.source;
        if(current&&source?.kind!=='api'&&(!source||source.kind==='rpc'&&Date.now()-source.at<30000)) {
          networkStrip.network(current);recordSource('Block height','rpc');return;
        }
        const net=await readFor(load,'networkStatus');assertCurrent(load);
        const value={...net,source:{kind:'rpc',at:Date.now(),reason:'Wheel API unavailable; guarded chain read'}};
        recordSource('Block height','rpc');renderNetwork(value);displayVerification(value);displayStamp(value);
      } catch(error) { if(isCurrent(load))showReadFailure(error,'Network'); }
      finally {if(offlineNetworkFlight===flight)offlineNetworkFlight=null;}
    })();return flight.promise;
  }
  function wheelFailure(load) {
    wheelOffline=true;networkStrip.offline();
    if(state.net?.source?.kind==='api')networkStrip.network(null);
    void offlineNetwork(load);
  }
  function wheelReading(load,data,result={}) {
    networkStrip.reading(data,result);wheelOffline=result.stale===true;
    if(result.stale===true)wheelFailure(load);
    else if(state.net)networkStrip.network(state.net);
  }
  async function refreshTelemetry({ reset = true } = {}) {
    const load=captureLoad(),enabled=Boolean(getProfile(state.profileKey).apiBase);
    if(reset){networkStrip.loading();for(const id of ['wheel-speed','wheel-distance'])$(id).textContent=UNKNOWN;$('wheel-note').textContent=enabled?'Waiting for a device reading.':'No live device reading for this profile.';}
    if(!enabled)return;
    try{const api=displayApi(load);const result=await viewAwait(load,()=>api?api.status():telemetry.read({signal:load.signal}));assertCurrent(load);wheelReading(load,api?result.data:result,api?result:{});}
    catch(error){if(!isCurrent(load))return;recordSource('Wheel','api',error.message);if(error.name==='RpcTrustError')clearDisplayMismatch(error);wheelFailure(load);}
  }

  // ── wallet ────────────────────────────────────────────────────────────────
  async function ensureChain(p, profileKey = state.profileKey, currentRequest = () => true) {
    const profile = getProfile(profileKey);
    const current = await p.request({ method: "eth_chainId" });
    if (!currentRequest()) return;
    if (String(current).toLowerCase() === profile.hexChainId) return;
    try {
      await p.request({ method: "wallet_switchEthereumChain", params: [{ chainId: profile.hexChainId }] });
    } catch (err) {
      if ((err?.code === 4902 || /Unrecognized chain/i.test(err?.message ?? "")) && profile.chainId === SEPOLIA_CHAIN_ID) {
        if(!currentRequest())return;
        await p.request({
          method: "wallet_addEthereumChain",
          params: [
            {
              chainId: profile.hexChainId,
              chainName: "Sepolia",
              nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
              rpcUrls: PUBLIC_RPC_ENDPOINTS.map(endpoint => typeof endpoint === "string" ? endpoint : endpoint.url),
              blockExplorerUrls: [EXPLORER],
            },
          ],
        });
        if(!currentRequest())return;
        await p.request({method:'wallet_switchEthereumChain',params:[{chainId:profile.hexChainId}]});
      } else throw err;
    }
    if(currentRequest()&&String(await p.request({method:'eth_chainId'})).toLowerCase()!==profile.hexChainId)throw new Error('Wallet network did not change. Try switching again.');
  }

  function watching(){return Boolean(win.history.state?.exploreReadOnly||state.watchOnly||state.inspected&&state.inspected.toLowerCase()!==state.account?.toLowerCase());}
  let walletWork=Promise.resolve();
  // Only explicit local Connect/profile/menu actions may open a network prompt.
  async function requestProfileChain(){
    const key=state.profileKey,profile=getProfile(key),p=provider(),owner=state.account;
    if(!p||!owner||watching()||state.chainId===profile.chainId)return;
    if(networkRequest||state.busy||state.walletPromptPending){toast('Finish the open wallet request before switching networks.','warn');return;}
    const sameWallet=()=>!destroyed&&provider()===p&&state.account?.toLowerCase()===owner.toLowerCase();
    const currentRequest=()=>sameWallet()&&state.profileKey===key&&!watching();
    networkRequest={key,p};renderWalletChip();renderCheckpointGate();
    try{await ensureChain(p,key,currentRequest);if(sameWallet())await wallet.refresh();}
    catch(error){if(currentRequest())showBanner(error?.code===4001?'Network switch cancelled. Your wallet is still connected.':errorMessage(error),'warn');}
    finally{networkRequest=null;if(!destroyed){renderWalletChip();renderCheckpointGate();renderHolder(state.status,state.plan);}}
  }
  async function connect(){
    if(!getProfile(state.profileKey).addresses){showBanner('Mainnet is not deployed. Select Sepolia to connect and inspect.','warn');return null;}
    try{await wallet.connect();await requestProfileChain();await walletWork;selectTab(holderRoute(win.location.hash)?currentRoute():'squeeks');return state.account;}catch(error){showBanner(errorMessage(error),'bad');return null;}
  }
  async function loadWalletSession(){
    const load=captureLoad(),account=state.account;
    if(!account||!state.adapter||state.chainId!==11155111)return;
    try{
      if(profileBalanceReader)await viewAwait(load,()=>profileBalanceReader(account));
      assertCurrent(load);renderProfileOptions();
    }catch(error){if(!isCurrent(load))return;renderProfileOptions();}
    await refreshAll();
  }
  function onWallet(next,previous,reason){
    if(destroyed)return;
    renderWalletChip();
    const changed=next.account?.toLowerCase()!==previous.account?.toLowerCase()||next.chainId!==previous.chainId||next.providerInfo?.rdns!==previous.providerInfo?.rdns;
    if(!changed||(!next.account&&!previous.account&&next.chainId===previous.chainId))return;
    const wasWatch=state.watchOnly||state.inspected&&state.inspected.toLowerCase()!==previous.account?.toLowerCase();
    resetLoad();chainCache.clear();dialog.close();state.lastReadFailure=null;closeWalletMenu();    if(previous.account&&next.account?.toLowerCase()!==previous.account.toLowerCase())pendingSwitchNotice();
    if(!wasWatch)state.inspected=next.account;
    renderHolder(null);renderProfileOptions();renderCheckpointGate();renderActivity(activity.list());
    if(!getProfile(state.profileKey).addresses)return;
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
    const target=getProfile(state.profileKey);
    $('btn-switch-chain').classList.toggle('hidden',!state.account||watching()||state.chainId===target.chainId);
    $('btn-switch-chain').textContent=target.chainId===1?'Switch to Mainnet':'Switch to Sepolia';
    $('btn-switch-chain').disabled=Boolean(networkRequest);
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
    if(watching())throw new Error('Viewing only');
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
      // The wallet sets network gas and fees; never forward preview fee/gas overrides.
      const response=Promise.resolve().then(()=>p.request({method:'eth_sendTransaction',params:[{from:owner,to:tx.to,data:tx.data,value:`0x${BigInt(tx.value??0).toString(16)}` }]})).then(result=>{
        activity.record(result,label,SEPOLIA_CHAIN_ID,load.profileKey,owner);void activity.refresh();
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
    el.cp.button.disabled=state.watchOnly || state.busy || state.walletPromptPending || (!adapterFactory&&state.chainId!=null&&state.chainId!==11155111) || (adapterFactory&&unknownHoldings) || !(capabilities().checkpoint && state.net?.checkpoint?.canCheckpoint===true);
  }
  function renderNetwork(net) {
    const previous = observedRounds.get(state.profileKey);
    const round = net.core?.settledThroughRound;
    if (/^\d+$/.test(String(round))) observedRounds.set(state.profileKey, BigInt(round));
    state.net = net;
    if(!wheelOffline||!net.source||net.source.kind==='rpc')networkStrip.network(net);
    const core=net.core??{},mining=net.mining??{},checkpoint=net.checkpoint??{};
    setStat(el.net.round,core.settledThroughRound);
    const hasRound=/^\d+$/.test(String(round));
    const advancement=hasRound&&previous!=null&&BigInt(round)>previous&&core.paused!==true?' Mining live: rounds advanced.':'';
    const stalled=settlementStatus(net).stalled===true;
    const notice=stalled?`Rewards paused: settlement stopped at round ${round}.`:'';
    for (const node of [el.net.settlement,$('holder-rewards-notice')]) { node.textContent=notice;node.classList.toggle('hidden',!notice); }
    $('settlement-status').textContent=advancement.trim();
    setStat(el.net.blocks, core.blockHeight, num);
    setStat(el.net.lag, mining.lagRounds, value => num(value) === UNKNOWN ? UNKNOWN : `${num(value)} ${BigInt(value)===1n?'round':'rounds'}`);
    const v9=Boolean(getProfile(state.profileKey).addresses);
    setStat(el.net.issued,net.supply?.issued??(v9?mining.issued:mining.minted),sqk);
    setStat($('net-progress'),core.blockProgress,value=>/^\d+$/.test(String(value))&&BigInt(value)<=1000000000n?`${(Number(value)/10000000).toFixed(1)}%`:UNKNOWN);
    for(const panel of ['Network'])recordSource(panel,net.source?.kind==='api'?'api':'rpc',net.source?.reason??(net.source?.stale?'Cached response; live request unavailable':net.source?.kind==='cached-rpc'?'24-hour display cache':null));
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
    const isV9 = Boolean(getProfile(state.profileKey).addresses);
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
    const viewing=watching();
    $('watch-mode').classList.toggle('hidden',!viewing);
    $('watch-chip').textContent=viewing?`Viewing ${short(state.inspected)}`:'';
    $('watch-chip').title=viewing?state.inspected:'';
    el.holder.watchRow.classList.remove('hidden');
  }
  function renderHolderPlaceholder() {
    // A missing holdings snapshot is not a disconnected wallet.
    const disconnected=!state.account&&!state.inspected&&!state.watchOnly;
    const wrongChain=Boolean(state.account&&!watching()&&state.chainId!==11155111);
    const failed=state.holderReadState==='unavailable';
    $('holder-empty-message').textContent=disconnected?'Connect your wallet to see your Squeeks and SQK.':wrongChain?'Switch to Sepolia to see your Squeeks and SQK.':failed?'Squeeks and SQK unavailable.':'Loading Squeeks and SQK…';
    $('holder-connect').classList.toggle('hidden',!disconnected);
    $('holder-retry').classList.toggle('hidden',disconnected||wrongChain||!failed);
    $('holder-retry').disabled=disconnected||wrongChain||!failed;
  }
  function renderHolder(status, plan = null) {
    renderWatchMode();
    if(state.status!==status)state.claimQuote=null;
    state.status = status;
    state.plan = plan;
    workspace?.sync(status);if(status&&!workspace)void ensureWorkspace().then(w=>{if(state.status===status)w.sync(status);});
    renderCheckpointGate();
    const caps = capabilities();
    const isV9 = Boolean(getProfile(state.profileKey).addresses);
    el.holder.power.parentElement.querySelector('.label').textContent = isV9 ? 'Deposited' : 'Power';
    const inspected=status?.owner??state.inspected??state.account;
    el.holder.owner.textContent=inspected?short(inspected):'';el.holder.owner.title=inspected??'';el.holder.owner.classList.toggle('hidden',!inspected);
    el.holder.refresh.disabled=!state.adapter||!inspected;
    $('holder-copy-link').classList.toggle('hidden',!inspected);$('btn-planner').disabled=!(status?.squeeks?.length);$('btn-planner').hidden=!status?.squeeks?.some(token=>Number.isInteger(token.level)&&token.level>0&&token.level<state.net?.policy?.maximumLevel);
    el.holder.empty.classList.toggle("hidden", Boolean(status));
    el.holder.body.classList.toggle("hidden", !status);
    if (!status) {
      renderHolderPlaceholder();
      holdings.render(null);
      for (const node of [el.holder.count, el.holder.power, el.holder.share, el.holder.claimable]) setStat(node, null);
      el.holder.tbody.replaceChildren(); el.holder.head.replaceChildren(); el.holder.mergeList.replaceChildren();
      el.holder.claim.disabled = true; $("btn-custom-merge").disabled = true;$("v9-review").disabled=true; $("v9-actions").classList.add("hidden"); return;
    }
    const totals = status.totals ?? {};

    const has = num(totals.count) !== UNKNOWN && Number(totals.count) > 0;
    const signerOwns = Boolean(!watching()&&(state.chainId==null||state.chainId===11155111) && state.account && status.owner?.toLowerCase() === state.account.toLowerCase());
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


    holdings.render(status);if(state.claimQuote)workspace?.claim(state.claimQuote,status.owner);
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
      el.verified.className = "sr-only";
      trustDisplay({kind:v.ok&&v.trusted?'verified':'mismatch',chipText:v.ok&&v.trusted?'Verified':'Mismatch: stop',
        title:v.ok&&v.trusted?`Network and contract checks passed at block ${v.fullVerificationBlockNumber ?? v.blockNumber ?? "unknown"}; latest check at block ${v.blockNumber ?? "unknown"}. Two independent connections agree.`:"Network or contract checks did not match. Actions are stopped."});
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
      void refreshNetworkExtras();
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
    state.holderReadState='loading';
    if(!state.status)renderHolderPlaceholder();
    try {
      const status = options.prefetched??await displayRead(load,"wallet",owner,options);
      if (!isCurrent(load) || owner.toLowerCase() !== (state.inspected ?? state.account)?.toLowerCase()) return null;
      renderWalletChipStats(status);
      let plan = status.mergePlan ?? null;
      if (!plan && capabilities().merge && status.totals?.count > 1 && state.adapter.mergePlan) {
        plan = await readFor(load, "mergePlan", owner, { status });
      }
      if (!isCurrent(load) || owner.toLowerCase() !== (state.inspected ?? state.account)?.toLowerCase()) return null;
      state.holderReadState='ready';
      renderHolder(status, plan);
      if(status.net&&(status.verification||status.source)){renderNetwork({...status.net,snapshot:status.snapshot??status.net.snapshot});if(status.source){displayVerification(status);displayStamp(status);}else renderVerification(status.verification);}
      clearReadBanner();
      return status;
    } catch (err) {
      if (!isCurrent(load) || owner.toLowerCase() !== (state.inspected ?? state.account)?.toLowerCase()) return null;
      state.holderReadState='unavailable';
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
    if(watching())return {ok:false,reason:'Viewing only'};
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
    return { ok: true, ...result };
  }

  const recipientOf=(preview,owner)=>String(preview.recipient??owner).toLowerCase();
  const recipientDetails=(preview,owner)=>preview.recipient?[['Recipient',preview.recipient,{warning:recipientOf(preview,owner)!==owner.toLowerCase()}]]:[];
  function showClaimIncrease(before,after) {
    $('claim-update').textContent=`Claim amount updated: ${after.sqk} SQK (reviewed ${before.sqk} SQK).`;
    $('claim-update').classList.remove('hidden');
  }
  async function requestClaim(tokenIds) {
    if(watching())return {ok:false,reason:'Viewing only'};
    $('claim-update').classList.add('hidden');
    if(state.account&&state.chainId!==11155111)throw new Error('Wrong chain: Sepolia required');
    const load = captureLoad();
    const caps = capabilities();
    if (!caps.claim) throw new Error(capabilities().reasons.unavailable);
    const owner = state.inspected ?? state.account;
    const preview = await readFor(load, "claimPreview", owner, tokenIds);
    showOut(el.holder.claimOut, preview);workspace?.claim(preview,owner);
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
      const v9=Boolean(getProfile(load.profileKey).addresses);
      if (!fresh.ok || fresh.batches.length!==1 || (v9?BigInt(fresh.batches[0].amount.base)<BigInt(batch.amount.base):fresh.batches[0].amount.base!==batch.amount.base) || recipientOf(fresh,owner)!==recipientOf(preview,owner))throw new Error('Claim outcome changed. Review a fresh preview; no automatic retry.');
      if(v9&&BigInt(fresh.batches[0].amount.base)>BigInt(batch.amount.base)){showClaimIncrease(batch.amount,fresh.batches[0].amount);showOut(el.holder.claimOut,fresh);}
      receipts.push(await sendTransaction(fresh.batches[0].tx, 'Claim SQK', owner, load));
    }
    await displayApi(load)?.invalidateArt(state.status?.squeeks?.map(t=>t.tokenId)??[]);state.art.clear();await refreshAll({force:true});
    return { ok: true, total: preview.total, receipts };
  }

  async function requestMerge(pair) {
    if(watching())return {ok:false,reason:'Viewing only'};
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
    const sign = await confirmModal({ title: "Review simulated merge", body: `${preview.warning}. Result: level ${preview.nextLevel}. Keep #${pair.survivor}; permanently burn #${pair.donor}.`, confirmLabel: "Review in wallet" });
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
    const details=action==='unstake'?[['Amount',`${formatEther(BigInt(preview.amount))} SQK`],['Maximum fee',`${preview.fee.sqk} SQK`],['You receive',`${preview.net.sqk} SQK`],['Deadline',new Date(Number(preview.deadline)*1000).toLocaleString(undefined,{timeZoneName:'short'})]]:[['Spender',preview.spender],['Amount',amountText],['Scope',scopeText],['Squeeks',preview.tokenIds?.map(id=>`#${id}`).join(', ')],['Contract',preview.tx?.to],...recipientDetails(preview,owner)].filter(([,value])=>value!=null);
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
    const owner=state.status?.owner,signer=Boolean(!watching()&&!state.busy&&!state.walletPromptPending&&state.account&&owner?.toLowerCase()===state.account.toLowerCase()&&state.chainId===11155111&&state.status?.totals?.count!=null),action=$('v9-action').value;
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
    const parts = win.location.hash.split('?')[0].replace(/^#\/?/,'').split('/');
    if (profileFromHash(win.location.hash)) parts.shift();
    const hash = parts.join('/');
    return /^(squeeks|squeek|address|activity|art|explore|network|info)(\/|$)/.test(hash) ? hash+(win.location.hash.includes('?')?'?'+win.location.hash.split('?')[1]:'') : 'squeeks';
  }
  function selectTab(route) {
    const aliases = { network:'squeeks', overview: 'squeeks', holdings: 'squeeks', agent: 'info/developers' };
    const query=String(route).split('?')[1]??(win.location.hash.split('?')[0].endsWith('/'+String(route))?win.location.hash.split('?')[1]:'');route=String(route).split('?')[0];route = aliases[route] ?? route;
    const special=/^(address|squeek)\//.test(route);
    let [name, section] = String(route).split('/');if(special)name=String(route).startsWith('address/')?(String(route).split('/')[2]??'squeeks'):'squeeks';
    const openHistory=name==='activity';if(openHistory)name='squeeks';
    if (!['squeeks', 'art', 'explore', 'info'].includes(name)) name = 'squeeks';
    const deployed = Boolean(getProfile(state.profileKey).addresses);
    if(!deployed)name='info';
    const sections=['how-it-works','trust','status','contracts','developers','about'];
    if(name==='info'){if(!sections.includes(section))section='how-it-works';for(const node of doc.querySelectorAll('#panel-info .info-section'))node.hidden=node.id!==`info-${section}`;}
    doc.querySelectorAll('a[href^="#info/"], a[data-info-route]').forEach(link => { const route = link.dataset.infoRoute ?? link.getAttribute('href').slice(1); link.dataset.infoRoute = route; link.href = `#${state.profileKey}/${route}`; });
    el.tabs.forEach(t => { t.setAttribute('aria-selected', String(t.dataset.tab === name)); t.tabIndex = t.dataset.tab === name ? 0 : -1; });
    el.panels.forEach(panel => panel.classList.toggle('hidden', panel.dataset.panel !== name || (!deployed && name !== 'info')));
    let hash = special?`#/${state.profileKey}/${route}`:`#${state.profileKey}/${name}${name === 'info' && ['how-it-works', 'trust', 'status', 'contracts', 'developers', 'about'].includes(section) ? '/' + section : ''}`;
    if(query&&['squeeks','explore'].includes(name))hash+='?'+query;
    // replaceState avoids hashchange loops, while tab clicks below create history entries.
    if (win.location.hash !== hash) win.history.replaceState(null, '', hash);
    if(special&&String(route).startsWith('squeek/')){try{rememberWatch(holderRoute(hash),state.watchOnly?activeWatchRoute:null);}catch{/* Invalid routes are reported below. */}}
    for(const link of doc.querySelectorAll('.info-links a')){if(name==='info'&&link.hash.endsWith('/'+section))link.setAttribute('aria-current','page');else link.removeAttribute('aria-current');}
    $('holder-overview').hidden=special&&String(route).startsWith('squeek/');$('squeek-page').hidden=!$('holder-overview').hidden;
    if(name==='squeeks'&&state.adapter){holdings.refresh();if(!query)void refreshNetworkExtras();}
    if(name==='explore')void ensureExplore().then(e=>e.show()).catch(error=>recordSource('Explore','rpc',error.message));
    if(openHistory)openSheet('activity-drawer');
    if(special&&String(route).startsWith('squeek/')){try{const parsed=holderRoute(hash);void ensureWorkspace().then(w=>w.detail(parsed));}catch(error){routeError(error);}}else workspace?.detail(null);
  }
  function routeError(error){state.watchOnly=true;resetLoad();state.inspected=null;renderHolder(null);$('holder-route-error').textContent=error.message;$('holder-route-error').classList.remove('hidden');}
  let activeWatchRoute=null;
  // Session-history display scope only; never an account or transaction authority.
  function watchScope(route){if(route?.kind==='address')return route.address;if(route?.kind!=='squeek')return null;const saved=win.history.state?.holderWatch;if(saved?.profile===route.profile&&saved?.id===route.id)return saved.address==null?null:watchAddress(saved.address);return state.watchOnly?activeWatchRoute:null;}
  function rememberWatch(route,address){if(route?.kind==='squeek')win.history.replaceState({...win.history.state,holderWatch:{profile:route.profile,id:route.id,address}},'',win.location.hash);}
  const onHashChange = async () => {try{const key=profileFromHash(win.location.hash),route=holderRoute(win.location.hash),watched=watchScope(route);let leftWatch=false,watchChanged=false;$('holder-route-error').classList.add('hidden');rememberWatch(route,watched);
    if(watched){const changed=!state.watchOnly||state.inspected?.toLowerCase()!==watched.toLowerCase();state.watchOnly=true;activeWatchRoute=watched;state.inspected=watched;if(changed){watchChanged=true;resetLoad();state.net=state.status=state.plan=null;renderHolder(null);}}
    else if(activeWatchRoute||state.watchOnly){leftWatch=true;activeWatchRoute=null;state.watchOnly=false;state.inspected=state.account;resetLoad();renderHolder(null);}
    if(key&&key!==state.profileKey)await switchProfile(key);else selectTab(currentRoute());
    if(route?.kind==='address'&&(watchChanged||!state.status)||leftWatch)await refreshWallet();
  }catch(error){routeError(error);}};
  win.addEventListener('hashchange', onHashChange);
  for (const tab of el.tabs) {
    tab.onclick = () => {if(state.watchOnly&&state.inspected){win.location.hash=`${watchHash(state.profileKey,state.inspected)}/${tab.dataset.tab}`;void onHashChange();}else{win.location.hash = `${state.profileKey}/${tab.dataset.tab}`;selectTab(tab.dataset.tab);} };
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
    if(id==='activity-drawer')void ensureWorkspace().then(w=>w.history());
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
  el.profileSelect.onchange = () => switchProfile(el.profileSelect.value, { preserveWallet: true, syncWallet: true });
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
  $('btn-open-activity').onclick = $('holder-history-link').onclick = () => openSheet('activity-drawer');
  $('btn-disconnect').onclick = () => {
    const p=provider();wallet.disconnect();void p?.request({method:'wallet_revokePermissions',params:[{eth_accounts:{}}]}).catch(()=>{});
    $('account-activity').replaceChildren();closeWalletMenu();selectTab('squeeks');el.connect.focus();
  };
  el.refresh.onclick = () => {void refreshTelemetry({reset:false});return viewTask(()=>refreshAll({force:true}));};
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
  $('holder-retry').onclick = () => viewTask(()=>refreshWallet({force:true}));
  $('btn-switch-chain').onclick = () => {closeWalletMenu();return viewTask(requestProfileChain);};
  el.holder.owner.onclick=async()=>{const address=el.holder.owner.title;if(!address)return;try{await win.navigator.clipboard.writeText(address);toast('Address copied','ok');}catch{toast('Clipboard unavailable','warn');}};
  $('btn-exit-watch').onclick = () => viewTask(async()=>{
    state.watchOnly=false;activeWatchRoute=null;state.inspected=state.account;resetLoad();el.holder.watchInput.value='';renderHolder(null);win.history.pushState(null,'',`#${state.profileKey}/squeeks`);selectTab('squeeks');
    await refreshWallet();
  });
  el.holder.watch.onclick = async () => {
    const value = el.holder.watchInput.value.trim();
    try{const address=watchAddress(value);win.location.hash=watchHash(state.profileKey,address);await onHashChange();}catch(error){toast(error.message,'err');}
  };
  $('holder-copy-link').onclick=async()=>{try{await win.navigator.clipboard.writeText(new URL(watchHash(state.profileKey,state.inspected??state.account),win.location.href).href);toast('Link copied','ok');}catch{toast('Clipboard unavailable','warn');}};
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
  async function loadHolderImage(token,load=captureLoad(),stage=0){let item;try{item=await images.load({profile:getProfile(load.profileKey),token,stage,api:displayApi(load)??state.adapter?.holderApi,fallback:()=>readFor(load,'art',token.tokenId),signal:load.signal});}catch(error){if(isCurrent(load)&&error.name==='RpcTrustError')clearDisplayMismatch(error);throw error;}assertCurrent(load);state.art.set(String(token.tokenId),item);return item;}
  const canUseHolder=()=>Boolean(!watching()&&!state.busy&&!state.walletPromptPending&&!win.history.state?.exploreReadOnly&&state.account&&state.chainId===11155111);
  async function selectPlannerStep(step,load){try{assertCurrent(load);if(!canUseHolder())return;const fresh=await readFor(load,'walletStatus',state.account);assertCurrent(load);if(step.kind==='custody'){const token=fresh.squeeks.find(t=>String(t.tokenId)===step.tokenId);if(!token||Boolean(token.deposited)!==(step.action==='withdraw'))throw new Error('Pair changed');renderHolder(fresh,fresh.mergePlan);holdings.selectAction(step.action,[token.tokenId]);return;}const a=fresh.squeeks.find(t=>String(t.tokenId)===step.survivor),b=fresh.squeeks.find(t=>String(t.tokenId)===step.donor);if(!a||!b||a.level!==b.level||Boolean(a.deposited)!==Boolean(b.deposited))throw new Error('Pair changed');renderHolder(fresh,fresh.mergePlan);holdings.selectPair(a.tokenId,b.tokenId);if(a.deposited){$('v9-action').value='mergeDeposited';renderActionFields();}else{$('v9-action').value='merge';renderActionFields();}$('merge-selection').scrollIntoView?.({block:'center'});}catch(error){toast(errorMessage(error),'err');}}
  let explore,exploreReady;
  async function ensureExplore(){exploreReady??=import('./explore.js').then(({createExploreView})=>explore=createExploreView({doc,win,root:$('explore-content'),capture:captureLoad,current:isCurrent,readerOptions:load=>({profile:getProfile(load.profileKey),rpcUrl:store.get('wheelhouse:rpc')||undefined,signal:load.signal,chainCache,verificationCache}),loadImage:(token,stage)=>loadHolderImage(token,captureLoad(),stage),source:recordSource,onTrustError:clearDisplayMismatch}));return exploreReady;}
  async function ensureWorkspace(){workspaceReady??=import('./holder-workspace.js').then(({initHolderWorkspace})=>workspace=initHolderWorkspace({doc,win,state,captureLoad,isCurrent,read:readFor,getApi:load=>displayApi(load)??state.adapter?.holderApi,loadImage:loadHolderImage,canAct:canUseHolder,getIndexedHistory:id=>win.history.state?.exploreReadOnly?(explore?.history(id)??Promise.resolve({unknown:true,rows:[]})):null,onPair:selectPlannerStep,onAction:async(action,id)=>{if(!canUseHolder())return;selectTab('squeeks');if(action==='claim')return viewTask(()=>requestClaim([id]));const load=captureLoad(),fresh=await readFor(load,'walletStatus',state.account);if(!fresh.squeeks.some(t=>String(t.tokenId)===id))return;renderHolder(fresh,fresh.mergePlan);holdings.selectAction(action,[id]);},onOverview:()=>{win.location.hash=`${state.profileKey}/squeeks`;selectTab('squeeks');},onError:error=>{if(error.name==='RpcTrustError')clearDisplayMismatch(error);},local:()=>activity.list(),quote:!adapterFactory?(load,owner)=>readFor(load,'claimPreview',owner):state.adapter?.holderClaimPreview?(load,owner)=>viewAwait(load,()=>load.adapter.holderClaimPreview(owner)):null}));return workspaceReady;}
  const holdings=createHoldings({doc,win,state,onSelection:updatePreviewGate,onConnect:()=>viewTask(connect),onMerge:()=>$('btn-custom-merge').click(),onAction:action=>{$('v9-action').value=action;renderActionFields();$('v9-review').focus();},loadImage:(token,stage)=>loadHolderImage(token,captureLoad(),stage),onPairs:()=>ensureWorkspace().then(w=>w.planner())});
  $('btn-planner').onclick=()=>ensureWorkspace().then(w=>w.planner());
  $('sqk-claim-host').append($('btn-claim'),$('claim-ids'),$('holder-rewards-notice'));
  // ── boot ──────────────────────────────────────────────────────────────────
  store.set("squeekchain:profile", state.profileKey);
  applyTheme(store.get(THEME_KEY) ?? "light");
  renderProfileOptions();
  renderWalletChip();
  try{const initial=holderRoute(win.location.hash),watched=watchScope(initial);rememberWatch(initial,watched);if(watched){state.watchOnly=true;activeWatchRoute=watched;state.inspected=watched;}}catch(error){routeError(error);}
  state.adapter = buildAdapter(state.profileKey);
  renderNetworkPlaceholder();
  renderDeploymentVisibility();
  if (state.adapter) refreshAll().then(() => { if (!destroyed) renderToolOptions(); });
  if(adapterFactory)void refreshTelemetry();
  renderActivity(activity.list());
  void activity.refresh();
  let provisionalResult,liveMeasurement;
  function renderProvisional(result=provisionalResult){provisionalResult=result;const active=liveMeasurement?.freshness==='online'&&liveMeasurement.coreStatus==='ACTIVE'&&Date.now()-Date.parse(liveMeasurement.receivedAt)<120000;const text=formingBlock(result?.data,active);$('provisional-blocks').textContent=text??'';$('provisional-blocks').classList.toggle('hidden',!text);}
  const poller=createWheelPoller({enabled:()=>Boolean(getProfile(state.profileKey).apiBase),doc,setTimer:win.setTimeout.bind(win),clearTimer:win.clearTimeout.bind(win),
    contextKey:()=>`${generation}:${state.profileKey}`,
    readStatus:async()=>{const load=captureLoad();if(!getProfile(load.profileKey).apiBase)throw new Error('No wheel reading for this profile');const api=displayApi(load);const result=api?await api.status():{data:await telemetry.read({signal:load.signal})};assertCurrent(load);return result;},
    readBlocks:adapterFactory?null:async()=>displayApi(captureLoad()).blocks(),
    frontier:()=>({settled:state.net?.core?.settledThroughRound,processed:state.net?.mining?.processedThroughRound}),
    onStatus:async(data,result)=>{void explore?.tick();recordSource('Wheel','api',result.stale?'Cached response; live request unavailable':null);void refreshNetworkExtras();workspace?.updatePace(result.stale?null:data);liveMeasurement=result.stale?null:data.measurement;renderProvisional();wheelReading(captureLoad(),data,result);},
    onFrontier:async()=>{const net=await refreshNetwork();if(!net||net.source?.stale)return false;await refreshAll();if(state.inspected&&!state.status)return false;if(provisionalResult)renderProvisional(provisionalResult);if(activity.list().some(item=>!['confirmed','reverted'].includes(item.status)))void activity.refresh();return true;},
    onBlocks:renderProvisional,
    onError:(error,scope)=>{
      if(scope==='status')void explore?.tick();
      if(error.name==='AbortError'||!getProfile(state.profileKey).apiBase)return;
      recordSource(scope==='status'?'Wheel':'Live wheel','api',error.message);
      if(error.name==='RpcTrustError'){
        if(state.net?.source?.kind!=='rpc'||state.net.verification?.trusted!==true)clearDisplayMismatch(error);
        recordSource(scope==='status'?'Wheel':'Live wheel','api',error.message);clearWheelFeed();
      }
      if(scope==='status'){liveMeasurement=null;renderProvisional();wheelFailure(captureLoad());}
    }
  });
  if(adapterFactory)poller.start();else void poller.tick();

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
    requestAction: (action,input) => watching()?Promise.resolve({ok:false,reason:'Viewing only'}):viewTask(()=>requestAction(action,input)),
    requestCheckpoint: () => viewTask(requestCheckpoint),
    requestClaim: ids => viewTask(() => requestClaim(ids)),
    requestMerge: pair => viewTask(() => requestMerge(pair)),
    selectTab,
    destroy: () => { explore?.destroy();workspace?.destroy();unsubscribeWallet();wallet.destroy();holdings.destroy();images.destroy();headerObserver?.disconnect();win.removeEventListener('resize',positionBanner);win.removeEventListener('scroll',positionBanner);dialog.close(); closeSheet(); win.removeEventListener('hashchange', onHashChange); win.removeEventListener('message', onToolMessage); themeMedia?.removeEventListener?.('change', onSystemTheme); doc.removeEventListener('click', onDocumentClick); doc.removeEventListener('keydown', onOverlayKey); doc.removeEventListener('focusin', onSheetFocus); destroyed = true; generation++; loadController.abort(); activity.destroy(); poller.stop(); },
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
