import assert from 'node:assert/strict';
import { settlementStatus } from '../sdk/reward-status.js';
const sample = (expected,lagRounds='0')=>({core:{genesisTimestamp:'1000',roundDuration:'600',settledThroughRound:'1973'},mining:{lagRounds},snapshot:{timestamp:String(1000n+BigInt(expected)*600n)}});
assert.deepEqual(settlementStatus(sample(1976)),{expectedRound:'1976',stalled:true});
for (const round of [0,1972,1973,1974,1975]) assert.equal(settlementStatus(sample(round,'999')).stalled,false);
assert.equal(settlementStatus({...sample(1976),snapshot:{timestamp:'1186599'}}).stalled,false); // fractional round has not completed
for(const value of [null,{}, {...sample(1976),snapshot:{}},{...sample(1976),core:{...sample(1976).core,roundDuration:'0'}}])assert.equal(settlementStatus(value).stalled,null);
console.log('PASS settlement stall: completed rounds at snapshot time, >2 threshold, mocked v6 1973, independent checkpoint lag and Unknown');
