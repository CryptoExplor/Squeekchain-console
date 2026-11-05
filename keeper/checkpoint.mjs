#!/usr/bin/env node
// Isolated, single-shot checkpoint ONLY. Never imported by web, CLI, SDK or MCP.
// Operator opt-in is deliberately separate from possession of a key. Not enabled by package scripts.
import { createWalletClient, custom, encodeFunctionData } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { sepolia } from 'viem/chains';
import { createSqueekchain } from '../sdk/squeekchain.js';
import { getProfile } from '../sdk/deployments.js';
const DEPLOYMENT = getProfile().addresses;
import { miningAbi } from '../sdk/abi.js';

try {
  if (process.env.CHECKPOINT_KEEPER_ENABLED !== 'true' || process.argv.slice(2).join(' ') !== '--submit-checkpoint') throw new Error('Keeper OFF. Explicit CHECKPOINT_KEEPER_ENABLED=true and --submit-checkpoint are both required.');
  const key = process.env.CHECKPOINT_KEEPER_KEY;
  if (!/^0x[0-9a-f]{64}$/i.test(key ?? '')) throw new Error('Supply a dedicated, low-value checkpoint keeper account in CHECKPOINT_KEEPER_KEY');
  const account = privateKeyToAccount(key);
  const sdk = createSqueekchain({ rpcUrl: process.env.RPC_URL || undefined });
  const preview = await sdk.checkpointPreview(account.address);
  if (!preview.ok) throw new Error(preview.reason);
  const data = encodeFunctionData({ abi: miningAbi, functionName: 'checkpoint', args: [] });
  if (preview.tx.to.toLowerCase() !== DEPLOYMENT.mining.toLowerCase() || preview.tx.data !== data || preview.tx.value !== '0') throw new Error('Checkpoint-only invariant failed');
  const wallet = createWalletClient({ account, chain: sepolia, transport: custom({ request: sdk.client.request }) });
  // Fixed target and selector. No dynamic transaction input, owner actions, loop or changed-input retry.
  const hash = await wallet.sendTransaction({ account, chain: sepolia, to: DEPLOYMENT.mining, data, value: 0n });
  console.log(JSON.stringify({ hash, note: 'Submitted once. Confirm the receipt and re-read state; do not blindly retry an unclear outcome.' }));
} catch (error) {
  console.error(`Checkpoint keeper stopped: ${error.shortMessage ?? error.message}`);
  process.exitCode = 1;
}
