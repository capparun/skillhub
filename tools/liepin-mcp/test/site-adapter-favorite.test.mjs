import test from 'node:test';
import assert from 'node:assert/strict';
import {adapterFavoriteDriver} from '../lib/site-adapter-favorite.mjs';
const url='https://h.liepin.com/resume/showresumedetail/?res_id_encode=abc';
test('favorite dispatch requires observed target and consumes it until next observation',async()=>{
 let calls=0;const logs=[];
 const driver=adapterFavoriteDriver({url:async()=>url,evaluate:async()=>({known:true,saved:false,button:'#favorite'}),act:async()=>{calls++;}},{resumeId:'abc',onAction:e=>logs.push(e)});
 await driver.inspect();await driver.click('#favorite');
 await assert.rejects(driver.click('#favorite'),/未经/);assert.equal(calls,1);assert.equal(logs[0].favoriteState.groupSelected,false);assert.equal(logs.find(e=>e.phase==='dispatching').description,'点击收藏按钮');
});
test('unobserved target and wrong identity never click',async()=>{
 let calls=0;
 const make=u=>adapterFavoriteDriver({url:async()=>u,evaluate:async()=>({known:true,button:'#favorite'}),act:async()=>calls++},{resumeId:'abc'});
 const good=make(url);await good.inspect();await assert.rejects(good.click('#message'),/未经/);
 await assert.rejects(make(url+'&res_id_encode=other').inspect(),/身份/);assert.equal(calls,0);
});
