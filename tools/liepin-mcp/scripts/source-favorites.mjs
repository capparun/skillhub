// Sourcing run: search a keyword, open each result, favorite the ones worth
// keeping into one group, and read the group back at the end. Every browser
// action goes through the shipped site commands; this script only orchestrates
// them, keeps the pacing, and records what happened.
//
//   node tools/liepin-mcp/scripts/source-favorites.mjs \
//     --installation <customer-installation.json> \
//     --keyword 伺服驱动 --group 因时伺服控制 --target 30 \
//     --pages 3 --limit 10 --interval-ms 4000 \
//     --evidence <output.json>
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../..');
const load=p=>import(pathToFileURL(path.join(repo,p)).href);

const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0&&process.argv[i+1]?process.argv[i+1]:fallback;};
const installationPath=arg('installation');
const keyword=arg('keyword','伺服驱动');
const group=arg('group','因时伺服控制');
const target=Number(arg('target','30'));
const pages=Number(arg('pages','3'));
const limit=Number(arg('limit','10'));
const intervalMs=Number(arg('interval-ms','4000'));
const evidencePath=arg('evidence',path.join(process.cwd(),'sourcing.json'));
if(!installationPath)throw Error('需要 --installation 指向 customer-installation.json');
if(!Number.isSafeInteger(target)||target<1||target>60)throw Error('目标人数须为 1–60');
if(!Number.isSafeInteger(pages)||pages<1||pages>10)throw Error('页数须为 1–10');
if(!Number.isSafeInteger(intervalMs)||intervalMs<1000||intervalMs>60000)throw Error('间隔须为 1000–60000 毫秒');

const {BrowserClient}=await load('tools/liepin-mcp/lib/client.mjs');
const {initializeWorkflow,approveRound}=await load('distribution/liepin-search/runtime/packages/liepin/lib/workflow.js');
const {createSiteScope,bindSiteScope}=await load('distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js');
const {authorizeTask,grantOperations}=await load('distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js');
const {readTask}=await load('distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');

const installation=JSON.parse(fs.readFileSync(installationPath,'utf8'));
if(!installation.mcpServer)throw Error('安装回执缺少 mcpServer');
const SEARCH_URL='https://h.liepin.com/search/getConditionItem';
// The initial budget covers search plus one detail-open and one favorite per
// candidate; per-candidate favorite grants then raise it, capped at 100.
const budget=Math.min(100,2+target*2);
const work=path.join(path.dirname(path.resolve(evidencePath)),'sourcing-task');
fs.mkdirSync(work,{recursive:true});
const taskFile=path.join(work,'task.json'),scopeFile=path.join(work,'scope.json');
if(fs.existsSync(taskFile))throw Error('本轮寻访已开始：'+taskFile+'；中断后请先核对回执，不自动重放');
const now=()=>new Date().toISOString();
initializeWorkflow(taskFile,{title:'因时伺服方向寻访（'+keyword+'，目标 '+target+' 人）',
 criteria:[{id:'servo',label:'伺服驱动/运动控制相关经验',category:'experience',kind:'required',weight:1}],
 rounds:[{id:'sourcing-round',phase:'trial',filters:{keyword,pages,limit}}]});
createSiteScope(scopeFile,{label:'因时寻访 '+keyword,maxOperations:budget,confirmedAt:now()});
bindSiteScope(taskFile,scopeFile);

const client=new BrowserClient(undefined,{requestTimeoutMs:120000});
client.command=installation.mcpServer.command;client.args=installation.mcpServer.args;
const run=(name,args)=>client.js(`await sites.run('liepin',${JSON.stringify(name)},${JSON.stringify(args)})`);
const evidence=id=>readTask(taskFile).operations.find(o=>o.operationId===id)?.evidence;
const report={keyword,group,target,pages,limit,intervalMs,installation:installation.fingerprint??null,
 startedAt:now(),steps:[],added:[],skipped:[],failed:[]};
const step=(name,startedAt,extra)=>{const item={step:name,wallMs:Math.round(performance.now()-startedAt),...(extra??{})};report.steps.push(item);console.log(JSON.stringify(item));return item;};
const closeTab=async id=>{try{await client.js(`await browser.chrome.call('tabs.remove',[${Number(id)}])`);return true;}catch{return false;}};

let tabId,finished=false;
try{
 await client.start();
 await client.rpc('tools/call',{name:'sites_search',arguments:{query:'liepin',limit:30}}).catch(()=>{});
 let t=performance.now();
 tabId=String(await client.js(`(await browser.tabs.new(${JSON.stringify(SEARCH_URL)})).id`));
 const handle=client.claimOpenedTab(tabId);
 const bound=await handle.url();
 if(!/getConditionItem/.test(bound??''))throw Error('搜索页地址未确认：'+(bound??'空'));
 await client.js(`await (await browser.tabs.get(${JSON.stringify(tabId)})).release()`);
 await run('tabs',{});
 await run('bind',{file:taskFile,tab_id:tabId,expected_url:bound});
 step('open_search_tab_and_bind',t,{tabId});

 authorizeTask(taskFile,{allowedKinds:['prepare','search','detail-open','favorite','inspect'],maxOperations:budget,confirmedAt:now(),
  scope:'用户 2026-10-22 明确要求：完成 liepin MCP 开发验证，并帮因时（'+keyword+'）找到不少于 '+target+' 个目标候选人放入收藏夹「'+group+'」；不联系、不解锁',
  allowedRequests:[{kind:'prepare',payload:{page:tabId,filters:{keyword}}},{kind:'search',payload:{keyword,pages,limit}}]});

 t=performance.now();
 await run('prepare',{file:taskFile,tab_id:tabId,filters:{keyword},operation_id:'sourcing-prepare'});
 step('prepare',t,{applied:JSON.stringify(evidence('sourcing-prepare')?.applied??null).slice(0,120)});
 approveRound(taskFile,'sourcing-round',{confirmedAt:now(),scope:'因时寻访：授权本轮搜索 '+pages+' 页'});

 t=performance.now();
 await run('search',{file:taskFile,tab_id:tabId,round_id:'sourcing-round'});
 const searchEvidence=evidence('round-sourcing-round');
 const observations=readTask(taskFile).unlinkedObservations??[];
 step('search',t,{rows:searchEvidence?.rows?.length??0,observations:observations.length,total:searchEvidence?.total??null});

 // Snapshot the queue before any detail links an observation into a candidate.
 const queue=observations.slice(0,target).map((o,index)=>({id:o.id,hash:o.hash,name:o.data?.name??null,index}));
 if(queue.length<target)report.shortfall={wanted:target,available:queue.length};

 // Detail opens can be approved in batches; a favorite can only be approved once
 // the detail has revealed the resume identity and its tab.
 for(let i=0;i<queue.length;i+=25){
  const batch=queue.slice(i,i+25).map(item=>({kind:'detail-open',payload:{observationId:item.id,observationHash:item.hash,page:tabId}}));
  grantOperations(taskFile,{allowedRequests:batch,confirmedAt:now(),scope:'因时寻访：本批 '+batch.length+' 位人选的详情读取'});
 }

 for(const [position,item] of queue.entries()){
  const started=performance.now();
  try{
   await run('open-detail',{file:taskFile,tab_id:tabId,observation_id:item.id,operation_id:`sourcing-detail-${item.index}`});
   const detailEvidence=evidence(`sourcing-detail-${item.index}`);
   const detailTab=String(detailEvidence?.detailPage??'');
   const detailUrl=detailEvidence?.detail?.url??null;
   const resumeId=detailEvidence?.detail?.resumeId??null;
   if(!detailUrl||!resumeId)throw new Error('详情未确认');
   // open-detail's child tab belongs to the adapter's detail session, so it
   // cannot be bound for a favorite. Open the same address in our own tab.
   const ownId=String(await client.js(`(await browser.tabs.new(${JSON.stringify(detailUrl)})).id`));
   const ownHandle=client.claimOpenedTab(ownId);
   const ownUrl=await ownHandle.url();
   if(ownUrl!==detailUrl)throw Error('自建详情地址未确认');
   await client.js(`await (await browser.tabs.get(${JSON.stringify(ownId)})).release()`);
   await run('tabs',{});
   await run('bind',{file:taskFile,tab_id:ownId,expected_url:detailUrl});
   grantOperations(taskFile,{allowedRequests:[{kind:'favorite',payload:{resumeId,page:ownId,action:'add',group}}],confirmedAt:now(),scope:'因时寻访：将 '+resumeId+' 加入 '+group});
   await run('favorite',{file:taskFile,tab_id:ownId,resume_id:resumeId,group,action:'add',operation_id:`sourcing-fav-${item.index}`});
   const favoriteEvidence=evidence(`sourcing-fav-${item.index}`);
   const saved=favoriteEvidence?.saved===true;
   if(!saved)throw new Error('收藏未确认');
   const entry={position:position+1,name:detailEvidence?.detail?.title??item.name,resumeId,saved,changed:favoriteEvidence?.changed===true,clickMs:favoriteEvidence?.timings?.clickMs??null,wallMs:Math.round(performance.now()-started)};
   (favoriteEvidence?.changed===true?report.added:report.skipped).push(entry);
   console.log(JSON.stringify({candidate:entry}));
   await closeTab(ownId);
   if(detailTab)await closeTab(detailTab);
  }catch(error){
   report.failed.push({position:position+1,name:item.name,observationId:item.id,error:error.message});
   console.log(JSON.stringify({candidateFailed:{position:position+1,name:item.name,error:error.message}}));
  }
  if(position<queue.length-1)await new Promise(r=>setTimeout(r,intervalMs));
 }

 // Read the group back so the count is evidence, not an assumption.
 grantOperations(taskFile,{allowedRequests:[{kind:'inspect',payload:{view:'favorites',page:tabId,limit:Math.max(30,target),group,workspace:true}}],confirmedAt:now(),scope:'因时寻访：回读收藏分组核对人数'});
 t=performance.now();
 await run('favorites',{file:taskFile,tab_id:tabId,group,workspace:true,limit:Math.max(30,target),operation_id:'sourcing-readback'});
 const readback=evidence('sourcing-readback');
 step('favorites_readback',t,{status:readback?.status??null,total:readback?.total??null,rows:(readback?.rows??[]).length,groupReadback:readback?.groupReadback===true});
 report.readback={total:readback?.total??null,rows:(readback?.rows??[]).length,groupReadback:readback?.groupReadback===true,
  identities:(readback?.rows??[]).map(row=>row.resumeId).filter(Boolean)};
 report.totalWallMs=report.steps.reduce((sum,item)=>sum+item.wallMs,0);
 finished=true;
}catch(error){
 report.error=error.message;
}finally{
 if(tabId)await closeTab(tabId);
 report.finishedAt=now();
 report.summary={added:report.added.length,alreadyInGroup:report.skipped.length,failed:report.failed.length,
  readbackTotal:report.readback?.total??null,finished};
 fs.writeFileSync(evidencePath,JSON.stringify(report,null,1),{mode:0o600});
 console.log(JSON.stringify({summary:report.summary,error:report.error??null}));
 client.close();
}
if(!finished)process.exitCode=1;
