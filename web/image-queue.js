// Bounded work queue, not a polling loop. One-shot wakeups only for queued work/rate limits.
export function createImageQueue({now=Date.now,setTimer=setTimeout,clearTimer=clearTimeout}={}){
 let active=0,timer,closed=false,retryAt=0;const starts=[],waiting=[];
 function drain(){clearTimer(timer);timer=null;while(starts.length&&now()-starts[0]>=1000)starts.shift();if(closed||!waiting.length)return;const delay=Math.max(retryAt-now(),starts.length>=20?1000-(now()-starts[0]):0);if(delay>0){timer=setTimer(drain,delay);return;}
  while(active<10&&waiting.length&&starts.length<20){const job=waiting.shift();job.signal?.removeEventListener('abort',job.abort);if(job.signal?.aborted){job.reject(job.signal.reason??new DOMException('Aborted','AbortError'));continue;}active++;starts.push(now());let work;try{work=job.run();}catch(error){work=Promise.reject(error);}Promise.resolve(work).then(job.resolve,job.reject).finally(()=>{active--;drain();});}
  if(waiting.length&&active<10)timer=setTimer(drain,Math.max(1,1000-(now()-starts[0])));
 }
 return {run(run,signal){if(closed)return Promise.reject(new DOMException('Image queue closed','AbortError'));return new Promise((resolve,reject)=>{const job={run,resolve,reject,signal};job.abort=()=>{const at=waiting.indexOf(job);if(at>=0)waiting.splice(at,1);reject(signal.reason??new DOMException('Aborted','AbortError'));drain();};signal?.addEventListener('abort',job.abort,{once:true});waiting.push(job);drain();});},cooldown(ms){retryAt=Math.max(retryAt,now()+Math.max(0,ms));drain();},get active(){return active;},close(){closed=true;clearTimer(timer);for(const job of waiting){job.signal?.removeEventListener('abort',job.abort);job.reject(new DOMException('Image queue closed','AbortError'));}waiting.length=0;}};
}
