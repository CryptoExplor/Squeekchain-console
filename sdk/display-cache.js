// Display data only. This database is NEVER a verification, custody or action input.
export const DAY=86400000, DISPLAY_TTL=900000;
export function createDisplayCache(indexedDB=globalThis.indexedDB){
 const memory=new Map();let opening;
 const database=()=>opening??=(indexedDB?new Promise(resolve=>{try{const r=indexedDB.open('wheelhouse-display',1);r.onupgradeneeded=()=>r.result.createObjectStore('cache');r.onsuccess=()=>resolve(r.result);r.onerror=r.onblocked=()=>resolve(null);}catch{resolve(null);}}):Promise.resolve(null));
 async function access(mode,key,value){const db=await database();if(!db)return mode==='readonly'?memory.get(key):undefined;try{return await new Promise((resolve,reject)=>{const tx=db.transaction('cache',mode),store=tx.objectStore('cache');const r=mode==='readonly'?store.get(key):value===undefined?store.delete(key):store.put(value,key);tx.oncomplete=()=>resolve(r.result);tx.onabort=tx.onerror=()=>reject(tx.error);});}catch{return mode==='readonly'?memory.get(key):undefined;}}
 return {get:key=>access('readonly',key),set:(key,value)=>{memory.set(key,value);return access('readwrite',key,value);},delete:key=>{memory.delete(key);return access('readwrite',key);}};
}
export const displayKey=(profile,key)=>JSON.stringify([profile.key,profile.identities?.release,key]);
