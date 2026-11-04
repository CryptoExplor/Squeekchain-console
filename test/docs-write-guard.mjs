// Test-process preload only. Deny mutations of documentation, including via a symlink.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {syncBuiltinESMExports} from 'node:module';
const docs=fileURLToPath(new URL('../docs',import.meta.url));
const originalRealpath=fs.realpathSync.bind(fs);
function canonical(value,followFinal=true){
 if(typeof value==='number'||value==null)return null;
 let target=path.resolve(value instanceof URL?fileURLToPath(value):String(value));
 if(!followFinal)return path.join(canonical(path.dirname(target)),path.basename(target));
 const suffix=[];
 while(true){try{return path.join(originalRealpath(target),...suffix);}catch{const parent=path.dirname(target);if(parent===target)return target;suffix.unshift(path.basename(target));target=parent;}}
}
export function assertWritable(value,{ancestors=false,followFinal=true}={}){
 const target=canonical(value,followFinal);if(!target)return;
 if(target===docs||target.startsWith(docs+path.sep)||(ancestors&&docs.startsWith(target+path.sep)))throw Object.assign(new Error(`Tests must not write under docs/: ${target}`),{code:'ERR_TEST_DOCS_WRITE'});
}
function protect(object,name,positions,ancestors=false,followFinal=true){const original=object[name];if(typeof original!=='function')return;object[name]=function(...args){for(const i of positions)assertWritable(args[i],{ancestors,followFinal});return Reflect.apply(original,this,args);};}
const marker=Symbol.for('wheelhouse.docs-write-guard');
if(!globalThis[marker]){
 globalThis[marker]=true;
 for(const object of [fs,fs.promises]){
  for(const name of ['writeFile','appendFile','truncate','mkdir','chmod','chown','lchown','lchmod','utimes','lutimes','createWriteStream'])for(const variant of [name,name+'Sync'])protect(object,variant,[0]);
  for(const name of ['rm','rmdir','unlink'])for(const variant of [name,name+'Sync'])protect(object,variant,[0],true,false);
  for(const name of ['rename'])for(const variant of [name,name+'Sync'])protect(object,variant,[0,1],true,false);
  for(const name of ['copyFile','cp','link','symlink'])for(const variant of [name,name+'Sync'])protect(object,variant,[1]);
  for(const name of ['open','openSync']){const original=object[name];if(!original)continue;object[name]=function(file,flags='r',...rest){if(typeof flags==='number'?(flags&(fs.constants.O_WRONLY|fs.constants.O_RDWR|fs.constants.O_CREAT|fs.constants.O_TRUNC|fs.constants.O_APPEND))!==0:/[wa+]/.test(flags))assertWritable(file);return Reflect.apply(original,this,[file,flags,...rest]);};}
 }
 syncBuiltinESMExports();
}
// Playwright workers and spawned Node tools inherit the same preload even when
// the runner was invoked directly rather than through the npm wrapper.
const preload=`--import=${import.meta.url}`;
if(!process.env.NODE_OPTIONS?.includes(preload))process.env.NODE_OPTIONS=[process.env.NODE_OPTIONS,preload].filter(Boolean).join(' ');
