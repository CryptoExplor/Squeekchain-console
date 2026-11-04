import {spawn,spawnSync} from 'node:child_process';
const upstream=process.env.SEPOLIA_FORK_URL;
if(!upstream)throw new Error('Set SEPOLIA_FORK_URL to your Sepolia RPC. This script only starts a local fork.');
const url=new URL(upstream);if(!['http:','https:'].includes(url.protocol))throw new Error('HTTP(S) fork source required');
const anvil=!spawnSync('anvil',['--version'],{stdio:'ignore'}).error;
const args=anvil?['--fork-url',upstream,'--chain-id','11155111','--host','127.0.0.1','--port','8545']:['hardhat','node','--config','dev/fork/hardhat.config.js','--fork',upstream,'--chain-id','11155111','--hostname','127.0.0.1','--port','8545'];
const child=spawn(anvil?'anvil':'npx',args,{stdio:'inherit'});for(const signal of ['SIGINT','SIGTERM'])process.on(signal,()=>child.kill(signal));child.on('exit',code=>process.exit(code??1));
