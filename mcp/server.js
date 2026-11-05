#!/usr/bin/env node
import { rpcToolError } from '../sdk/rpc-errors.js';
/** Wheelhouse MCP: stdio public reads and unsigned preparations only.
 * No key configuration, signing or submission. Keeper is isolated in keeper/.
 */
import readline from "node:readline";
import { profileInput } from "../sdk/profile-input.js";
import { toolProfile, readToolResult } from "../sdk/tool-runtime.js";
import { createSqueekchain } from "../sdk/squeekchain.js";
import { getProfile, PROFILES, DEFAULT_PROFILE } from "../sdk/deployments.js";
import { TOOL_SPECS, buildManifest } from "../sdk/tools.js";

const PROTOCOL_VERSION = "2024-11-05";
const SERVER_INFO = { name: "wheelhouse", title: "Wheelhouse", version: "1.0.0" };
const rpcUrl = process.env.RPC_URL || undefined;
const profileKey = process.env.SQUEEK_PROFILE || DEFAULT_PROFILE;
const profile = getProfile(profileInput(profileKey,{fallback:null}));

const log = (...a) => process.stderr.write(`[wheelhouse-mcp] ${a.join(" ")}\n`);
if (!profile.addresses) {
  log(`profile "${profileKey}" has no deployment — refusing to start`);
  process.exit(1);
}

const adapters = new Map();
const handlers = Object.fromEntries(TOOL_SPECS.filter(t=>t.surfaces.includes('mcp')).map(spec=>[spec.name,async args=>{
  const selected=toolProfile(args.profile??profile.key);
  if(!adapters.has(selected.key))adapters.set(selected.key, createSqueekchain({profileKey:selected.key,rpcUrl}));
  return readToolResult(adapters.get(selected.key),spec.name,args);
}]));
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
      isError: Boolean(result && (result.error || result.ok === false && result.reason)),
    });
  } catch (err) {
    const failure = rpcToolError(err, []);
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
