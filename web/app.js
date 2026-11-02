/**
 * Squeekchain Mining Console.
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
} from "./bundle.js";

const EXPLORER = "https://eth-sepolia.blockscout.com";
const THEME_KEY = "squeekchain:theme";

export function mount({ doc = document, win = window } = {}) {
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
    profileKey: store.get("squeekchain:profile") ?? DEFAULT_PROFILE,
    adapter: null,
    account: null,
    chainId: null,
    inspected: null,
    net: null,
    status: null,
    plan: null,
    art: new Map(),
    busy: false,
    artifactsLoaded: false,
  };

  // ── helpers ────────────────────────────────────────────────────────────────
  const toast = (msg, kind = "") => {
    const node = doc.createElement("div");
    node.className = `toast ${kind}`;
    node.textContent = msg;
    el.toasts.appendChild(node);
    win.setTimeout?.(() => node.remove(), 7000);
  };
  const showBanner = (msg, kind = "") => {
    el.banner.textContent = msg;
    el.banner.className = `notice ${kind}`;
  };
  const hideBanner = () => el.banner.classList.add("hidden");
  const short = (a) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");
  const num = (v, d = 0) => (v === null || v === undefined ? "—" : Number(v).toLocaleString("en-US", { maximumFractionDigits: d }));
  const sqk = (amount) => (amount ? `${num(Number(amount.sqk), 4)} SQK` : "—");
  const json = (v) => JSON.stringify(v, null, 2);
  const showOut = (node, value) => {
    node.textContent = typeof value === "string" ? value : json(value);
    node.classList.remove("hidden");
  };
  const errorMessage = (err) => `${err?.message ?? err}${err?.revert ? ` → ${err.revert.name}(${err.revert.args.join(", ")})` : ""}`;
  const provider = () => win.ethereum ?? null;

  // ── theme ──────────────────────────────────────────────────────────────────
  function applyTheme(theme) {
    doc.documentElement.dataset.theme = theme;
    el.theme.textContent = theme === "dark" ? "☀" : "☾";
    doc.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#0b0b0d" : "#f5f5f7");
    store.set(THEME_KEY, theme);
  }
  el.theme.onclick = () => applyTheme(doc.documentElement.dataset.theme === "dark" ? "light" : "dark");

  // ── profile switching ──────────────────────────────────────────────────────
  function buildAdapter(profileKey) {
    const profile = getProfile(profileKey);
    if (!profile.addresses) return null;
    return profile.abiSet === "v9"
      ? createSqueek9({ profileKey, cache: store })
      : createSqueekchain({ addresses: profile.addresses, cache: store });
  }

  function renderProfileOptions() {
    el.profileSelect.replaceChildren(
      ...Object.values(PROFILES).map((p) => {
        const option = doc.createElement("option");
        option.value = p.key;
        option.textContent = p.label;
        option.disabled = !p.addresses;
        return option;
      }),
    );
    el.profileSelect.value = state.profileKey;
  }

  async function switchProfile(profileKey) {
    state.profileKey = getProfile(profileKey).key;
    store.set("squeekchain:profile", state.profileKey);
    state.adapter = buildAdapter(state.profileKey);
    state.net = state.status = state.plan = null;
    state.art.clear();
    el.art.grid.replaceChildren();
    renderProfileOptions();
    renderNetworkPlaceholder();
    if (!state.adapter) {
      showBanner(getProfile(state.profileKey).notes, "warn");
      return;
    }
    await refreshAll();
  }

  const capabilities = () => getProfile(state.profileKey).capabilities;

  function renderNetworkPlaceholder() {
    const profile = getProfile(state.profileKey);
    el.net.chain.textContent = profile.chainId === CHAIN.id ? "Sepolia" : String(profile.chainId);
    el.net.kind.textContent = profile.kind;
    el.net.release.textContent = profile.identities?.release ?? (profile.addresses ? "docs-pinned v6" : "no deployment");
    el.net.notice.textContent = profile.notes ?? "";
    el.net.notice.className = `notice ${profile.kind === "legacy" ? "warn" : profile.kind === "experimental" ? "" : "bad"}`;
  }

  // ── wallet ────────────────────────────────────────────────────────────────
  async function ensureChain(p) {
    const profile = getProfile(state.profileKey);
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

  async function connect() {
    const p = provider();
    if (!p) {
      showBanner(
        "No injected wallet in this page. Inside a sandboxed preview iframe extensions often stay out — open the app in its own browser tab and connect there. Read-only inspection works without a wallet.",
      );
      return null;
    }
    try {
      const accounts = await p.request({ method: "eth_requestAccounts" });
      await ensureChain(p);
      state.account = accounts?.[0] ?? null;
      state.chainId = Number(await p.request({ method: "eth_chainId" }));
      state.inspected = state.account;
      p.on?.("accountsChanged", (accs) => {
        state.account = accs?.[0] ?? null;
        state.inspected = state.account;
        state.status = null;
        renderWalletChip();
        refreshWallet();
      });
      p.on?.("chainChanged", () => refreshAll());
      hideBanner();
      renderWalletChip();
      await refreshWallet();
      return state.account;
    } catch (err) {
      showBanner(`Wallet connection failed: ${errorMessage(err)}`, "bad");
      return null;
    }
  }

  function renderWalletChip() {
    el.connect.textContent = state.account ? "Disconnect" : "Connect wallet";
    el.walletChip.textContent = state.account ? short(state.account) : "not connected";
    el.walletChip.className = `chip ${state.account ? "ok" : ""}`;
    el.walletChip.title = state.account ?? "";
  }

  async function sendTransaction(tx, label) {
    const p = provider();
    if (!p || !state.account) throw new Error("connect a wallet to sign");
    await ensureChain(p);
    const hash = await p.request({
      method: "eth_sendTransaction",
      params: [{ from: state.account, to: tx.to, data: tx.data, value: `0x${BigInt(tx.value ?? 0).toString(16)}` }],
    });
    toast(`${label} submitted ${hash.slice(0, 12)}…`);
    const receipt = await state.adapter.client.waitForTransactionReceipt({ hash, timeout: 180_000 });
    const ok = receipt.status === "success";
    toast(`${label} ${ok ? "confirmed" : "reverted"} in block ${receipt.blockNumber}`, ok ? "ok" : "err");
    return { hash, ok, blockNumber: String(receipt.blockNumber), gasUsed: String(receipt.gasUsed) };
  }

  // ── modal ─────────────────────────────────────────────────────────────────
  function confirmModal({ title, body, requireText = null, confirmLabel = "Confirm" }) {
    return new Promise((resolve) => {
      el.modal.title.textContent = title;
      el.modal.body.textContent = body;
      el.modal.input.value = "";
      el.modal.input.classList.toggle("hidden", !requireText);
      el.modal.input.placeholder = requireText ? `type ${requireText}` : "";
      el.modal.confirm.textContent = confirmLabel;
      el.modal.confirm.disabled = Boolean(requireText);
      el.modal.root.classList.remove("hidden");
      const cleanup = (value) => {
        el.modal.root.classList.add("hidden");
        el.modal.confirm.onclick = null;
        el.modal.cancel.onclick = null;
        el.modal.input.oninput = null;
        resolve(value);
      };
      el.modal.input.oninput = () => {
        el.modal.confirm.disabled = requireText ? el.modal.input.value.trim() !== requireText : false;
      };
      el.modal.cancel.onclick = () => cleanup(false);
      el.modal.confirm.onclick = () => cleanup(true);
    });
  }

  // ── rendering ─────────────────────────────────────────────────────────────
  function renderNetwork(net) {
    state.net = net;
    renderNetworkPlaceholder();
    el.net.round.textContent = net.core.settledThroughRound;
    el.net.blocks.textContent = num(net.core.blockHeight);
    el.net.lag.textContent = `${net.mining.lagRounds} round(s)`;
    const issued = net.mining.issued ?? net.mining.minted;
    el.net.issued.textContent = issued ? sqk(issued) : "—";
    el.net.squeeks.textContent = net.nft?.totalSupply ? num(net.nft.totalSupply) : "—";
    el.net.paused.textContent = net.core.paused ? "yes" : "no";
    el.net.paused.parentElement.className = `stat ${net.core.paused ? "bad" : "ok"}`;

    const caps = capabilities();
    const canCp = Boolean(caps.checkpoint && net.checkpoint.canCheckpoint);
    el.cp.button.disabled = state.busy || !canCp;
    el.cp.reason.textContent = caps.checkpoint
      ? net.checkpoint.canCheckpoint
        ? `next round ${net.checkpoint.nextRound} is settled — a checkpoint will fund it`
        : net.checkpoint.reason
      : `${net.checkpoint.contract ?? "issuance"} checkpoint is read-only here: v9 flows are undocumented, so this build will not guess. Status: ${net.checkpoint.reason ?? "round settled"}.`;
    el.cp.explain.textContent =
      "Turns settled rounds into issued SQK. Holders cannot claim until someone checkpoints, so this is the job a wallet without Squeeks can do.";
  }

  function renderWalletChipStats(status) {
    if (!status) return;
    el.walletChip.textContent = `${short(status.owner)} · ${Number(status.ethBalance.eth).toFixed(3)} ETH`;
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

  function renderHolder(status, plan) {
    state.status = status;
    state.plan = plan;
    const caps = capabilities();
    el.holder.owner.textContent = status ? status.owner : "—";
    el.holder.empty.classList.toggle("hidden", Boolean(status));
    el.holder.body.classList.toggle("hidden", !status);
    if (!status) return;

    const has = status.totals.count > 0;
    const signerOwns = Boolean(state.account && status.owner.toLowerCase() === state.account.toLowerCase());
    el.holder.count.textContent = num(status.totals.count);
    el.holder.power.textContent = status.totals.power ? num(status.totals.power) : status.totals.deposited ? `${num(status.totals.deposited)} deposited` : "0";
    el.holder.share.textContent = status.totals.sharePercent === null || status.totals.sharePercent === undefined ? "—" : `${status.totals.sharePercent}%`;
    el.holder.claimable.textContent = sqk(status.totals.claimable);
    el.holder.hint.textContent = !has
      ? "this address owns no Squeeks — it can still run checkpoints"
      : !caps.claim
        ? "v9 claims are staking-side and undocumented — this build stays read-only for owner actions"
        : signerOwns
          ? status.totals.estimatedSqkPerDay
            ? `≈${num(status.totals.estimatedSqkPerDay)} SQK/day at current share`
            : ""
          : "read-only view: connect this wallet to claim or merge";
    el.holder.claim.disabled = state.busy || !has || !signerOwns || !caps.claim;
    el.holder.watchRow.classList.toggle("hidden", Boolean(state.account));

    // table
    const cols = columnsForProfile();
    const headRow = doc.createElement("tr");
    cols.forEach((c) => {
      const th = doc.createElement("th");
      th.textContent = c.label;
      if (c.num) th.className = "num";
      headRow.appendChild(th);
    });
    el.holder.head.replaceChildren(headRow);
    el.holder.tbody.replaceChildren();
    for (const s of status.squeeks) {
      const tr = doc.createElement("tr");
      for (const c of cols) {
        const td = doc.createElement("td");
        if (c.num) td.className = "num";
        if (c.key === "claimable") td.textContent = s.claimable ? num(Number(s.claimable.sqk), 4) : "—";
        else if (c.key === "deposited") td.textContent = s.deposited ? "yes" : "no";
        else if (c.key === "pendingRound") td.textContent = s.pendingRound && s.pendingRound !== "0" ? `r${s.pendingRound}` : "—";
        else if (c.key === "art") {
          const btn = doc.createElement("button");
          btn.className = "btn btn-ghost";
          btn.style.padding = "2px 8px";
          btn.textContent = "view";
          btn.onclick = () => loadArt([s.tokenId]);
          td.appendChild(btn);
        } else td.textContent = s[c.key] ?? "—";
        tr.appendChild(td);
      }
      el.holder.tbody.appendChild(tr);
    }

    // merge plan
    el.holder.mergeList.replaceChildren();
    el.holder.mergeNote.textContent = !caps.merge
      ? "Merge planning is disabled on this profile: v9 merges run on SqueekNFT.merge(survivor, donor) and are not documented yet."
      : (plan?.note ?? "Same-level pairs that already satisfy every onchain precondition.");
    for (const pair of plan?.pairs ?? []) {
      const li = doc.createElement("li");
      const text = doc.createElement("span");
      text.innerHTML = `keep <strong>#${pair.survivor}</strong> · burn <strong>#${pair.donor}</strong> · L${pair.level}→L${pair.nextLevel} · power ${pair.powerBefore}→${pair.powerAfter} <span class="gain">+${pair.powerGainPercent}%</span>`;
      if (signerOwns && caps.merge) {
        const button = doc.createElement("button");
        button.className = "btn btn-danger";
        button.textContent = "Merge";
        button.onclick = () => withBusy(() => requestMerge(pair));
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
  async function refreshNetwork() {
    if (!state.adapter) return null;
    try {
      const net = await state.adapter.networkStatus();
      renderNetwork(net);
      const v = await state.adapter.verify();
      el.verified.textContent = v.ok ? "verified ✓" : `${v.problems.length} problem(s)`;
      el.verified.className = `chip ${v.ok ? (v.trusted === false ? "warn" : "ok") : "bad"}`;
      el.verified.title = v.ok ? (v.trusted === false ? "identities from the official dApp bundle + API, not a published record" : "matches the docs record") : v.problems.join("; ");
      return net;
    } catch (err) {
      el.verified.textContent = "read failed";
      el.verified.className = "chip bad";
      showBanner(`Read failed: ${errorMessage(err)}. Nothing was signed.`, "bad");
      return null;
    }
  }

  async function refreshWallet() {
    const owner = state.inspected ?? state.account;
    if (!state.adapter || !owner) {
      renderHolder(null);
      return null;
    }
    try {
      const status = await state.adapter.walletStatus(owner);
      renderWalletChipStats(status);
      let plan = null;
      if (capabilities().merge && status.totals.count > 1 && state.adapter.mergePlan) {
        plan = await state.adapter.mergePlan(owner, { status });
      }
      renderHolder(status, plan);
      return status;
    } catch (err) {
      showBanner(`Could not read ${short(owner)}: ${errorMessage(err)}`, "bad");
      return null;
    }
  }

  async function refreshAll() {
    await refreshNetwork();
    await refreshWallet();
  }

  const withBusy = async (fn) => {
    if (state.busy) return null;
    state.busy = true;
    if (state.net) renderNetwork(state.net);
    try {
      return await fn();
    } catch (err) {
      toast(errorMessage(err), "err");
      showBanner(errorMessage(err), "bad");
      return null;
    } finally {
      state.busy = false;
      if (state.net) renderNetwork(state.net);
    }
  };

  // ── actions ───────────────────────────────────────────────────────────────
  async function requestCheckpoint() {
    const caps = capabilities();
    if (!caps.checkpoint) throw new Error("checkpoint is read-only on this profile (v9 flows undocumented)");
    const preview = await state.adapter.checkpointPreview(state.account ?? undefined);
    showOut(el.cp.out, preview);
    if (!preview.ok) {
      toast(preview.reason ?? "checkpoint unavailable", "err");
      return { ok: false, reason: preview.reason };
    }
    if (!state.account) {
      showBanner("Simulation succeeded — connect a wallet to submit the checkpoint.");
      return { ok: false, reason: "no wallet" };
    }
    const result = await sendTransaction(preview.tx, "checkpoint()");
    await refreshAll();
    return { ok: true, ...result, gas: preview.gas };
  }

  async function requestClaim() {
    const caps = capabilities();
    if (!caps.claim) throw new Error("claims are read-only on this profile (v9 staking flows undocumented)");
    const owner = state.inspected ?? state.account;
    const preview = await state.adapter.claimPreview(owner, undefined, {
      status: state.status?.owner === owner ? state.status : undefined,
    });
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
    for (const batch of preview.batches) receipts.push(await sendTransaction(batch.tx, `claim(${batch.tokenIds.length} ids)`));
    await refreshAll();
    return { ok: true, total: preview.total, receipts };
  }

  async function requestMerge(pair) {
    const owner = state.account ?? state.inspected;
    const preview = await state.adapter.mergePreview(owner, pair.survivor, pair.donor);
    const confirmed = await confirmModal({
      title: `Merge ${pair.survivor} ← ${pair.donor}`,
      body: `#${pair.donor} is BURNED permanently and cannot be restored. #${pair.survivor} becomes level ${pair.nextLevel}. Simulated gas ≈ ${preview.gas}. Type the donor token ID to confirm.`,
      requireText: pair.donor,
      confirmLabel: "Burn donor & merge",
    });
    if (!confirmed) return { ok: false, reason: "cancelled" };
    const result = await sendTransaction(preview.tx, `merge(${pair.survivor} ← ${pair.donor})`);
    await refreshAll();
    return { ok: true, ...result };
  }

  // ── art ───────────────────────────────────────────────────────────────────
  async function loadArt(tokenIds) {
    if (!state.adapter?.art) {
      toast("this profile has no art adapter", "err");
      return [];
    }
    el.art.status.textContent = `rendering ${tokenIds.length} token(s)…`;
    const loaded = [];
    for (const id of tokenIds) {
      try {
        const art = state.art.get(String(id)) ?? (await state.adapter.art(id));
        state.art.set(String(id), art);
        loaded.push(art);
      } catch (err) {
        toast(`art ${id}: ${errorMessage(err)}`, "err");
      }
    }
    renderArt(loaded);
    el.art.status.textContent = `${state.art.size} rendered`;
    return loaded;
  }

  function renderArt(items) {
    for (const item of items) {
      if (!item?.image) continue;
      const card = doc.createElement("div");
      card.className = "art-card";
      const img = doc.createElement("img");
      img.src = item.image; // data:image/svg+xml — isolated image, never inline markup
      img.alt = item.name ?? `Squeek #${item.tokenId}`;
      img.loading = "lazy";
      const caption = doc.createElement("div");
      caption.className = "token";
      caption.textContent = `#${item.tokenId}`;
      card.append(img, caption);
      card.onclick = () => openArtDetail(item);
      el.art.grid.prepend(card);
    }
  }

  function openArtDetail(item) {
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
    desc.textContent = item.description ?? "";
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
    el.modal.root.classList.remove("hidden");
    const close = () => {
      el.modal.root.classList.add("hidden");
      el.modal.confirm.onclick = null;
      el.modal.cancel.onclick = null;
      el.modal.confirm.className = "btn btn-danger";
    };
    el.modal.confirm.onclick = close;
    el.modal.cancel.onclick = close;
  }

  // ── tool registry ─────────────────────────────────────────────────────────
  const ownerOrDefault = (args) => args.owner ?? state.inspected ?? state.account ?? null;
  const requireOwner = (args) => {
    const owner = ownerOrDefault(args);
    if (!owner) throw new Error("no address: connect a wallet or pass owner");
    return owner;
  };

  function buildTools() {
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
      tools.squeek_checkpoint_preview = { description: "Whether checkpoint() can advance now, with unsigned tx + gas.", run: async () => state.adapter.checkpointPreview(state.account ?? undefined) };
      tools.squeek_request_checkpoint = { description: "Open the wallet popup to submit checkpoint(). Works for any wallet.", run: async () => requestCheckpoint() };
    }
    if (caps.claim) {
      tools.squeek_claim_preview = {
        description: "Simulated claim: total SQK and 32-ID batches with gas.",
        run: async (args) => state.adapter.claimPreview(requireOwner(args), args.tokenIds),
      };
      tools.squeek_request_claim = { description: "Open the wallet popup to claim SQK.", run: async () => requestClaim() };
    }
    if (caps.merge) {
      tools.squeek_merge_plan = { description: "Same-level merge pairs that satisfy every onchain precondition.", run: async (args) => state.adapter.mergePlan(requireOwner(args)) };
      tools.squeek_merge_preview = {
        description: "Simulate one merge (gas + irreversibility warning).",
        run: async (args) => state.adapter.mergePreview(requireOwner(args), args.survivor, args.donor),
      };
      tools.squeek_request_merge = {
        description: "Open the wallet popup to merge a pair. Requires confirm: 'BURN-<donor>'.",
        run: async (args) => {
          if (!args.survivor || !args.donor) throw new Error("survivor and donor are required");
          if (args.confirm !== `BURN-${args.donor}`) throw new Error(`refusing to merge without confirm: "BURN-${args.donor}"`);
          const owner = requireOwner(args);
          const plan = await state.adapter.mergePlan(owner);
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
    if (!state.adapter) return { error: `profile ${state.profileKey} has no deployment`, available: [] };
    const tool = buildTools()[name];
    if (!tool) return { error: `unknown tool for profile ${state.profileKey}: ${name}`, available: Object.keys(buildTools()) };
    try {
      return await tool.run(args ?? {});
    } catch (err) {
      return { error: errorMessage(err), revert: err?.revert ?? null };
    }
  }

  // ── tabs + wiring ─────────────────────────────────────────────────────────
  function selectTab(name) {
    el.tabs.forEach((t) => t.setAttribute("aria-selected", String(t.dataset.tab === name)));
    el.panels.forEach((p) => p.classList.toggle("hidden", p.dataset.panel !== name));
    store.set("squeekchain:tab", name);
  }
  el.tabs.forEach((t) => (t.onclick = () => selectTab(t.dataset.tab)));

  el.profileSelect.onchange = () => withBusy(() => switchProfile(el.profileSelect.value));
  el.connect.onclick = async () => {
    if (state.account) {
      state.account = null;
      state.inspected = null;
      state.status = null;
      renderWalletChip();
      renderHolder(null);
      return;
    }
    await withBusy(connect);
  };
  el.refresh.onclick = () => withBusy(refreshAll);
  el.cp.button.onclick = () => withBusy(requestCheckpoint);
  el.holder.claim.onclick = () => withBusy(requestClaim);
  el.holder.plan.onclick = () => withBusy(refreshWallet);
  el.holder.watch.onclick = async () => {
    const value = el.holder.watchInput.value.trim();
    if (!/^0x[0-9a-fA-F]{40}$/.test(value)) return toast("enter a valid 0x address", "err");
    state.inspected = value;
    await withBusy(refreshWallet);
  };
  el.art.one.onclick = () => {
    const id = el.art.token.value.trim();
    if (!/^\d+$/.test(id)) return toast("enter a token id", "err");
    withBusy(() => loadArt([id]));
  };
  el.art.mine.onclick = () => {
    const ids = (state.status?.squeeks ?? []).map((s) => s.tokenId);
    if (ids.length === 0) return toast("no Squeeks in the current view", "err");
    withBusy(() => loadArt(ids));
  };

  el.agent.run.onclick = async () => {
    let args = {};
    try {
      args = el.agent.args.value.trim() ? JSON.parse(el.agent.args.value) : {};
    } catch {
      return showOut(el.agent.out, { error: "args must be valid JSON" });
    }
    const result = await withBusy(() => callTool(el.agent.select.value, args));
    showOut(el.agent.out, result);
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

  // ── boot ──────────────────────────────────────────────────────────────────
  applyTheme(store.get(THEME_KEY) ?? "light");
  renderProfileOptions();
  renderWalletChip();
  state.adapter = buildAdapter(state.profileKey);
  renderNetworkPlaceholder();
  selectTab(store.get("squeekchain:tab") ?? "overview");
  if (!state.adapter) showBanner(getProfile(state.profileKey).notes, "warn");
  else refreshAll().then(renderToolOptions);

  const timer = win.setInterval?.(() => {
    if (!state.busy && state.adapter) refreshAll();
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
    connect,
    refresh: refreshAll,
    switchProfile,
    loadArt,
    requestCheckpoint,
    requestClaim,
    requestMerge,
    selectTab,
    destroy: () => win.clearInterval?.(timer),
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
