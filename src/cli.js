#!/usr/bin/env node
import { rpcToolError } from '../sdk/rpc-errors.js';
// Wheelhouse owner CLI: public reads, simulations and unsigned calls ONLY.
import { createSqueekchain } from '../sdk/squeekchain.js';

const help = `Wheelhouse · Sepolia v6 (supported) · unsigned only
  verify [--rpc URL]
  status [--owner ADDRESS]
  checkpoint --from ADDRESS
  claim --owner ADDRESS [--ids 1,2,3]
  merge --owner ADDRESS --survivor ID --donor ID --confirm BURN-ID

Every operation uses a verified, two-RPC-cross-checked snapshot.
No automatic mining, owner signing or submission. Sign prepared calls in your own wallet.
The optional checkpoint-only keeper lives in keeper/checkpoint.mjs; it is off by default.`;
try {
  const [command = 'help', ...argv] = process.argv.slice(2);
  if (command === 'help' || command === '--help') { console.log(help); }
  else {
    const allowed = { verify: ['rpc'], status: ['rpc', 'owner'], checkpoint: ['rpc', 'from'], claim: ['rpc', 'owner', 'ids'], merge: ['rpc', 'owner', 'survivor', 'donor', 'confirm'] };
    if (!allowed[command]) throw new Error(`Unsupported command: ${command}. Read --help; this CLI never submits transactions.`);
    const args = {};
    for (let i = 0; i < argv.length; i += 2) {
      const name = argv[i].replace(/^--/, '');
      if (!argv[i].startsWith('--') || !allowed[command].includes(name) || !argv[i + 1] || argv[i + 1].startsWith('--') || name in args) throw new Error(`Unknown, duplicate or incomplete option: ${argv[i]}`);
      args[name] = argv[i + 1];
    }
    const required = key => { if (!args[key]) throw new Error(`--${key} is required`); return args[key]; };
    // Reject incomplete owner requests before doing any network work.
    if (['claim', 'merge'].includes(command)) required('owner');
    if (command === 'checkpoint') required('from');
    if (command === 'merge') for (const key of ['survivor', 'donor', 'confirm']) required(key);
    const sdk = createSqueekchain({ rpcUrl: args.rpc || process.env.RPC_URL || undefined });
    let result;
    if (command === 'verify') result = await sdk.verify();
    if (command === 'status') result = args.owner ? await sdk.walletStatus(args.owner) : await sdk.networkStatus();
    if (command === 'checkpoint') result = await sdk.checkpointPreview(args.from);
    if (command === 'claim') {
      const ids = args.ids?.split(/[,\s]+/).filter(Boolean);
      if (ids?.some(id => !/^\d+$/.test(id))) throw new Error('IDs must be positive integers');
      result = await sdk.claimPreview(args.owner, ids);
    }
    if (command === 'merge') result = await sdk.mergePreview(args.owner, args.survivor, args.donor, { confirm: args.confirm });
    console.log(JSON.stringify(result, null, 2));
    if (result?.ok === false) process.exitCode = 1;
  }
} catch (error) {
  console.error(`Stopped: ${rpcToolError(error).error}`);
  process.exitCode = 1;
}
