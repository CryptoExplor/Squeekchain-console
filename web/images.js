// Isolated <img> data/blob sources only. No SVG markup is inserted into the document.
import {DAY,displayKey} from './bundle.js';
export function createImages({cache,fetcher,win=window}){
 const urls=new Set(),pending=new Map();
 const source=item=>{if(item.blob){const url=win.URL.createObjectURL(item.blob);urls.add(url);return {...item,image:url};}if(!/^data:image\/(?:svg\+xml|png|webp|jpeg);base64,/.test(item.image??''))throw new Error('Unsupported image');return item;};
 async function load({profile,token,api,fallback,signal}){const key=displayKey(profile,`image:${token.tokenId}:${token.level}`);if(pending.has(key))return pending.get(key);
 const work=(async()=>{const saved=await cache.get(key);signal?.throwIfAborted();if(saved&&Date.now()-saved.at<DAY)return source(saved.item);let item;
 if(api){try{const result=await api.squeek(String(token.tokenId),token.level),metadata=result.data.metadata;if(metadata?.status!=='available')throw new Error('Image unavailable');item={tokenId:String(token.tokenId),level:token.level,name:metadata.name,description:metadata.description,attributes:(metadata.attributes??[]).map(a=>({trait:a.traitType,value:a.value}))};
 if(metadata.cardImageUrl){try{const url=new URL(metadata.cardImageUrl,'https://api.squeekchain.com');if(url.protocol!=='https:'||url.username||url.password)throw new Error('Unsafe image URL');const response=await fetcher(url.href,{credentials:'omit',mode:'cors',signal});if(!response.ok)throw new Error('Image unavailable');const blob=await response.blob();if(!['image/png','image/jpeg','image/webp','image/svg+xml'].includes(blob.type)||blob.size>2097152)throw new Error('Invalid image');item.blob=blob;}catch{item.image=metadata.imageDataUri;}}else item.image=metadata.imageDataUri;if(!item.blob)source(item);
 }catch(error){if(error.name==='RpcTrustError'||signal?.aborted)throw error;item=null;}}
 if(!item)item=await fallback();signal?.throwIfAborted();if(!item.blob)source(item);await cache.set(key,{at:Date.now(),item});return source(item);
 })().finally(()=>pending.delete(key));pending.set(key,work);return work;}
 return {load,destroy(){for(const url of urls)win.URL.revokeObjectURL(url);urls.clear();}};
}
