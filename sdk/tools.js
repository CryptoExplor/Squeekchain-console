/**
 * Single source of truth for tool metadata.
 *
 * The web dApp, the generated web/tools.json manifest and the MCP server all read this list,
 * so an agent sees the same names, descriptions and schemas on every surface. Only the
 * *transport* differs: web tools can open a wallet popup, MCP tools can only prepare unsigned
 * transactions (a stdio server cannot click MetaMask).
 */

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const arr = (description) => ({ type: "array", items: { type: "string" }, description });
const obj = (properties = {}, required = []) => ({ type: "object", properties, required });

/** @type {{name:string, description:string, inputSchema:object, surfaces:("web"|"mcp")[], sideEffects:string}[]} */
export const TOOL_SPECS = [
  {
    name: "squeek_network_status",
    description:
      "Network-wide SqueekCore + SqueekMining state: settled round, Squeek block height, checkpoint lag, emission per day, total power, minted/supply cap, level table and whether a checkpoint can advance now.",
    inputSchema: obj(),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_verify",
    description:
      "Verify both upgradeable proxies (implementation address, layout digest, proxy admin, implementation version) and the wiring between SqueekCore, SqueekMining, SqueekToken and SqueekNFT. Run this before trusting any other result.",
    inputSchema: obj(),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_wallet_status",
    description:
      "Per-address holdings: live Squeek positions (level, active/pending power, merge cooldown block), claimable SQK, total power, network share and estimated SQK/day. Defaults to the connected wallet in the browser.",
    inputSchema: obj({ owner: str("0x address to inspect (optional in the browser: defaults to the connected wallet)") }),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_checkpoint_preview",
    description:
      "Whether checkpoint() can advance now (corePaused / roundSettled), with the reason when it cannot, the unsigned transaction and a gas estimate. checkpoint() is permissionless: no Squeek needed, no caller reward.",
    inputSchema: obj(),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_claim_preview",
    description:
      "Simulated claim for an owner: total claimable SQK, the 32-ID transaction batches with per-batch gas, and any decoded revert. Signs nothing.",
    inputSchema: obj({
      owner: str("0x address (optional)"),
      tokenIds: arr("subset of token IDs to claim (optional; default all owned)"),
    }),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_merge_plan",
    description:
      "Same-level merge pairs that satisfy every onchain precondition (below max level, no pending activation, cooldown measured in completed Squeek blocks), with power before/after and the gain. Merging always burns the donor.",
    inputSchema: obj({ owner: str("0x address (optional)") }),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_merge_preview",
    description:
      "Simulate one merge for a survivor/donor pair: gas estimate, resulting level, and an explicit irreversibility warning. Signs nothing.",
    inputSchema: obj({ owner: str("0x address (optional)"), survivor: str("token ID that keeps its identity"), donor: str("token ID that gets burned") }, ["survivor", "donor"]),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_art",
    description:
      "Onchain DotGrid art and traits for a Squeek token: name, description, trait list and an SVG data URI rendered by the contract. Display it as an isolated image, never as inline markup.",
    inputSchema: obj({ tokenId: str("Squeek token ID") }, ["tokenId"]),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_prepare_checkpoint",
    description:
      "Return an unsigned checkpoint() transaction (to/data/value/chainId) that the caller's wallet can sign. Use this from MCP; the web app can submit it directly.",
    inputSchema: obj(),
    surfaces: ["mcp"],
    sideEffects: "prepare-only",
  },
  {
    name: "squeek_prepare_claim",
    description:
      "Return unsigned claim() transactions, one per 32-ID batch, for the owner's wallet to sign. Simulated first; ownership is re-read immediately before building.",
    inputSchema: obj({ owner: str("0x address that owns the Squeeks"), tokenIds: arr("optional subset") }, ["owner"]),
    surfaces: ["mcp"],
    sideEffects: "prepare-only",
  },
  {
    name: "squeek_prepare_merge",
    description:
      "Return an unsigned merge() transaction for a survivor/donor pair plus the warning that the donor is burned permanently. Requires confirm: 'BURN-<donor>'.",
    inputSchema: obj(
      {
        owner: str("0x address that owns both Squeeks"),
        survivor: str("token ID that survives"),
        donor: str("token ID that is burned"),
        confirm: str("must equal BURN-<donor> to acknowledge the burn"),
      },
      ["owner", "survivor", "donor", "confirm"],
    ),
    surfaces: ["mcp"],
    sideEffects: "prepare-only",
  },
  {
    name: "squeek_request_checkpoint",
    description:
      "Open the user's wallet popup to submit checkpoint(). Works for any wallet, holder or not. The user still confirms in their wallet.",
    inputSchema: obj(),
    surfaces: ["web"],
    sideEffects: "wallet-popup",
  },
  {
    name: "squeek_request_claim",
    description: "Open the user's wallet popup to claim SQK for the connected owner (simulated first).",
    inputSchema: obj({ tokenIds: arr("optional subset of token IDs") }),
    surfaces: ["web"],
    sideEffects: "wallet-popup",
  },
  {
    name: "squeek_request_merge",
    description:
      "Open the user's wallet popup to merge a pair. Requires confirm: 'BURN-<donor>' so an agent cannot burn an NFT by accident, and the UI still asks the human to type the donor ID.",
    inputSchema: obj(
      {
        survivor: str("token ID that survives"),
        donor: str("token ID that is burned"),
        confirm: str("must equal BURN-<donor>"),
      },
      ["survivor", "donor", "confirm"],
    ),
    surfaces: ["web"],
    sideEffects: "wallet-popup",
  },
];

const DEPLOYMENT_FOR_MANIFEST = {
  core: "0x74665dAecA35A2303e767E76a2FF1FB6F93e119f",
  mining: "0x3beE588fC20dE788Bac17d33b41Da7346cb27EC4",
  token: "0x6872bfa5ccc3e9e440c6c16e5ffdabb8dba4cc76",
  nft: "0x0eAF3E0d40A0a8E5a6Ac030b2459E9FB0B7905c6",
};

/** Tool manifest published as web/tools.json and advertised by the MCP server. */
export function buildManifest({ surface } = {}) {
  const tools = TOOL_SPECS.filter((t) => !surface || t.surfaces.includes(surface));
  return {
    name: "squeekchain",
    version: "1.0.0",
    description:
      "Squeekchain SqueekMining v6 on Sepolia: reads, checkpoints, claims and merges. Reads are permissionless; owner actions are prepared as unsigned transactions for the owner's wallet to sign. Testnet only.",
    chainId: 11155111,
    addresses: DEPLOYMENT_FOR_MANIFEST,
    safety: [
      "verify the deployment graph before acting (squeek_verify)",
      "simulate before proposing a signature",
      "read ownership live, immediately before an owner action",
      "a merge burns the donor NFT permanently — require an explicit human confirmation",
      "this server never holds or requests a private key",
    ],
    transports: {
      web: "window.squeek.callTool(name, args)",
      postMessage: { request: { type: "squeek.tool", name: "…", args: {}, id: "…" }, response: { type: "squeek.result", id: "…", ok: true, result: {} } },
      mcp: "node mcp/server.js (stdio, MCP 2024-11-05)",
    },
    tools: tools.map(({ name, description, inputSchema, sideEffects, surfaces }) => ({ name, description, inputSchema, sideEffects, surfaces })),
  };
}
