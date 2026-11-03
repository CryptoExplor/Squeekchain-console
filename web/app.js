/**
 * Wheelhouse — a Squeekchain holder console.
 *
 * Profile-driven: each deployment profile maps onto an adapter with the same surface
 * (verify / networkStatus / walletStatus / optional owner actions / optional art).
 *   sepolia      → live graph, issuance v9 + staking + new NFT  (reads + art; owner actions gated)
 *   sepolia-v6   → the docs-pinned SqueekMining v6 graph        (reads + checkpoint/claim/merge)
 *   mainnet      → no deployment
 *
 * Every action is simulated first and signed in the user's wallet. No key ever reaches this code.
 */
import {
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
} from "./bundle.js";

import { Panel, Stat, Table, TokenCard, ConfirmDialog, Toast, UNKNOWN, valueText, formatNumber, formatAmount } from './components.js';
import { createActivity } from "./activity.js";
import { createTelemetry, telemetryView } from "./telemetry.js";

const EXPLORER = "https://eth-sepolia.blockscout.com";
const THEME_KEY = "squeekchain:theme";

export function mount({ doc = document, win = window, adapterFactory, fetcher = globalThis.fetch, activityReader } = {}) {
  const $ = (id) => doc.getElementById(id);
  const el = {
    profileSelect: $("profile-select"),
    verified: $("verified-chip"),
    walletChip: $("wallet-chip"),
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
      plan: $("btn-plan"),
      hint: $("holder-hint"),
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

  const state = {
    profileKey: getProfile(store.get("squeekchain:profile") ?? DEFAULT_PROFILE).key,
    adapter: null,
    account: null,
    chainId: null,
    inspected: null,
    net: null,
    status: null,
    plan: null,
    art: new Map(),
    busy: false, // transaction signing ONLY; never used to gate reads or navigation
    receipts: [],
    artifactsLoaded: false,
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  const toast = (msg, kind = "") => Toast({ doc, host: el.toasts, message: msg, kind });
  const showBanner = (msg, kind = "") => {
    el.banner.textContent = msg;
    el.banner.className = `notice ${kind}`;
  };
  const hideBanner = () => el.banner.classList.add("hidden");
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : UNKNOWN);
  const num = formatNumber;
  const sqk = formatAmount;
  const setStat = (node, value, formatter = valueText) => Stat(node.closest('.stat')).set(value, formatter);
  const json = (v) => JSON.stringify(v, null, 2);
  const showOut = (node, value) => {
    node.textContent = typeof value === "string" ? value : json(value);
    node.classList.remove("hidden");
  };
  const errorMessage = (err) => `${err?.message ?? err}${err?.revert ? ` → ${err.revert.name}(${err.revert.args.join(", ")})` : ""}`;
  const provider = () => win.ethereum ?? null;

  // ── theme ──────────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    theme = theme === "dark" ? "dark" : "light";
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
    store.set(THEME_KEY, theme);
  }
  el.theme.onclick = () => applyTheme(doc.documentElement.dataset.theme === "dark" ? "light" : "dark");

  // ── profile switching ──────────────────────────────────────────────────────
  let generation = 0;
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
  const readFor = (load, method, ...args) => viewAwait(load, () => load.adapter[method](...args));
  let destroyed = false;
  const telemetry = createTelemetry({ fetcher });
  const verificationCache = new Map();
  const chainCache = new Map();
  const discoveryCache = createDiscoveryStore(win.indexedDB);
  let receiptContext, receiptRpcUrl;
  const activity = createActivity({ storage: store, onChange: renderActivity, receiptReader: activityReader ?? (async (item, { signal }) => {
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
    $('activity-panel').classList.toggle('hidden', items.length === 0);
    $('activity-list').replaceChildren(...items.map(item => {
      const row = doc.createElement('li');
      const link = doc.createElement('a');
      link.href = `${EXPLORER}/tx/${item.hash}`; link.target = '_blank'; link.rel = 'noreferrer';
      link.textContent = `${item.label} · ${item.hash.slice(0, 10)}…`;
      const detail = doc.createElement('span');
      detail.textContent = `${item.chain ?? 'Sepolia'} · ${item.status}${item.receiptStatus === 'reverted' && item.status === 'mined' ? ' (reverted)' : ''} · ${item.time}${item.lastError ? ` · ${item.lastError}` : ''}`;
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
        option.textContent = p.label;
        // Mainnet remains selectable as an honest launch-status view.
        return option;
      }),
    );
    el.profileSelect.value = state.profileKey;
    const profile = getProfile(state.profileKey), badge = $("profile-status");
    badge.textContent = profile.kind === 'supported' ? 'Supported' : profile.addresses ? 'Read-only' : 'Not deployed';
    badge.className = `chip ${profile.kind === 'supported' ? 'ok' : 'warn'}`;
  }

  async function switchProfile(profileKey) {
    // Navigation ALWAYS wins, including while a simulation or wallet prompt is pending.
    loadController.abort();
    generation++;
    loadController = new AbortController();
    dialog.close();
    state.profileKey = getProfile(profileKey).key;
    state.adapter = null;
    state.account = state.chainId = state.inspected = null;
    state.net = state.status = state.plan = null;
    state.receipts = [];
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
    el.holder.hint.textContent = el.holder.mergeNote.textContent = "";
    for (const id of ["claim-ids", "merge-survivor", "merge-donor", "watch-input", "art-token", "tool-args", "modal-input"]) $(id).value = "";
    el.modal.body.replaceChildren();
    el.modal.title.textContent = "";
    el.toasts.replaceChildren();
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
    for (const node of [el.connect, el.refresh, ...doc.querySelectorAll('[data-go], .rpc-settings')]) node.classList.toggle("hidden", !deployed);
    el.verified.classList.toggle('hidden', !deployed);
    doc.querySelector('.network-strip').classList.toggle('hidden', !deployed);
    if (!deployed) {
      el.panels.forEach(panel => panel.classList.add("hidden"));
      updateHeroVisibility(null);
    }
    else selectTab(store.get("squeekchain:tab") ?? "overview");
  }

  const capabilities = () => getProfile(state.profileKey).capabilities;

  function renderNetworkPlaceholder() {
    const profile = getProfile(state.profileKey);
    el.net.settlement.textContent = "";
    el.net.settlement.classList.add("hidden");
    for (const key of ["round", "blocks", "lag", "issued", "squeeks", "paused"]) el.net[key].textContent = UNKNOWN;
    el.net.paused.parentElement.className = "stat";
    el.cp.button.disabled = true;
    el.cp.reason.textContent = profile.addresses ? "Waiting for verified chain state." : "Unavailable until a mainnet deployment is published and verified.";
    el.verified.textContent = profile.addresses ? "verifying…" : "not deployed";
    el.verified.className = "chip";
    $("network-context").textContent = profile.chainId === 1 ? "MAINNET · NOT DEPLOYED" : profile.kind === "supported" ? "SEPOLIA · V6 SUPPORTED" : "SEPOLIA · V9 UNVERIFIED";
    $("network-mode").textContent = profile.chainId === 1 ? "Waiting for an official deployment record." : "Read freely. Sign only what you understand.";
    renderCapabilities(profile);
    el.net.chain.textContent = profile.chainId === CHAIN.id ? "Sepolia" : "Ethereum";
    el.net.kind.textContent = profile.kind;
    el.net.release.textContent = profile.identities?.release ?? (profile.addresses ? "docs-pinned v6" : "no deployment");
    el.net.notice.textContent = profile.notes ?? "";
    el.net.notice.className = `notice ${profile.kind === "supported" ? "" : "warn"}`;
  }

  function renderCapabilities(profile) {
    const cards = [
      ["Claim SQK", "claim", "Simulated claims in batches of up to 32 IDs."],
      ["Merge Squeeks", "merge", "Keep one ID. Permanently burn the donor. Raise the level."],
      ["Staking", "deposit", "Deposit and withdrawal flows need published deployment docs."],
      ["DotGrid art", "art", "Read deterministic artwork and traits through tokenURI."],
    ];
    $("capability-grid").replaceChildren(...cards.map(([title, cap, description]) => {
      const card = doc.createElement("div"); card.className = "capability";
      const heading = doc.createElement("h3"); heading.textContent = title;
      const badge = doc.createElement("span"); badge.className = `chip ${profile.capabilities[cap] ? "ok" : "warn"}`;
      badge.textContent = profile.capabilities[cap] ? "Supported" : profile.addresses ? "Awaiting published docs" : "Not deployed";
      const note = doc.createElement("p"); note.textContent = description;
      card.append(heading, badge, note); return card;
    }));
  }

  async function refreshTelemetry({ reset = true } = {}) {
    const load = captureLoad();
    const enabled = state.profileKey === "sepolia";
    if (reset || !enabled) {
      for (const id of ["wheel-rpm", "wheel-speed", "wheel-distance"]) $(id).textContent = UNKNOWN;
      $("wheel-state").textContent = enabled ? "Loading" : "Unavailable";
      $("wheel-note").textContent = enabled ? "Reading official device telemetry…" : "Device telemetry belongs to the live Sepolia deployment only.";
    }
    if (!enabled) return;
    try {
      const view = telemetryView(await viewAwait(load, () => telemetry.read({ signal: load.signal })));
      if (!isCurrent(load)) return;
      $("wheel-state").textContent = view.state;
      $("wheel-rpm").textContent = view.rpm;
      $("wheel-speed").textContent = view.speed;
      $("wheel-distance").textContent = view.distance;
      $("wheel-note").textContent = view.note;
    } catch (err) {
      if (!isCurrent(load)) return;
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

  let walletListenersRegistered = false;
  async function connect() {
    const load = captureLoad();
    if (!state.adapter) { showBanner("Mainnet is not deployed. Select Sepolia to connect and inspect.", "warn"); return null; }
    const p = provider();
    if (!p) {
      showBanner(
        "No injected wallet in this page. Inside a sandboxed preview iframe extensions often stay out — open the app in its own browser tab and connect there. Read-only inspection works without a wallet.",
      );
      return null;
    }
    try {
      const accounts = await viewAwait(load, () => p.request({ method: "eth_requestAccounts" }));
      await viewAwait(load, () => ensureChain(p, load.profileKey));
      const chainId = Number(await viewAwait(load, () => p.request({ method: "eth_chainId" })));
      state.account = accounts?.[0] ?? null;
      state.chainId = chainId;
      state.inspected = state.account;
      if (!walletListenersRegistered) {
      p.on?.("accountsChanged", (accs) => {
        if (!state.account || !state.adapter || destroyed) return;
        dialog.close();
        state.account = accs?.[0] ?? null;
        state.inspected = state.account;
        state.status = null;
        renderWalletChip();
        refreshWallet();
      });
      p.on?.("chainChanged", () => { state.adapter?.invalidateChain?.(); if (!state.account || destroyed) return; dialog.close(); void refreshAll(); });
      walletListenersRegistered = true;
      }
      hideBanner();
      renderWalletChip();
      await refreshWallet();
      return state.account;
    } catch (err) {
      if (!isCurrent(load)) return null;
      showBanner(`Wallet connection failed: ${errorMessage(err)}`, "bad");
      return null;
    }
  }

  function renderWalletChip() {
    el.connect.textContent = state.account ? "Disconnect" : "Connect wallet";
    el.walletChip.textContent = state.account ? short(state.account) : "";
    el.walletChip.className = `chip ${state.account ? "ok" : "hidden"}`;
    el.walletChip.title = state.account ?? "";
  }

  async function sendTransaction(tx, label, owner = state.account, load = captureLoad()) {
    assertCurrent(load);
    const p = provider();
    if (!p || !state.account) throw new Error("connect a wallet to sign");
    if (state.busy) throw new Error("A wallet signing request is already pending");
    state.busy = true;
    if (state.net) renderNetwork(state.net);
    let hash;
    try {
      await ensureChain(p, load.profileKey);
      assertCurrent(load);
      const accounts = await p.request({ method: "eth_accounts" });
      assertCurrent(load);
      if (!owner || state.account?.toLowerCase() !== owner.toLowerCase() || accounts?.[0]?.toLowerCase() !== owner.toLowerCase()) throw new Error("Wallet changed; start again");
      // A profile switch cannot cancel this wallet popup or an already-broadcast transaction.
      hash = await p.request({ method: "eth_sendTransaction", params: [{ from: owner, to: tx.to, data: tx.data, value: `0x${BigInt(tx.value ?? 0).toString(16)}` }] });
      // Persist BEFORE checking profile generation. Even a late wallet response belongs in Activity.
      activity.record(hash, label, CHAIN.id);
      void activity.refresh();
    } finally {
      state.busy = false;
      if (isCurrent(load)) {
        if (state.net) renderNetwork(state.net);
        renderHolder(state.status, state.plan);
      }
    }
    assertCurrent(load);
    toast(`${label} submitted ${hash.slice(0, 12)}…`);
    const receipt = await viewAwait(load, () => activity.wait(hash));
    const ok = receipt.receiptStatus === "success";
    if (!ok) throw new Error(`${label} reverted. Stopped; no changed-input retry.`);
    const result = { hash, ok, blockNumber: receipt.blockNumber, status: receipt.status };
    state.receipts.push(result);
    toast(`${label} mined in block ${receipt.blockNumber}. Activity tracks confirmations.`, "ok");
    return result;
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  function renderNetwork(net) {
    state.net = net;
    renderNetworkPlaceholder();
    const core = net.core ?? {}, mining = net.mining ?? {}, checkpoint = net.checkpoint ?? {};
    setStat(el.net.round, core.settledThroughRound);
    if (getProfile(state.profileKey).abiSet === "v6" && /^\d+$/.test(String(core.settledThroughRound))) {
      let note = `Settlement frontier at round ${core.settledThroughRound}.`;
      if (checkpoint.canCheckpoint === false && checkpoint.roundSettled === false && String(mining.lagRounds) === "0") {
        note += " No new rewards are being issued on this deployment at this snapshot: the next round is not settled. Existing rewards may still be claimable.";
      } else if (checkpoint.canCheckpoint === true) {
        note += " Settled rounds are available to checkpoint; new rewards may be issued after a successful checkpoint.";
      } else {
        note += " Reward issuance depends on live settlement and checkpoint readiness; this reading does not establish a permanent freeze.";
      }
      el.net.settlement.textContent = note;
      el.net.settlement.classList.remove("hidden");
    }
    setStat(el.net.blocks, core.blockHeight, num);
    setStat(el.net.lag, mining.lagRounds, value => num(value) === UNKNOWN ? UNKNOWN : `${num(value)} round(s)`);
    setStat(el.net.issued, mining.issued ?? mining.minted, sqk);
    setStat(el.net.squeeks, net.nft?.totalSupply, num);
    setStat(el.net.paused, core.paused, value => value === true ? 'yes' : value === false ? 'no' : UNKNOWN);
    el.net.paused.parentElement.className = `stat ${core.paused === true ? 'bad' : core.paused === false ? 'ok' : ''}`;

    const caps = capabilities();
    const canCp = Boolean(caps.checkpoint && checkpoint.canCheckpoint === true);
    el.cp.button.disabled = state.busy || !canCp;
    el.cp.reason.textContent = caps.checkpoint
      ? checkpoint.canCheckpoint
        ? `next round ${valueText(checkpoint.nextRound)} is settled — a checkpoint will fund it`
        : checkpoint.reason ?? UNKNOWN
      : `${checkpoint.contract ?? "issuance"} checkpoint is read-only here: v9 flows are undocumented, so this build will not guess. Status: ${checkpoint.reason ?? UNKNOWN}.`;
    el.cp.explain.textContent =
      "Turns settled rounds into issued SQK. Holders cannot claim until someone checkpoints, so this is the job a wallet without Squeeks can do.";
  }

  function renderWalletChipStats(status) {
    if (!status || !state.account) return;
    el.walletChip.textContent = `${short(status.owner)} · ${num(status.ethBalance?.eth) === UNKNOWN ? UNKNOWN : `${Number(status.ethBalance.eth).toFixed(3)} ETH`}`;
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

  function renderHolder(status, plan = null) {
    state.status = status;
    state.plan = plan;
    const caps = capabilities();
    const isV9 = getProfile(state.profileKey).abiSet === 'v9';
    el.holder.power.parentElement.querySelector('.label').textContent = isV9 ? 'Deposited' : 'Power';
    el.holder.owner.textContent = valueText(status?.owner);
    el.holder.empty.classList.toggle("hidden", Boolean(status));
    el.holder.body.classList.toggle("hidden", !status);
    if (!status) {
      for (const node of [el.holder.count, el.holder.power, el.holder.share, el.holder.claimable]) setStat(node, null);
      el.holder.tbody.replaceChildren(); el.holder.head.replaceChildren(); el.holder.mergeList.replaceChildren();
      el.holder.claim.disabled = true; $("btn-custom-merge").disabled = true; return;
    }
    const totals = status.totals ?? {};

    const has = num(totals.count) !== UNKNOWN && Number(totals.count) > 0;
    const signerOwns = Boolean(state.account && status.owner?.toLowerCase() === state.account.toLowerCase());
    setStat(el.holder.count, totals.count, num);
    setStat(el.holder.power, isV9 ? totals.deposited : totals.power, num);
    setStat(el.holder.share, totals.sharePercent, value => num(value, 4) === UNKNOWN ? UNKNOWN : `${num(value, 4)}%`);
    setStat(el.holder.claimable, totals.claimable, sqk);
    el.holder.hint.textContent = num(totals.count) === UNKNOWN ? "Holdings count Unknown; actions remain disabled." : !has
      ? "this address owns no Squeeks — it can still run checkpoints"
      : !caps.claim
        ? "v9 claims are staking-side and undocumented — this build stays read-only for owner actions"
        : signerOwns
          ? totals.estimatedSqkPerDay
            ? `≈${num(totals.estimatedSqkPerDay)} SQK/day at current share`
            : ""
          : "read-only view: connect this wallet to claim or merge";
    el.holder.claim.disabled = state.busy || !has || !signerOwns || !caps.claim;
    $("btn-custom-merge").disabled = state.busy || !has || !signerOwns || !caps.merge;
    $("claim-ids").disabled = !caps.claim;
    el.holder.watchRow.classList.toggle("hidden", Boolean(state.account));

    Table({ head: el.holder.head, body: el.holder.tbody, columns: columnsForProfile(), rows: status.squeeks ?? [], cell: (s, c) => {
      if (c.key === 'claimable') return s.claimable ? num(s.claimable.sqk, 4) : UNKNOWN;
      if (c.key === 'deposited') return s.deposited == null ? UNKNOWN : s.deposited ? 'yes' : 'no';
      if (c.key === 'pendingRound') return s.pendingRound == null ? UNKNOWN : String(s.pendingRound) === '0' ? 'None' : `r${s.pendingRound}`;
      if (c.key === 'art') {
        const btn = doc.createElement('button'); btn.className = 'btn btn-ghost'; btn.textContent = 'View';
        btn.setAttribute('aria-label', `View art for Squeek #${s.tokenId}`);
        btn.onclick = () => { selectTab('art'); viewTask(() => loadArt([s.tokenId])); };
        return btn;
      }
      return s[c.key];
    } });

    // merge plan
    el.holder.mergeList.replaceChildren();
    el.holder.mergeNote.textContent = !caps.merge
      ? "Merge planning is disabled on this profile: v9 merges run on SqueekNFT.merge(survivor, donor) and are not documented yet."
      : (plan?.note ?? "Same-level pairs that already satisfy every onchain precondition.");
    for (const pair of plan?.pairs ?? []) {
      const li = doc.createElement("li");
      const text = doc.createElement("span");
      text.textContent = `keep #${pair.survivor} · burn #${pair.donor} · L${pair.level}→L${pair.nextLevel} · power ${pair.powerBefore}→${pair.powerAfter} (+${pair.powerGainPercent}%)`;
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
      el.verified.textContent = v.trusted === false ? "Unverified" : v.ok ? "verified ✓" : `${v.problems?.length ?? 1} problem(s)`;
      el.verified.className = `chip ${v.trusted === false ? "warn" : v.ok ? "ok" : "bad"}`;
      el.verified.title = v.trusted === false ? "Read-only (unverified): observed identities are not published trust pins. All transactions disabled." : v.ok ? `Published identities fully verified at block ${v.fullVerificationBlockNumber ?? v.blockNumber ?? "unknown"}; proxy slots checked at ${v.blockNumber ?? "unknown"}. Two public RPC block hashes agree for this snapshot.` : (v.problems ?? []).join("; ");
  }

  async function refreshNetwork() {
    if (!state.adapter) return null;
    const load = captureLoad();
    try {
      networkPanel.setBusy(true);
      const net = await readFor(load, "networkStatus");
      const v = net.verification ?? await readFor(load, "verify");
      if (!isCurrent(load)) return null;
      renderNetwork(net);
      renderVerification(v);
      return net;
    } catch (err) {
      if (!isCurrent(load)) return null;
      state.net = null;
      renderNetworkPlaceholder();
      el.verified.textContent = "read failed";
      el.verified.className = "chip bad";
      showBanner(`Read failed: ${errorMessage(err)}. Nothing was signed.`, "bad");
      return null;
    } finally {
      if (isCurrent(load)) networkPanel.setBusy(false);
    }
  }

  async function refreshWallet() {
    const owner = state.inspected ?? state.account;
    if (!state.adapter || !owner) {
      renderHolder(null);
      return null;
    }
    const load = captureLoad();
    try {
      const status = await readFor(load, "walletStatus", owner);
      if (!isCurrent(load) || owner !== (state.inspected ?? state.account)) return null;
      renderWalletChipStats(status);
      let plan = status.mergePlan ?? null;
      if (!plan && capabilities().merge && status.totals?.count > 1 && state.adapter.mergePlan) {
        plan = await readFor(load, "mergePlan", owner, { status });
      }
      if (!isCurrent(load) || owner !== (state.inspected ?? state.account)) return null;
      renderHolder(status, plan);
      if (status.net && status.verification) { renderNetwork(status.net); renderVerification(status.verification); }
      return status;
    } catch (err) {
      if (!isCurrent(load) || owner !== (state.inspected ?? state.account)) return null;
      renderHolder(null);
      renderWalletChip();
      showBanner(`Could not read ${short(owner)}: ${errorMessage(err)}`, "bad");
      return null;
    }
  }

  async function refreshAll() {
    const load = captureLoad();
    if (state.adapter && (state.inspected ?? state.account)) {
      // Production walletStatus includes network state and a pure merge plan from
      // the SAME run/snapshot. Do not pay for a second network/plan snapshot.
      const status = await refreshWallet();
      if (isCurrent(load) && !status?.net) await refreshNetwork();
    } else await refreshNetwork();
  }

  const viewTask = async fn => {
    const load = captureLoad();
    try { return await viewAwait(load, fn); }
    catch (err) {
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
    if (!caps.checkpoint) throw new Error("checkpoint is read-only on this profile (v9 flows undocumented)");
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
    const result = await sendTransaction(preview.tx, "checkpoint()", owner, load);
    await refreshAll();
    return { ok: true, ...result, gas: preview.gas };
  }

  async function requestClaim(tokenIds) {
    const load = captureLoad();
    const caps = capabilities();
    if (!caps.claim) throw new Error("claims are read-only on this profile (v9 staking flows undocumented)");
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
      body: `Claim ${preview.total.sqk} SQK across ${preview.batches.length} transaction(s)? Simulated successfully; your wallet asks next.`,
      confirmLabel: "Sign claim",
    });
    if (!confirmed) return { ok: false, reason: "cancelled" };
    const receipts = [];
    assertCurrent(load);
    for (const batch of preview.batches) {
      if (!isCurrent(load) || state.account?.toLowerCase() !== owner.toLowerCase()) throw new Error("Wallet or profile changed. Stopped.");
      const fresh = await readFor(load, "claimPreview", owner, batch.tokenIds);
      if (!fresh.ok || fresh.batches.length !== 1 || fresh.batches[0].amount.base !== batch.amount.base) throw new Error("Claim outcome changed. Review a fresh preview; no automatic retry.");
      receipts.push(await sendTransaction(fresh.batches[0].tx, `claim(${batch.tokenIds.length} ids)`, owner, load));
    }
    await refreshAll();
    return { ok: true, total: preview.total, receipts };
  }

  async function requestMerge(pair) {
    if (!capabilities().merge) throw new Error("Merges are not supported on this profile.");
    const owner = state.account ?? state.inspected;
    const load = captureLoad();
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
    const result = await sendTransaction(fresh.tx, `merge(${pair.survivor} ← ${pair.donor})`, owner, load);
    await refreshAll();
    return { ok: true, ...result };
  }

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
        const batch = load.adapter.artBatch ? await readFor(load, 'artBatch', ids) : await Promise.all(ids.map(id => readFor(load, 'art', id)));
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
    const caps = capabilities();
    const tools = {
      squeek_network_status: {
        description: "Network state for the active deployment: rounds, block height, checkpoint status, issuance, supply.",
        run: async () => ({ profile: state.profileKey, ...(await state.adapter.networkStatus()) }),
      },
      squeek_verify: {
        description: "Verify implementations, versions and the wiring between contracts for the active deployment.",
        run: async () => state.adapter.verify(),
      },
      squeek_wallet_status: {
        description: "Holdings for an address: Squeeks, levels, cooldowns, power, claimable SQK.",
        run: async (args) => state.adapter.walletStatus(requireOwner(args)),
      },
    };
    if (state.adapter.art) {
      tools.squeek_art = {
        description: "Onchain DotGrid art + traits for a Squeek token (metadata + SVG data URI).",
        run: async (args) => {
          if (!args.tokenId) throw new Error("tokenId is required");
          return state.adapter.art(args.tokenId);
        },
      };
    }
    if (caps.checkpoint) {
      tools.squeek_checkpoint_preview = { description: "Whether checkpoint() can advance now, with unsigned tx + gas.", run: async args => state.adapter.checkpointPreview(args.from ?? state.account ?? undefined) };
      tools.squeek_request_checkpoint = { description: "Open the wallet popup to submit checkpoint(). Works for any wallet.", run: async () => requestCheckpoint() };
    }
    if (caps.claim) {
      tools.squeek_claim_preview = {
        description: "Simulated claim: total SQK and 32-ID batches with gas.",
        run: async (args) => state.adapter.claimPreview(requireOwner(args), args.tokenIds),
      };
      tools.squeek_request_claim = { description: "Open the wallet popup to claim SQK.", run: async (args) => requestClaim(args.tokenIds) };
    }
    if (caps.merge) {
      tools.squeek_merge_plan = { description: "Same-level merge pairs that satisfy every onchain precondition.", run: async (args) => state.adapter.mergePlan(requireOwner(args)) };
      tools.squeek_merge_preview = {
        description: "Simulate one merge (gas + irreversibility warning).",
        run: async (args) => state.adapter.mergePreview(requireOwner(args), args.survivor, args.donor, { confirm: args.confirm }),
      };
      tools.squeek_request_merge = {
        description: "Open the wallet popup to merge a pair. Requires confirm: 'BURN-<donor>'.",
        run: async (args) => {
          if (!args.survivor || !args.donor) throw new Error("survivor and donor are required");
          if (args.confirm !== `BURN-${args.donor}`) throw new Error(`refusing to merge without confirm: "BURN-${args.donor}"`);
          const owner = requireOwner(args);
          const load = captureLoad();
          const plan = await readFor(load, "mergePlan", owner);
          const pair = plan.pairs.find((p) => p.survivor === String(args.survivor) && p.donor === String(args.donor));
          if (!pair) throw new Error("that pair is not currently mergeable");
          return requestMerge(pair);
        },
      };
    }
    return tools;
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

  function updateHeroVisibility(tab) {
    const show = tab === 'overview' && Boolean(getProfile(state.profileKey).addresses);
    for (const node of doc.querySelectorAll('.hero, .page-intro')) node.classList.toggle('hidden', !show);
  }

  // ── tabs + wiring ─────────────────────────────────────────────────────────
  function selectTab(name) {
    if (!el.panels.some(p => p.dataset.panel === name)) name = "overview";
    updateHeroVisibility(name);
    el.tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    el.panels.forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== name));
    store.set("squeekchain:tab", name);
  }
  el.tabs.forEach((t) => (t.onclick = () => selectTab(t.dataset.tab)));
  doc.querySelectorAll("[data-go]").forEach(button => { button.onclick = () => { selectTab(button.dataset.go); doc.querySelector(".tabs").scrollIntoView?.({ behavior: "smooth", block: "start" }); }; });

  el.profileSelect.onchange = () => switchProfile(el.profileSelect.value);
  el.connect.onclick = async () => {
    if (state.account) {
      state.account = null;
      state.inspected = null;
      state.status = null;
      renderWalletChip();
      renderHolder(null);
      return;
    }
    await viewTask(connect);
  };
  el.refresh.onclick = () => { void refreshTelemetry({ reset: false }); return viewTask(refreshAll); };
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
  el.holder.plan.onclick = () => viewTask(refreshWallet);
  el.holder.watch.onclick = async () => {
    const value = el.holder.watchInput.value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return toast("enter a valid 0x address", "err");
    state.inspected = value;
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

  el.agent.run.onclick = async () => {
    let args = {};
    try {
      args = el.agent.args.value.trim() ? JSON.parse(el.agent.args.value) : {};
    } catch {
      return showOut(el.agent.out, { error: "args must be valid JSON" });
    }
    const load = captureLoad();
    const result = await viewTask(() => callTool(el.agent.select.value, args));
    if (isCurrent(load)) showOut(el.agent.out, result);
  };
  el.agent.copy.onclick = async () => {
    const text = json(manifest());
    try {
      await win.navigator.clipboard.writeText(text);
      toast("manifest copied", "ok");
    } catch {
      showOut(el.agent.out, text);
    }
  };

  win.addEventListener("message", async (event) => {
    const msg = event.data;
    if (!msg || msg.type !== "squeek.tool" || typeof msg.name !== "string") return;
    // Embedders can read, but may not trigger wallet requests across origins.
    if (msg.name.startsWith("squeek_request_") && event.origin !== win.location.origin) return;
    const result = await callTool(msg.name, msg.args ?? {});
    const payload = { type: "squeek.result", id: msg.id ?? null, ok: !result?.error, result };
    (event.source ?? win).postMessage(payload, "*");
  });

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

  // Custom RPC is browser-local; never sent to our server. Public peers still cross-check every snapshot.
  $("rpc-url").value = store.get("wheelhouse:rpc") ?? "";
  $("btn-save-rpc").onclick = async () => {
    try {
    const value = $("rpc-url").value.trim();
    if (value) {
      const url = new URL(value);
      if (url.protocol !== "https:" || url.username || url.password) throw new Error("Use an HTTPS RPC URL without embedded credentials");
    }
    store.set("wheelhouse:rpc", value);
    await switchProfile(state.profileKey);
    } catch (err) { showBanner(errorMessage(err), "bad"); }
  };

  // ── boot ──────────────────────────────────────────────────────────────────
  applyTheme(store.get(THEME_KEY) ?? "light");
  renderProfileOptions();
  renderWalletChip();
  state.adapter = buildAdapter(state.profileKey);
  renderNetworkPlaceholder();
  renderDeploymentVisibility();
  if (state.adapter) refreshAll().then(() => { if (!destroyed) renderToolOptions(); });
  void refreshTelemetry();
  renderActivity(activity.list());
  void activity.refresh();
  const activityTimer = win.setInterval?.(() => { if (!destroyed) void activity.refresh(); }, 15_000);

  const telemetryTimer = win.setInterval?.(() => { if (!destroyed) void refreshTelemetry({ reset: false }); }, 15_000);
  const timer = win.setInterval?.(() => {
    if (state.adapter) void refreshAll();
  }, 45_000);

  return {
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
    refresh: refreshAll,
    switchProfile,
    loadArt,
    requestCheckpoint: () => viewTask(requestCheckpoint),
    requestClaim: ids => viewTask(() => requestClaim(ids)),
    requestMerge: pair => viewTask(() => requestMerge(pair)),
    selectTab,
    destroy: () => { dialog.close(); destroyed = true; generation++; loadController.abort(); activity.destroy(); win.clearInterval?.(activityTimer); win.clearInterval?.(timer); win.clearInterval?.(telemetryTimer); },
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
