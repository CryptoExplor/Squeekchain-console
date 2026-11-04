// Run the existing test command unchanged, with a docs write guard inherited by children.
import './docs-write-guard.mjs';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {spawn} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const docs=fileURLToPath(new URL('../docs',import.meta.url));
function snapshot(dir=docs){return fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).flatMap(e=>{const p=path.join(dir,e.name);return e.isDirectory()?snapshot(p):[[path.relative(docs,p),createHash('sha256').update(fs.readFileSync(p)).digest('hex')]];});}
const before=JSON.stringify(snapshot()),command=process.argv[2];
if(!command)throw new Error('Test command required');
const child=spawn(command,{shell:true,stdio:'inherit',env:process.env});
child.on('error',error=>{console.error(error);process.exitCode=1;});
child.on('exit',(code,signal)=>{const size=fileURLToPath(new URL('../dist/js-size.json',import.meta.url));if(fs.existsSync(size)){fs.mkdirSync('artifacts',{recursive:true});fs.copyFileSync(size,'artifacts/js-size.json');}if(JSON.stringify(snapshot())!==before){console.error('FAIL: test command changed docs/');process.exitCode=1;}else process.exitCode=code??(signal?1:0);});
