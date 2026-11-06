// Wait only for deployment readiness; never retry a failed chain probe or scan.
import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import {setTimeout} from 'node:timers/promises';
const sha=process.env.QA_HEAD_SHA,repo=process.env.QA_REPOSITORY;
if(!/^[a-f0-9]{40}$/.test(sha??'')||!/^CryptoExplor\/Squeekchain-console$/i.test(repo??''))throw new Error('Expected this PR repository and exact head SHA');
const deadline=Date.now()+180000;
while(Date.now()<deadline){
 const result=JSON.parse(execFileSync('gh',['api',`repos/${repo}/commits/${sha}/check-runs`],{encoding:'utf8'}));
 const check=result.check_runs.find(check=>check.name==='Cloudflare Pages'&&check.head_sha===sha);
 const url=check?.output?.summary?.match(/https:\/\/[a-f0-9]{8}\.wheel-house\.pages\.dev/)?.[0];
 if(check?.conclusion==='success'&&url){fs.appendFileSync(process.env.GITHUB_ENV,`QA_PREVIEW_URL=${url}\n`);console.log(`Read-only QA will inspect ${sha} at ${url}`);process.exit(0);}
 await setTimeout(15000);
}
throw new Error('Exact-head automatic preview not ready; no fallback to an older deployment');
