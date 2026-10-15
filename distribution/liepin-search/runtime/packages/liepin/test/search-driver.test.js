import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {createSearchDriver,prepareResultObservation} from '../lib/search-driver.js';
import {inspect} from '../lib/dom.js';
import {run} from '../lib/engine.js';
const expectedUrl='https://h.liepin.com/search/getConditionItem#session';
test('fixed DOM observer refuses wrong pages before reading their body',()=>{
 const context={location:{origin:'https://example.com',pathname:'/',href:'https://example.com/'},document:{get body(){assert.fail('must not read');}}};
 assert.equal(vm.runInNewContext(`(${inspect.toString()})({})`,context).blocked,true);
});
test('adapter permits only the search observer and stays stopped after a read failure',async()=>{
 let calls=0;const d=createSearchDriver({evaluate:async()=>{calls++;}},{expectedUrl,actions:{}});
 await assert.rejects(d.evaluate(()=>document.body.innerText));
 await assert.rejects(d.evaluate(inspect));assert.equal(calls,0);
});
test('page changes, risk and login stop subsequent mutations',async()=>{
 for(const state of [{url:expectedUrl,risk:true},{url:expectedUrl,login:true},{url:'https://example.com'}]) {
  const d=createSearchDriver({evaluate:async()=>state},{expectedUrl,actions:{click:()=>assert.fail('must not click')}});
  await assert.rejects(d.evaluate(inspect));await assert.rejects(d.click('#submit'));
 }
});
test('complete keyword search uses the fixed adapter and submits exactly once',async()=>{
 let value='';const clicked=[];const ids=[];
 let scrolled=false,prepared=0;
 const actions={scrollTo:async a=>{assert.equal(a.selector,'#keyword');ids.push(a.actionId);scrolled=true;},click:async a=>{assert.equal(scrolled,true);ids.push(a.actionId);clicked.push(a.selector);},fill:async a=>{ids.push(a.actionId);value=a.value;}};
 const page={evaluate:async(fn,args)=>{
  if(fn===prepareResultObservation){assert.ok(args.expectedUrls.includes(expectedUrl));prepared++;return {url:expectedUrl};}
  assert.equal(fn,inspect);assert.equal(args.expectedUrl,expectedUrl);
  const base={url:expectedUrl,login:false,risk:false,blank:false};
  if(args.mode==='controls')return {...base,submit:'#submit'};
  if(args.mode==='results')return clicked.includes('#submit')?{...base,count:1,total:'1',rows:[{name:'合成人员',resumeId:'fixture-1'}]}:{...base,count:0,rows:[]};
  return {...base,target:'#keyword',value};
 }};
 const result=await run(createSearchDriver(page,{expectedUrl,actions}),{keyword:'开发工程师'},{pause:async()=>{}});
 assert.equal(result.rows.length,1);assert.deepEqual(clicked,['#keyword','#submit']);assert.equal(new Set(ids).size,4);assert.equal(prepared,1);
});

test('real-site #session transition remains on the same search resource; other changes stop',async()=>{
 for(const url of ['https://h.liepin.com/search/getConditionItem','https://h.liepin.com/search/getConditionItem#session']) {
  const driver=createSearchDriver({evaluate:async()=>({url})},{expectedUrl,actions:{}});
  assert.equal((await driver.evaluate(inspect)).url,url);
 }
 for(const url of ['about:blank','https://h.liepin.com/search/getConditionItem?other=1','https://h.liepin.com/search/getConditionItem#other','https://h.liepin.com/']) {
  const driver=createSearchDriver({evaluate:async()=>({url})},{expectedUrl,actions:{}});
  await assert.rejects(driver.evaluate(inspect),/搜索页已变化/);
 }
});

 test('saved-search observer is dispatched and rejects wrong pages before DOM reads',async()=>{
 const {inspectRecords}=await import('../lib/records-dom.js');
 const driver=createSearchDriver({evaluate:async(fn)=>{assert.equal(fn,inspectRecords);return {url:expectedUrl,schemes:[],blank:false};}},{expectedUrl,actions:{}});
 assert.deepEqual((await driver.evaluate(inspectRecords)).schemes,[]);
 const context={location:{origin:'https://example.com',pathname:'/',href:'https://example.com/'},document:{get body(){assert.fail('must not read');}}};
 assert.equal(vm.runInNewContext(`(${inspectRecords.toString()})({})`,context).blocked,true);
 });

test('response observation expands the passive resource buffer only on the bound page',()=>{
 let size;const context={location:{href:expectedUrl},performance:{setResourceTimingBufferSize:value=>{size=value;}}};
 vm.runInNewContext(`(${prepareResultObservation.toString()})({expectedUrls:[${JSON.stringify(expectedUrl)}]})`,context);assert.equal(size,2000);
 context.location.href='https://example.com';size=undefined;
 assert.throws(()=>vm.runInNewContext(`(${prepareResultObservation.toString()})({expectedUrls:[${JSON.stringify(expectedUrl)}]})`,context));assert.equal(size,undefined);
});
