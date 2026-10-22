// Sourcing run in two phases, because the adapter binds to the site session's
// selected tab (or its first active one): a search tab and a detail tab in the
// same session make that choice ambiguous and the favorite lands on the wrong
// page.
//
//   node tools/liepin-mcp/scripts/source-favorites.mjs \
//     --installation <customer-installation.json> \
//     --keyword 伺服驱动 --group 因时伺服控制 --target 20 \
//     --pages 4 --page 4 --interval-ms 6000 \
//     --evidence <output.json>
//
// Phase 1 searches and opens each card once, keeping the detail address; the
// search tab is then closed so the site session holds a single tab.
// Phase 2 opens each detail address in its own tab and favorites it.
// Phase 3 reads the group back. Every step is a shipped site command.
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
const target=Number(arg('target','20'));
const pages=Number(arg('pages','4'));
const limit=Number(arg('limit','10'));
const intervalMs=Number(arg('interval-ms','6000'));
const skipRead=arg('skip-read','true')!=='false';
const evidencePath=arg('evidence',path.join(process.cwd(),'sourcing.json'));
if(!installationPath)throw Error('需要 --installation 指向 customer-installation.json');
if(!Number.isSafeInteger(target)||target<1||target>40)throw Error('目标人数须为 1–40');
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
const FAVORITES_URL='https://h.liepin.com/resumemanage/showmytalentlist';
const budget=Math.min(100,2+target*2+2);
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
 startedAt:now(),steps:[],read:[],added:[],skipped:[],failed:[]};
const step=(name,startedAt,extra)=>{const item={step:name,wallMs:Math.round(performance.now()-startedAt),...(extra??{})};report.steps.push(item);console.log(JSON.stringify(item));return item;};
const closeTab=async id=>{try{await client.js(`await browser.chrome.call('tabs.remove',[${Number(id)}])`);return true;}catch{return false;}};
// A redirect to safe.liepin.com is the account security check, not a page the
// product can drive. Stop the whole run and say so instead of failing later on
// a bind with an unrelated message.
const assertNotSecurityCheck=url=>{
 if(/^https:\/\/safe\.liepin\.com\//.test(String(url??'')))
  throw new Error('猎聘要求账号安全验证（safe.liepin.com）：请在浏览器里手动点通该页面，再重新开始；不要自动重试');
};
// Open a page in this session and bind it into the site session.
const ownAndBind=async url=>{
 const id=String(await client.js(`(await browser.tabs.new(${JSON.stringify(url)})).id`));
 const handle=client.claimOpenedTab(id);
 const actual=await handle.url();
 assertNotSecurityCheck(actual);
 if(actual!==url)throw Error('自建页面地址未确认：'+String(actual));
 await client.js(`await (await browser.tabs.get(${JSON.stringify(id)})).release()`);
 await run('tabs',{});
 await run('bind',{file:taskFile,tab_id:id,expected_url:url});
 return id;
};

let searchTab,finished=false;
try{
 await client.start();
 await client.rpc('tools/call',{name:'sites_search',arguments:{query:'liepin',limit:30}}).catch(()=>{});

 // ---- Phase 1: search, then read every card once ------------------------
 let t=performance.now();
 searchTab=String(await client.js(`(await browser.tabs.new(${JSON.stringify(SEARCH_URL)})).id`));
 const handle=client.claimOpenedTab(searchTab);
 const bound=await handle.url();
 assertNotSecurityCheck(bound);
 if(!/getConditionItem/.test(bound??''))throw Error('搜索页地址未确认：'+(bound??'空'));
 await client.js(`await (await browser.tabs.get(${JSON.stringify(searchTab)})).release()`);
 await run('tabs',{});
 await run('bind',{file:taskFile,tab_id:searchTab,expected_url:bound});
 step('open_search_tab_and_bind',t,{tabId:searchTab});

 authorizeTask(taskFile,{allowedKinds:['prepare','search','detail-open','favorite','inspect'],maxOperations:budget,confirmedAt:now(),
  scope:'用户 2026-10-22 明确要求：完成 liepin MCP 开发验证，并帮因时（'+keyword+'）找到不少于 '+target+' 个目标候选人放入收藏夹「'+group+'」；不联系、不解锁',
  allowedRequests:[{kind:'prepare',payload:{page:searchTab,filters:{keyword}}},{kind:'search',payload:{keyword,pages,limit}}]});

 t=performance.now();
 await run('prepare',{file:taskFile,tab_id:searchTab,filters:{keyword},operation_id:'sourcing-prepare'});
 step('prepare',t,{applied:JSON.stringify(evidence('sourcing-prepare')?.applied??null).slice(0,120)});
 approveRound(taskFile,'sourcing-round',{confirmedAt:now(),scope:'因时寻访：授权本轮搜索 '+pages+' 页'});

 t=performance.now();
 await run('search',{file:taskFile,tab_id:searchTab,round_id:'sourcing-round'});
 const searchEvidence=evidence('round-sourcing-round');
 const observations=readTask(taskFile).unlinkedObservations??[];
 step('search',t,{rows:searchEvidence?.rows?.length??0,observations:observations.length,total:searchEvidence?.total??null});

 // Only the page the search finished on is still on screen, and a card already
 // opened today carries Liepin's read marker, which the product's own
 // consistency check refuses; both are skipped rather than retried.
 const pageNumbers=[...new Set(observations.map(o=>o.data?.page).filter(Number.isInteger))].sort((a,b)=>a-b);
 const targetPage=arg('page')?Number(arg('page')):pageNumbers.at(-1);
 const onPage=observations.filter(o=>o.data?.page===targetPage);
 const queue=onPage.filter(o=>!(skipRead&&/阅/.test(String(o.data?.name??'')))).slice(0,target);
 report.queue={observed:observations.length,pages:pageNumbers,targetPage,onPage:onPage.length,queued:queue.length};

 for(let i=0;i<queue.length;i+=25){
  grantOperations(taskFile,{allowedRequests:queue.slice(i,i+25).map(item=>({kind:'detail-open',payload:{observationId:item.id,observationHash:item.hash,page:searchTab}})),confirmedAt:now(),scope:'因时寻访：本批详情读取'});
 }

 const collected=[];
 for(const [position,item] of queue.entries()){
  const started=performance.now();
  try{
   await run('open-detail',{file:taskFile,tab_id:searchTab,observation_id:item.id,operation_id:`sourcing-detail-${position}`});
   const detailEvidence=evidence(`sourcing-detail-${position}`);
   const resumeId=detailEvidence?.detail?.resumeId??null;
   const detailUrl=detailEvidence?.detail?.url??null;
   if(!resumeId||!detailUrl)throw new Error('详情未确认');
   collected.push({resumeId,detailUrl,name:item.name??null});
   report.read.push({position:position+1,resumeId,status:detailEvidence?.detail?.status??null,wallMs:Math.round(performance.now()-started)});
   console.log(JSON.stringify({read:{position:position+1,resumeId,status:detailEvidence?.detail?.status??null}}));
  }catch(error){
   report.failed.push({position:position+1,name:item.name,stage:'detail',error:error.message});
   console.log(JSON.stringify({readFailed:{position:position+1,name:item.name,error:error.message}}));
  }
  if(position<queue.length-1)await new Promise(r=>setTimeout(r,intervalMs));
 }
 await closeTab(searchTab);
 searchTab=null;
 step('details_read',t,{read:collected.length,failed:report.failed.length});

 // ---- Phase 2: favorite each collected detail ---------------------------
 for(const [position,item] of collected.entries()){
  const started=performance.now();
  let ownId=null;
  try{
   ownId=await ownAndBind(item.detailUrl);
   grantOperations(taskFile,{allowedRequests:[{kind:'favorite',payload:{resumeId:item.resumeId,page:ownId,action:'add',group}}],confirmedAt:now(),scope:'因时寻访：将 '+item.resumeId+' 加入 '+group});
   await run('favorite',{file:taskFile,tab_id:ownId,resume_id:item.resumeId,group,action:'add',operation_id:`sourcing-fav-${position}`});
   const favoriteEvidence=evidence(`sourcing-fav-${position}`);
   if(favoriteEvidence?.saved!==true)throw new Error('收藏未确认');
   const entry={position:position+1,resumeId:item.resumeId,saved:true,changed:favoriteEvidence?.changed===true,clickMs:favoriteEvidence?.timings?.clickMs??null,wallMs:Math.round(performance.now()-started)};
   (favoriteEvidence?.changed===true?report.added:report.skipped).push(entry);
   console.log(JSON.stringify({candidate:entry}));
  }catch(error){
   report.failed.push({position:position+1,resumeId:item.resumeId,stage:'favorite',error:error.message});
   console.log(JSON.stringify({favoriteFailed:{position:position+1,resumeId:item.resumeId,error:error.message}}));
  }finally{
   if(ownId)await closeTab(ownId);
  }
  if(position<collected.length-1)await new Promise(r=>setTimeout(r,intervalMs));
 }

 // ---- Phase 3: read the group back -------------------------------------
 t=performance.now();
 const favoritesTab=await ownAndBind(FAVORITES_URL);
 grantOperations(taskFile,{allowedRequests:[{kind:'inspect',payload:{view:'favorites',page:favoritesTab,limit:Math.max(30,target),group,workspace:true}}],confirmedAt:now(),scope:'因时寻访：回读收藏分组核对人数'});
 await run('favorites',{file:taskFile,tab_id:favoritesTab,group,workspace:true,limit:Math.max(30,target),operation_id:'sourcing-readback'});
 const readback=evidence('sourcing-readback');
 step('favorites_readback',t,{status:readback?.status??null,total:readback?.total??null,rows:(readback?.rows??[]).length,groupReadback:readback?.groupReadback===true});
 report.readback={total:readback?.total??null,rows:(readback?.rows??[]).length,groupReadback:readback?.groupReadback===true,
  identities:(readback?.rows??[]).map(row=>row.resumeId).filter(Boolean)};
 await closeTab(favoritesTab);
 report.totalWallMs=report.steps.reduce((sum,item)=>sum+item.wallMs,0);
 finished=true;
}catch(error){
 report.error=error.message;
}finally{
 if(searchTab)await closeTab(searchTab);
 report.finishedAt=now();
 report.summary={read:report.read.length,added:report.added.length,alreadyInGroup:report.skipped.length,failed:report.failed.length,
  readbackTotal:report.readback?.total??null,finished};
 fs.writeFileSync(evidencePath,JSON.stringify(report,null,1),{mode:0o600});
 console.log(JSON.stringify({summary:report.summary,error:report.error??null}));
 client.close();
}
if(!finished)process.exitCode=1;
