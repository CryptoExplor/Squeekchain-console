import {createPublicClient,http} from 'viem';
import {sepolia} from 'viem/chains';
import {createSnapshotGuard} from '../../sdk/rpc.js';
import {readIdentityBatch} from '../../sdk/identity-batch.js';
// Two local client views, explicitly NOT independent public peers/live qualification.
// Never imported from sdk/, web/, build.mjs or MCP.
export function forkContext(endpoint=process.env.FORK_URL??'http://127.0.0.1:8545'){
 const url=new URL(endpoint);if(!['127.0.0.1','localhost','[::1]'].includes(url.hostname))throw new Error('Fork harness only permits loopback');
 const clients=['fork-test-primary','fork-test-peer-a','fork-test-peer-b'].map(name=>createPublicClient({name,chain:sepolia,transport:http(endpoint),batch:{multicall:true},cacheTime:0}));
 const [client,...peers]=clients;return {client,...createSnapshotGuard(client,peers),readIdentity:(_snapshot,requests)=>Promise.all(peers.map(peer=>readIdentityBatch(peer,requests)))};
}
