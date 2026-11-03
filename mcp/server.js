#!/usr/bin/env node
import { rpcToolError } from '../sdk/rpc-errors.js';
/** Wheelhouse MCP: stdio public reads and unsigned preparations only.
 * No key configuration, signing or submission. Keeper is isolated in keeper/.
 */
import readline from "node:readline";
import { createSqueekchain } from "../sdk/squeekchain.js";
import { createSqueek9 } from "../sdk/v9.js";
import { getProfile, PROFILES, DEFAULT_PROFILE } from "../sdk/deployments.js";
import { TOOL_SPECS, buildManifest } from "../sdk/tools.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "wheelhouse", title: "Wheelhouse", version: "1.0.0" };
const rpcUrl = process.env.RPC_URL || undefined;
const profileKey = process.env.SQUEEK_PROFILE || DEFAULT_PROFILE;
const profile = getProfile(profileKey);

const log = (...a) => process.stderr.write(`[wheelhouse-mcp] ${a.join(" ")}\n`);
if (!profile.addresses) {
  log(`profile "${profileKey}" has no deployment — refusing to start`);
  process.exit(1);
}

const adapter =
  profile.abiSet === "v9"
    ? createSqueek9({ profileKey, rpcUrl })
    : createSqueekchain({ rpcUrl, addresses: profile.addresses });

const caps = profile.capabilities;
const requireAddress = (value, label = "owner") => {
  if (!value || !/^0x[0-9a-fA-F]{40}$/.test(value)) throw new Error(`${label} must be a 0x address`);
  return value;
};

// ── tools ────────────────────────────────────────────────────────────────────
const handlers = {
  async squeek_network_status() {
    return { profile: profile.key, ...(await adapter.networkStatus()) };
  },
  async squeek_verify() {
    return adapter.verify();
  },
  async squeek_wallet_status(args) {
    return adapter.walletStatus(requireAddress(args.owner));
  },
};

if (adapter.art) {
  handlers.squeek_art = async (args) => {
    if (!args.tokenId) throw new Error("tokenId is required");
    return adapter.art(args.tokenId);
  };
}

if (caps.checkpoint) {
  handlers.squeek_checkpoint_preview = async args => adapter.checkpointPreview(requireAddress(args.from, "from"));
  handlers.squeek_prepare_checkpoint = async args => adapter.checkpointPreview(requireAddress(args.from, "from"));
}

if (caps.claim) {
  handlers.squeek_claim_preview = async (args) => adapter.claimPreview(requireAddress(args.owner), args.tokenIds);
  handlers.squeek_prepare_claim = async (args) => {
    const owner = requireAddress(args.owner);
    const preview = await adapter.claimPreview(owner, args.tokenIds);
    if (!preview.ok) return preview;
    return {
      ok: true,
      owner,
      total: preview.total,
      transactions: preview.batches.map((b) => ({ transaction: b.tx, tokenIds: b.tokenIds, amount: b.amount, gas: b.gas })),
      note: "sign from the owner's wallet; ownership was read immediately before preparing",
    };
  };
}

if (caps.merge) {
  handlers.squeek_merge_plan = async (args) => adapter.mergePlan(requireAddress(args.owner));
  handlers.squeek_merge_preview = async (args) => adapter.mergePreview(requireAddress(args.owner), args.survivor, args.donor, { confirm: args.confirm });
  handlers.squeek_prepare_merge = async (args) => {
    const owner = requireAddress(args.owner);
    if (args.confirm !== `BURN-${args.donor}`) {
      throw new Error(`refusing to prepare a merge without confirm: "BURN-${args.donor}"`);
    }
    const preview = await adapter.mergePreview(owner, args.survivor, args.donor, { confirm: args.confirm });
    return {
      ok: true,
      owner,
      survivor: preview.survivor,
      donor: preview.donor,
      transaction: preview.tx,
      gas: preview.gas,
      warning: preview.warning,
      note: "the donor NFT is burned permanently; confirm the IDs with the human before signing",
    };
  };
}

const availableTools = () => [
  ...TOOL_SPECS.filter((t) => t.surfaces.includes("mcp") && handlers[t.name]).map(({ name, description, inputSchema, sideEffects }) => ({
    name,
    description,
    inputSchema,
    sideEffects,
  })),
];

// ── JSON-RPC ─────────────────────────────────────────────────────────────────
const send = (m) => process.stdout.write(`${JSON.stringify(m)}\n`);
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const fail = (id, code, message) => send({ jsonrpc: "2.0", id, error: { code, message } });

async function handleToolCall(id, params) {
  const name = params?.name;
  const handler = handlers[name];
  if (!handler) return fail(id, -32602, `unknown tool for profile ${profile.key}: ${name}`);
  try {
    const result = await handler(params?.arguments ?? {});
    return reply(id, {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
      isError: Boolean(result && result.ok === false && (result.error || result.reason)),
    });
  } catch (err) {
    const failure = rpcToolError(err, adapter.rpcDiagnostics?.() ?? []);
    log(`tool ${name} failed: ${failure.error}`);
    return reply(id, {
      content: [{ type: "text", text: JSON.stringify(failure, null, 2) }],
      isError: true,
    });
  }
}

async function handle(message) {
  const { id, method, params } = message;
  switch (method) {
    case "initialize":
      return reply(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions: `Squeekchain, profile "${profile.key}" (${profile.kind}). ${profile.notes} Reads are permissionless. Owner actions are returned as unsigned transactions for the owner's wallet — this server never signs them.`,
      });
    case "notifications/initialized":
      return;
    case "ping":
      return reply(id, {});
    case "tools/list":
      return reply(id, { tools: availableTools() });
    case "tools/call":
      return handleToolCall(id, params);
    case "resources/list":
      return reply(id, { resources: [] });
    case "prompts/list":
      return reply(id, { prompts: [] });
    default:
      if (id === undefined) return;
      return fail(id, -32601, `method not found: ${method}`);
  }
}

if (process.argv.includes("--manifest") || process.argv.includes("--profiles")) {
  process.stdout.write(
    `${JSON.stringify({ profiles: Object.values(PROFILES).map((p) => ({ key: p.key, label: p.label, kind: p.kind, deployed: Boolean(p.addresses) })), manifest: buildManifest({ surface: "mcp" }) }, null, 2)}\n`,
  );
} else {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let message;
    try {
      message = JSON.parse(trimmed);
    } catch {
      return log("dropping non-JSON line");
    }
    handle(message).catch((err) => {
      log(`unhandled: ${err.message}`);
      if (message?.id !== undefined) fail(message.id, -32603, err.message);
    });
  });
  log(`ready · profile ${profile.key} (${profile.kind}) · ${availableTools().length} tools · rpc ${rpcUrl ?? "default"} · unsigned only`);
}
