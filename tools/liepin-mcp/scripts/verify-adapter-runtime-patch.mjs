import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {pathToFileURL,fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';
const upstream=fs.realpathSync(process.argv[2]);
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-runtime-integration-'));
try{
 const output=path.join(temporary,'patch');
 execFileSync(process.execPath,[fileURLToPath(new URL('./build-adapter-runtime-patch.mjs',import.meta.url)),upstream,output]);
 const relative='dist/src/runtime/runtime.js',source=fs.readFileSync(path.join(output,relative),'utf8');
 const relocated=source.replace(/from '([^']+)'/g,(whole,spec)=>{
  if(!spec.startsWith('.'))return whole;
  const base=spec==='./hunter-adapter-tabs.mjs'?output:upstream;
  return `from '${pathToFileURL(path.resolve(base,'dist/src/runtime',spec)).href}'`;
 });
 const entry=path.join(temporary,'runtime.mjs');fs.writeFileSync(entry,relocated);
 const {Runtime}=await import(pathToFileURL(entry));
 const runtime=new Runtime(),routes=[],closed=[],chrome=[];
 runtime.hasFeature=name=>name==='chrome-api';
 runtime.bridge={send:async(action,args)=>{chrome.push({action,...args});return {data:{id:1,active:true}};}};
 runtime.createPage=async route=>{
  routes.push(route);return {getActivePage:()=>route.page,getCurrentUrl:async()=>`https://example.test/${route.page}`,closeTab:async id=>closed.push(id)};
 };
 const page={getActivePage:()=> '1',act:async()=>({openedTabs:[{page:'2',tabId:2}]})};
 const context=await runtime.toolContext(page,'liepin');
 await assert.rejects(context.tabs.child('2'),/not opened/);
 const result=await context.tab.act({action:'click',target:{selector:'#name'}});
 assert.equal(result.openedTabs[0].tab,'2');
 const child=await context.tabs.child('2');assert.equal(await child.url(),'https://example.test/2');
 await context.tabs.closeChild('2');await context.tabs.returnToParent();
 assert.deepEqual(routes,[{session:'site:liepin',surface:'adapter',page:'2'}]);
 assert.deepEqual(closed,['2']);assert.deepEqual(context.tabs.opened(),[]);
 assert.equal(chrome.length,2);assert.ok(chrome.every(c=>c.session==='site:liepin'&&c.surface==='adapter'));
 assert.deepEqual(chrome.map(c=>c.chromeMethod),['tabs.update','tabs.get']);
 const unrelated=await runtime.toolContext(page,'other');assert.equal(unrelated.tabs,undefined);
 const existingUrl='https://h.liepin.com/search/getConditionItem';
 let preferred='1',claimed;
 const bindingPage={...page,userTabs:async()=>claimed?[]:[{tabId:3,url:existingUrl}],tabs:async()=>claimed?[{tabId:3,url:existingUrl,state:'active'}]:[],claim:async request=>{claimed=request;preferred='3';return {page:'3',tabId:3,url:existingUrl};}};
 const binding=await runtime.toolContext(bindingPage,'liepin');
 assert.deepEqual(await binding.userTabs.bind('3',existingUrl),{id:'3',ownership:'user'});
 assert.deepEqual(claimed,{tabId:3,expectedUrl:existingUrl});
 const resumed=await runtime.toolContext(bindingPage,'liepin');
 assert.equal((await resumed.userTabs.list())[0].tabId,3);
 assert.deepEqual(await resumed.userTabs.bind('3',existingUrl),{id:'3',ownership:'user'});
 assert.deepEqual(binding.tabs.opened(),[]);
 runtime.createPage=async route=>({getActivePage:()=>route.page,tabs:async()=>[{page:'1',state:'active',selected:preferred==='1'},{page:'3',state:'active',selected:preferred==='3'}]});
 const nextPage=await runtime.getAdapterPage('liepin');
 const nextContext=await runtime.toolContext(nextPage,'liepin');assert.equal(nextContext.tab.id,'3');

 // Exercise the real executor too: toolContext alone cannot prove adapter delivery.
 const executorSource=fs.readFileSync(path.join(output,'dist/src/sites/executor.js'),'utf8').replace(/from '([^']+)'/g,(whole,spec)=>spec.startsWith('.')?`from '${pathToFileURL(path.resolve(upstream,'dist/src/sites',spec)).href}'`:whole);
 const executorEntry=path.join(temporary,'executor.mjs');fs.writeFileSync(executorEntry,executorSource);
 const {runAdapter}=await import(pathToFileURL(executorEntry));
 for(const site of ['liepin','other']){
  const result=await runAdapter({browserAvailable:()=>true,getAdapterPage:async()=>page,toolContext:()=>runtime.toolContext(page,site)},
   {site,name:'context-probe',args:[],result:{kind:'value'},run:async ctx=>({tabs:typeof ctx.tabs?.child,userTabs:typeof ctx.userTabs?.list})},{});
  assert.equal(result.ok,true);assert.equal(result.value.tabs,site==='liepin'?'function':'undefined');
  assert.equal(result.value.userTabs,site==='liepin'?'function':'undefined');
 }
 const manifest=JSON.parse(fs.readFileSync(path.join(output,'patch-manifest.json')));
 console.log(JSON.stringify({upstream:'0.0.30',browserAccessed:false,actualRuntimeAndTabClasses:true,checks:{actualExecutorForwardsCompatibility:true,childOnly:true,sameAdapterSession:true,parentRetained:true,activationVerified:true,otherSitesUnchanged:true,userBindingDoesNotOwnTab:true,nextCallUsesSelectedBinding:true},patch:manifest.files},null,2));
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
