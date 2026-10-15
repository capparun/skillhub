import test from 'node:test';
import assert from 'node:assert/strict';
import {waitForFreshResults} from '../lib/result-freshness.js';
const baseline={count:1,total:'1',rows:[{name:'旧结果'}]};
test('unchanged old cards time out rather than become a successful search',async()=>{
 let reads=0;await assert.rejects(waitForFreshResults(async()=>{reads++;return baseline;},baseline,{pause:async()=>{},attempts:3}),{code:'TIMEOUT'});assert.equal(reads,3);
});
test('observed loading transition or changed content proves UI freshness',async()=>{
 for(const states of [[{...baseline,loading:true},baseline],[{...baseline,rows:[{name:'新结果'}]}],[{count:0,empty:true,rows:[]}]]) {
  const expected=states.at(-1);assert.deepEqual(await waitForFreshResults(async()=>states.shift(),baseline,{pause:async()=>{}}),expected);
 }
});
test('a completed newer search response proves freshness despite identical cards',async()=>{
 const before={...baseline,searchResponseEnd:100};
 const after={...before,searchResponseEnd:200};
 assert.deepEqual(await waitForFreshResults(async()=>after,before,{pause:async()=>{}}),after);
});
test('old or missing resource timing never makes identical cards fresh',async()=>{
 for(const value of [100,99,undefined,NaN])await assert.rejects(waitForFreshResults(async()=>({...baseline,searchResponseEnd:value}),{...baseline,searchResponseEnd:100},{pause:async()=>{},attempts:2}),{code:'TIMEOUT'});
});
