import { RpcTrustError, RpcAvailabilityError } from './rpc-errors.js';
import { throwIfAborted, anySignal } from './cancellation.js';
// Capability only, never chain data. A rejected batch is not an identity mismatch.
const support = new Map();
let nextId = 0;
export async function readIdentityBatch(peer, requests, { signal, fetcher = globalThis.fetch, capabilities = support, onResponse } = {}) {
  if (!requests.length) return [];
  const single = async () => {
    const values=[];
    // Storage/code cannot be safely replaced by contract multicall reads. Keep
    // native calls at the exact snapshot block, with at most two in flight.
    for(let i=0;i<requests.length;i+=2) {
      throwIfAborted(signal);
      values.push(...await Promise.all(requests.slice(i,i+2).map(request=>peer.request(request))));
    }
    return values;
  };
  const url = peer.identityUrl;
  if (!url || capabilities.get(url) === false) return single();
  throwIfAborted(signal);
  const payload = requests.map(request => ({ jsonrpc:'2.0', id:++nextId, ...request }));
  const deadline=anySignal([signal],12000);
  try {
  const response = await fetcher(url, { method:'POST', headers:{'content-type':'application/json'}, credentials:'omit', cache:'no-store', body:JSON.stringify(payload), signal:deadline.signal });
  onResponse?.(response,url);
  let body; try { body = await response.json(); } catch { body = null; }
  throwIfAborted(deadline.signal);
  const httpError=()=>new RpcAvailabilityError(Object.assign(new Error('Identity batch HTTP failure'),{status:response.status}),{endpoint:url,method:requests[0].method,status:response.status,kind:'http'});
  if(!response.ok&&[429,503,401].includes(response.status))throw httpError();
  const rejectsBatch=error=>[-32600,-32601].includes(error?.code)||/batch.*(?:not supported|disabled|not allowed|limit|size|too (?:many|large))|(?:limit|maximum).*batch/i.test(error?.message??'');
  const rejectedEntries=Array.isArray(body)&&body.length>0&&body.every(item=>rejectsBatch(item?.error));
  const unsupported = rejectedEntries || [400,403,404,405,413,415,422,501].includes(response.status) || (response.ok && !Array.isArray(body) && [-32600,-32601].includes(body?.error?.code)) || /batch.*(?:not supported|disabled|not allowed|limit|size|too (?:many|large))|(?:limit|maximum).*batch/i.test(body?.error?.message??'');
  if (unsupported) { capabilities.set(url,false); return single(); }
  // Transient batch HTTP failure can still leave checked single calls usable.
  // Respect rate-limit cooldowns; never fan out after 429/503. Do not mark a
  // transient gateway failure as a permanent lack of batch support.
  if(!response.ok&&response.status>=500){
    try{return await single();}
    catch(error){throw new RpcAvailabilityError(error,{endpoint:url,method:requests[0].method,priorError:httpError(),kind:'http'});}
  }
  if (!response.ok) throw httpError();
  if (!Array.isArray(body) || body.length !== payload.length) throw new RpcTrustError('Identity batch response length mismatch');
  const byId = new Map();
  for (const item of body) {
    if(item?.jsonrpc!=='2.0'||Object.hasOwn(item,'result')===Object.hasOwn(item,'error'))throw new RpcTrustError('Malformed identity batch response');
    if (byId.has(item?.id) || !payload.some(request=>request.id===item?.id)) throw new RpcTrustError('Identity batch response ID mismatch');
    byId.set(item.id,item);
  }
  capabilities.set(url,true);
  return payload.map(request=>{
    const item=byId.get(request.id);
    if (item?.error) throw new RpcAvailabilityError(Object.assign(new Error('Identity batch RPC failure'),{code:item.error.code}), {endpoint:url,method:request.method});
    if (typeof item?.result !== 'string' || !/^0x(?:[\da-f]{2})*$/i.test(item.result)) throw new RpcTrustError('Missing identity batch result');
    return item.result;
  });
  } finally { deadline.dispose(); }
}
