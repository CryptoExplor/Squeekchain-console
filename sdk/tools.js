import { PROFILES, DEFAULT_PROFILE } from "./deployments.js";
import { STAKING_ACTIONS } from "./tool-runtime.js";
/**
 * Single source of truth for tool metadata.
 *
 * The web dApp, the generated web/tools.json manifest and the MCP server all read this list,
 * so shared tools have identical names, descriptions and schemas on every surface.
 * Browser-only request tools simulate then ask the human wallet; MCP never signs or submits.
 */

const str = (description, extra = {}) => ({ type: "string", description, ...extra });
const arr = (description) => ({ type: "array", items: { type: "string" }, description });
const obj = (properties = {}, required = []) => ({ type: "object", properties, required });

/** @type {{name:string, description:string, inputSchema:object, surfaces:("web"|"mcp")[], sideEffects:string}[]} */
const BASE_SPECS = [
  {
    name: "squeek_network_status",
    description:
      "Network-wide SqueekCore + SqueekMining state: settled round, Squeek block height, checkpoint lag, emission per day, total power, minted/supply cap, level table and whether a checkpoint can advance now. In sepolia-v9, emission is null (unavailable), not zero.",
    inputSchema: obj(),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_verify",
    description:
      "At one cross-checked Sepolia snapshot block, verify the selected contract graph (chain ID, implementation address, runtime hash, layout digest, proxy admin/owner, implementation version, configuration) and the wiring between SqueekCore, SqueekMining, SqueekToken and SqueekNFT. Run this before trusting any other result.",
    inputSchema: obj(),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_wallet_status",
    description:
      "Per-address holdings: live Squeek positions (level, active/pending power, merge cooldown block), claimable SQK, total power, network share and estimated SQK/day. Defaults to the connected wallet in the browser. In sepolia-v9, sharePercent and estimatedSqkPerDay are null (unavailable), not zero.",
    inputSchema: obj({ owner: str("0x address to inspect (optional in the browser: defaults to the connected wallet)") }),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_checkpoint_preview",
    description:
      "Whether checkpoint() can advance now (corePaused / roundSettled), with the reason when it cannot, the unsigned transaction and a gas estimate. checkpoint() is permissionless: no Squeek needed, no caller reward.",
    inputSchema: obj({ from: str("0x caller address for same-block checkpoint simulation (optional only for connected browser wallet)") }),
    surfaces: ["web", "mcp"],
    sideEffects: "read-only",
  },
  {
    name: "squeek_claim_preview",
    description:
      "Simulated owner claim: actual payout and unsigned transactions. NFT batches on v6; account rewards on v9. Signs nothing.",
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
    inputSchema: obj({ owner: str("0x address (optional)"), survivor: str("token ID that keeps its identity"), donor: str("token ID that gets burned"), confirm: str("must equal BURN-<donor> before building calldata") }, ["survivor", "donor", "confirm"]),
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
      "Simulate checkpoint and return an unsigned transaction for the caller wallet. Never signs or submits.",
    inputSchema: obj({ from: str("0x caller address for same-block checkpoint simulation (optional only for connected browser wallet)") }),
    surfaces: ["mcp"],
    sideEffects: "prepare-only",
  },
  {
    name: "squeek_prepare_claim",
    description:
      "Simulate and prepare unsigned claims for the owner wallet: NFT batches or account rewards, according to the selected deployment.",
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

];

const profileArg = str('Deployment for this call; defaults to the active browser profile or MCP session default', {enum:['sepolia-v6','sepolia-v9']});
const stakingSpecs = Object.keys(STAKING_ACTIONS).flatMap(action => ['preview','prepare'].map(mode => ({
  name:mode==='prepare'?`squeek_prepare_${action}`:`squeek_${action}_preview`,
  description:`Simulate ${action}; return unsigned calldata only. Amounts, fees and IDs are decimal base-unit strings. Approvals are separate explicit actions. merge_deposited requires BURN-<donor> before construction. Re-preview in the owner wallet before signing.`,
  inputSchema:obj({owner:str('Owner/depositor address'),tokenIds:arr('NFT IDs for deposit/withdraw'),tokenId:str('One NFT ID to approve'),survivor:str('Surviving ID'),donor:str('Burned ID'),confirm:str('Must equal BURN-<donor>'),amount:str('SQK amount in base units'),maxFee:str('Previous unstake quote cap in base units'),deadline:str('Previous unstake uint64 deadline')},['owner',...(['deposit','withdraw'].includes(action)?['tokenIds']:action==='approve_nft'?['tokenId']:['approve_sqk','stake','unstake'].includes(action)?['amount']:action==='merge_deposited'?['survivor','donor','confirm']:[])]),
  surfaces:['web','mcp'],sideEffects:mode==='prepare'?'prepare-only':'read-only',
})));
const unsignedSpecs=[...BASE_SPECS,...stakingSpecs];
const walletActions=['checkpoint','claim','merge','deposit','withdraw','merge_deposited','claim_and_stake','stake','unstake'];
const requestSpecs=walletActions.map(action=>{
  const source=unsignedSpecs.find(spec=>spec.name===`squeek_prepare_${action}`);
  return {...source,name:`squeek_request_${action}`,
    description:`Browser only: simulate ${action}, then open your wallet popup for human approval. Same-origin requests only; never exposes a private key.${action.includes('merge')?" Requires confirm: BURN-<donor> before any construction and the human must type it again.":''}`,
    inputSchema:{...source.inputSchema,required:(source.inputSchema.required??[]).filter(key=>key!=='owner')},
    surfaces:['web'],sideEffects:'wallet-popup'};
});
const v9ToolNames=new Set([...stakingSpecs.map(spec=>spec.name),...walletActions.filter(action=>!['checkpoint','claim','merge'].includes(action)).map(action=>`squeek_request_${action}`)]);
export const TOOL_SPECS = [...unsignedSpecs,...requestSpecs].map(spec=>({...spec,surfaces:spec.sideEffects==='wallet-popup'?['web']:['web','mcp'],inputSchema:{...spec.inputSchema,properties:{...spec.inputSchema.properties,profile:v9ToolNames.has(spec.name)?{...profileArg,enum:['sepolia-v9']}:profileArg}}}));

/** Tool manifest published as web/tools.json and advertised by the MCP server. */
export function buildManifest({ surface } = {}) {
  const tools = TOOL_SPECS.filter((t) => !surface || t.surfaces.includes(surface));
  return {
    name: "wheelhouse",
    version: "1.0.0",
    description:
      "Squeekchain Sepolia v6 and v9: equal-profile reads and unsigned preparations. Reads are permissionless; owner actions are prepared as unsigned transactions for the owner's wallet to sign. Testnet only.",
    chainId: 11155111,
    defaultProfile: DEFAULT_PROFILE,
    profiles: Object.values(PROFILES).map(({key,label,addresses})=>({key,label,addresses:addresses??null})),
    safety: [
      "all deployed-profile operations fail closed on same-block chain, identity, runtime hash or wiring mismatch; two RPC block hashes must agree",
      "simulate before proposing a signature",
      "read ownership live, immediately before an owner action",
      "type BURN-<donor> before constructing merge calldata; donor is permanently destroyed",
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
