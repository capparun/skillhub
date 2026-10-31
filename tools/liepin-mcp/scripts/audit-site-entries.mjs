// Load repository adapters through the actual pinned upstream loader/executor, without Chrome.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const upstream=fs.realpathSync(process.argv[2]);
assert.equal(JSON.parse(fs.readFileSync(path.join(upstream,'package.json'))).version,'0.0.30');
const {SiteRegistry}=await import(pathToFileURL(path.join(upstream,'dist/src/sites/loader.js')));
const {runAdapter}=await import(pathToFileURL(path.join(upstream,'dist/src/sites/executor.js')));
const sourceRoot=fileURLToPath(new URL('../adapters/liepin/',import.meta.url));
const temporary=fs.mkdtempSync(path.join(os.tmpdir(),'official-liepin-entries-'));
try{
 fs.mkdirSync(path.join(temporary,'liepin'));const entries=[];
 for(const name of fs.readdirSync(sourceRoot).filter(name=>name.endsWith('.js'))){
  // Resolve package-relative imports for this temporary audit only, without changing global dependencies.
  const source=fs.readFileSync(path.join(sourceRoot,name),'utf8').replace(/from '([^']+)'/g,(whole,spec)=>{
   const target=spec==='opencli-mcp/adapter-sdk'?path.join(upstream,'adapter-sdk/index.js'):spec.startsWith('.')?path.resolve(sourceRoot,spec):null;
   return target?`from '${pathToFileURL(target).href}'`:whole;
  });
  fs.writeFileSync(path.join(temporary,'liepin',name),source);entries.push(name.slice(0,-3));
 }
 const registry=new SiteRegistry([{dir:temporary,kind:'user'}]);const checks=[];
 for(const name of entries){
  const command=await registry.resolve('liepin',name);let reads=0;
  const provider={browserAvailable:()=>true,getAdapterPage:async()=>({}),toolContext:async()=>({tab:{id:'1',url:async()=>{reads++;throw Error('unexpected read');}},sites:{},recon:{}})};
  let args={file:'/nonexistent',...(name==='detail-batch'?{id:'synthetic'}:{}),...(name==='favorite'?{action:'status',resume_id:'synthetic'}:{}),...(name==='saved-search'?{action:'list'}:{}),...(name==='open-detail'?{observation_id:'synthetic'}:{}),...(name==='connect'?{}:{tab_id:'2'}),...(name==='search'?{round_id:'trial'}:name==='detail-batch'?{}:{operation_id:'probe'}),...(name==='prepare'?{filters:{keyword:'合成'}}:name==='current-detail'?{resume_id:'synthetic'}:{})};
  if(name==='tabs')args={};
  if(name==='bind')args={file:'/nonexistent',tab_id:'2',expected_url:'https://h.liepin.com/search/getConditionItem'};
  const result=await runAdapter(provider,command,args);
  assert.equal(result.ok,false);assert.match(result.error.message,['tabs','bind'].includes(name)?/缺少已打开标签/:name==='connect'?/ENOENT/:/绑定的页面/);assert.equal(reads,0);
  checks.push({name,access:command.access,loaded:true,...(['tabs','bind'].includes(name)?{missingCompatibilityRejected:true}:name==='connect'?{missingTaskRejectedBeforeRead:true}:{wrongTabRejectedBeforeRead:true}),...(name==='prepare'?{filterCount:Object.keys(command.args.find(arg=>arg.name==='filters').properties).length}:{})});
 }
 console.log(JSON.stringify({upstream:'0.0.30',browserAccessed:false,checks},null,2));
}finally{fs.rmSync(temporary,{recursive:true,force:true});}
