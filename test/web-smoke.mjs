/**
 * Smoke test: renders the real index.html in jsdom, mounts app.js against live Sepolia and drives
 * both deployment profiles and the agent tool registry.
 *
 *   node test/web-smoke.mjs
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const V9_HOLDER = "0x598958Abf7d8DB8Dd468cb53DD6BA705581bFf54"; // 20 Squeeks on the live graph
const EMPTY = "0x5311cEA3B0C0540d62DAD58E7DdC6904289c05d4";

const started = Date.now();
const waitFor = async (fn, { timeout = 120_000, interval = 200, label = "condition" } = {}) => {
  const t0 = Date.now();
  for (;;) {
    const value = await fn();
    if (value) return value;
    if (Date.now() - t0 > timeout) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, interval));
  }
};
const checks = [];
const check = (name, ok, extra = "") => {
  checks.push({ name, ok: Boolean(ok) });
  console.log(`${ok ? "PASS" : "FAIL"} [${((Date.now() - started) / 1000).toFixed(1)}s] ${name}${extra ? ` — ${extra}` : ""}`);
  if (!ok) process.exitCode = 1;
};

const html = fs.readFileSync(path.join(ROOT, "web/index.html"), "utf8");
const dom = new JSDOM(html, { url: "https://squeek.local/", runScripts: "outside-only", pretendToBeVisual: true });
const { window } = dom;

window.ethereum = {
  request: async ({ method }) => {
    if (method === "eth_requestAccounts" || method === "eth_accounts") return [V9_HOLDER];
    if (method === "eth_chainId") return "0xaa36a7";
    if (method === "eth_sendTransaction") throw new Error("mock wallet refuses to sign in tests");
    throw new Error(`mock wallet: unsupported ${method}`);
  },
  on: () => {},
};

global.window = window;
global.document = window.document;
global.localStorage = window.localStorage;

const mod = await import(path.join(ROOT, "web/app.js"));
const api = window.squeek ?? mod.mount({ doc: window.document, win: window });
const $ = (id) => window.document.getElementById(id);
const text = (id) => $(id).textContent.trim();

// 1. light theme by default
check("light theme is the default", window.document.documentElement.dataset.theme === "light", window.document.documentElement.dataset.theme);

// 2. live profile renders
await waitFor(() => text("net-round") !== "—", { label: "network panel" });
check("live profile renders network state", text("net-round") !== "—" && text("net-squeeks") !== "—", `round ${text("net-round")} · blocks ${text("net-blocks")} · squeeks ${text("net-squeeks")}`);
check("profile explains itself", text("profile-notice").length > 40, text("profile-notice").slice(0, 72) + "…");
check("v9 owner actions are visibly gated", text("cp-reason").includes("read-only") && $("btn-checkpoint").disabled === true, text("cp-reason").slice(0, 60) + "…");

// 3. wallet connect
await api.connect();
check("wallet connects", text("wallet-chip").includes(V9_HOLDER.slice(0, 6)), text("wallet-chip"));

// 4. holdings for a live v9 holder
await waitFor(() => text("holder-owner") === V9_HOLDER, { label: "holder view" });
await waitFor(() => $("squeeks-tbody").children.length > 0, { label: "position rows", timeout: 180_000 });
const rows = $("squeeks-tbody").children.length;
check("holdings render for the live graph", rows > 0, `${rows} rows · count ${text("holder-count")} · claimable ${text("holder-claimable")}`);
check("owner actions stay disabled on the live graph", $("btn-claim").disabled === true, text("holder-hint").slice(0, 70));

// 5. onchain art
const art = await api.loadArt([1]);
check("onchain art renders as an isolated image", art.length === 1 && String(art[0].image).startsWith("data:image/svg+xml;base64,"), `${art[0]?.name} · ${art[0]?.attributes?.length} traits`);
check("art grid has a thumbnail", $("art-grid").children.length > 0);

// 6. tool registry on the live profile
const net = await api.callTool("squeek_network_status");
check("tool: network status", Number(net.core?.settledThroughRound ?? 0) > 0, `lag ${net.mining?.lagRounds} rounds · profile ${net.profile}`);
const wallet = await api.callTool("squeek_wallet_status", { owner: V9_HOLDER });
check("tool: wallet status", wallet.totals?.count > 0, `${wallet.totals?.count} squeeks`);
const artTool = await api.callTool("squeek_art", { tokenId: "1" });
check("tool: squeek_art", String(artTool.image ?? "").startsWith("data:image"), artTool.name);
const gated = await api.callTool("squeek_request_merge", { survivor: "1", donor: "2", confirm: "BURN-2" });
check("tool: owner actions are absent on the live profile", Boolean(gated.error), gated.error?.slice(0, 64));

// 7. docs-pinned v6 profile still works, with tools
await api.switchProfile("sepolia-v6");
await waitFor(() => text("net-round") !== "—" && text("net-kind") === "legacy", { label: "v6 profile" });
check("v6 profile renders", text("net-kind") === "legacy" && text("net-round") !== "—", `round ${text("net-round")} · lag ${text("net-lag")}`);
const v6tools = Object.keys(api.tools());
check("v6 profile exposes owner actions", v6tools.includes("squeek_merge_plan") && v6tools.includes("squeek_request_checkpoint"), `${v6tools.length} tools`);
const v6cp = await api.callTool("squeek_checkpoint_preview");
check("v6 checkpoint reports the frozen frontier", v6cp.ok === false && String(v6cp.reason).length > 0, `${v6cp.reason} (next round ${v6cp.checkpoint?.nextRound})`);

// 8. mainnet is honestly empty
await api.switchProfile("mainnet");
check("mainnet says it has no deployment", text("profile-notice").toLowerCase().includes("no mainnet deployment"), text("profile-notice").slice(0, 60) + "…");

// 9. postMessage bridge
await api.switchProfile("sepolia");
await waitFor(() => text("net-round") !== "—", { label: "back to live profile" });
const reply = await new Promise((resolve) => {
  const listener = (event) => {
    if (event.data?.type !== "squeek.result") return;
    window.removeEventListener("message", listener);
    resolve(event.data);
  };
  window.addEventListener("message", listener);
  window.dispatchEvent(
    new window.MessageEvent("message", { source: window, data: { type: "squeek.tool", id: "t1", name: "squeek_network_status", args: {} } }),
  );
  setTimeout(() => resolve({ id: null, ok: false, result: null, timeout: true }), 20_000);
});
check("postMessage bridge responds", reply.id === "t1" && Boolean(reply.result?.core), `ok=${reply.ok}`);

api.destroy?.();
window.close();
const failed = checks.filter((c) => !c.ok).length;
console.log(`\n${checks.length - failed}/${checks.length} checks passed`);
