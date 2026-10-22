// Sourcing driven by resume id instead of by clicking cards.
//
//   search (N pages, one query) -> candidate ids from the list row class
//   -> open each detail by id in this session's own tab -> read it
//   -> judge fit -> favorite when it fits -> group readback
//
// No card click, no popup detail tab, no re-search per page: every step is a
// shipped site command, and the only address built here is the detail URL that
// detail.js already defines for a resume id.
//
//   node tools/liepin-mcp/scripts/source-by-id.mjs \
//     --installation <customer-installation.json> \
//     --keyword 伺服驱动 --group 因时伺服控制 --target 5 \
//     --pages 2 --interval-ms 40000 --evidence <output.json>
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
const target=Number(arg('target','5'));
const pages=Number(arg('pages','2'));
const limit=Number(arg('limit','10'));
const intervalMs=Number(arg('interval-ms','40000'));
const dryRun=arg('dry-run','false')==='true';
const fromPage=Number(arg('from-page','1'));
// Re-check mode: look at one resume by id instead of running a search. Passing
// the observed detail URL keeps the original search context; a bare id opens a
// cold URL, which is recorded so the ledger can tell the two apart.
const onlyId=arg('only');
const onlyUrl=arg('url');
const favoriteOnRecheck=arg('favorite','false')==='true';
const fitPattern=arg('fit','伺服|驱动|运动控制|电机|自动化|变频');
const evidencePath=arg('evidence',path.join(process.cwd(),'source-by-id.json'));
if(!installationPath)throw Error('需要 --installation 指向 customer-installation.json');
if(!Number.isSafeInteger(target)||target<1||target>40)throw Error('目标人数须为 1–40');
if(!Number.isSafeInteger(pages)||pages<1||pages>10)throw Error('页数须为 1–10');
if(!Number.isSafeInteger(intervalMs)||intervalMs<1000||intervalMs>120000)throw Error('间隔须为 1000–120000 毫秒');

const {BrowserClient}=await load('tools/liepin-mcp/lib/client.mjs');
const {initializeWorkflow,approveRound}=await load('distribution/liepin-search/runtime/packages/liepin/lib/workflow.js');
const {createSiteScope,bindSiteScope}=await load('distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js');
const {authorizeTask,grantOperations}=await load('distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js');
const {readTask}=await load('distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');
const {detailUrl}=await load('distribution/liepin-search/runtime/packages/liepin/lib/detail.js');

const installation=JSON.parse(fs.readFileSync(installationPath,'utf8'));
if(!installation.mcpServer)throw Error('安装回执缺少 mcpServer');
const SEARCH_URL='https://h.liepin.com/search/getConditionItem';
const FAVORITES_URL='https://h.liepin.com/resumemanage/showmytalentlist';
const budget=Math.min(100,2+target*2+2);
const work=path.join(path.dirname(path.resolve(evidencePath)),'source-by-id-task');
fs.mkdirSync(work,{recursive:true});
const taskFile=path.join(work,'task.json'),scopeFile=path.join(work,'scope.json');
if(fs.existsSync(taskFile))throw Error('本轮已开始：'+taskFile+'；中断后先核对回执，不自动重放');
const now=()=>new Date().toISOString();
initializeWorkflow(taskFile,{title:'因时伺服方向寻访（按简历ID，'+keyword+'）',
 criteria:[{id:'servo',label:'伺服/驱动/运动控制相关经验',category:'experience',kind:'required',weight:1}],
 rounds:[{id:'sourcing-round',phase:'trial',filters:{keyword,pages,limit}}]});
createSiteScope(scopeFile,{label:'因时寻访 '+keyword,maxOperations:budget,confirmedAt:now()});
bindSiteScope(taskFile,scopeFile);

const client=new BrowserClient(undefined,{requestTimeoutMs:120000});
client.command=installation.mcpServer.command;client.args=installation.mcpServer.args;
const run=(name,args)=>client.js(`await sites.run('liepin',${JSON.stringify(name)},${JSON.stringify(args)})`);
const evidence=id=>readTask(taskFile).operations.find(o=>o.operationId===id)?.evidence;
const report={keyword,group,target,pages,limit,intervalMs,dryRun,fitPattern,
 installation:installation.fingerprint??null,startedAt:now(),steps:[],rows:[],added:[],skipped:[],failed:[]};
const step=(name,startedAt,extra)=>{const item={step:name,wallMs:Math.round(performance.now()-startedAt),...(extra??{})};report.steps.push(item);console.log(JSON.stringify(item));return item;};
const closeTab=async id=>{try{await client.js(`await browser.chrome.call('tabs.remove',[${Number(id)}])`);return true;}catch{return false;}};
const assertNotSecurityCheck=url=>{
 if(/^https:\/\/safe\.liepin\.com\//.test(String(url??'')))
  throw new Error('猎聘要求账号安全验证（safe.liepin.com）：请在浏览器里手动点通该页面，再重新开始；不要自动重试');
};
// A freshly opened tab answers long before it has rendered. Reading a detail
// page at that moment returns an empty body, which the product records as an
// unrecognised page and pauses the task, so wait for real text first.
const waitForText=async(id,minChars,timeoutMs=20000)=>{
 const startedAt=Date.now();
 while(Date.now()-startedAt<timeoutMs){
  const info=await client.js(`await (async()=>{const t=await browser.tabs.get(${JSON.stringify(id)});
    return {url:await t.url(),chars:Number(await t.evaluate(() => (document.body?.innerText ?? '').length))};})()`);
  assertNotSecurityCheck(info?.url);
  if(Number(info?.chars)>=minChars)return info;
  await new Promise(r=>setTimeout(r,500));
 }
 return null;
};
const ownAndBind=async(url,{minChars=0}={})=>{
 const id=String(await client.js(`(await browser.tabs.new(${JSON.stringify(url)})).id`));
 const handle=client.claimOpenedTab(id);
 const actual=await handle.url();
 assertNotSecurityCheck(actual);
 if(actual!==url)throw Error('自建页面地址未确认：'+String(actual));
 if(minChars>0){
  const ready=await waitForText(id,minChars);
  if(!ready)throw Error('页面在限定时间内没有渲染出正文：'+url);
 }
 await client.js(`await (await browser.tabs.get(${JSON.stringify(id)})).release()`);
 await run('tabs',{});
 await run('bind',{file:taskFile,tab_id:id,expected_url:url});
 return id;
};

let searchTab,finished=false;
try{
 await client.start();
 await client.rpc('tools/call',{name:'sites_search',arguments:{query:'liepin',limit:30}}).catch(()=>{});

 if(onlyId){
  const url=onlyUrl??detailUrl(onlyId),coldOpen=!onlyUrl;
  report.mode='recheck';report.coldOpen=coldOpen;report.resumeId=onlyId;
  authorizeTask(taskFile,{allowedKinds:['detail','favorite'],maxOperations:4,confirmedAt:now(),
   scope:'用户 2026-10-22 复核单人简历：只读该人正文'+(favoriteOnRecheck?'，符合则加入 '+group:''),
   allowedRequests:[{kind:'detail',payload:{resumeId:onlyId,page:'pending'}}]});
  const tabId=await ownAndBind(url,{minChars:300});
  grantOperations(taskFile,{allowedRequests:[{kind:'detail',payload:{resumeId:onlyId,page:tabId}}],confirmedAt:now(),scope:'复核 '+onlyId+' 的简历正文'});
  await run('current-detail',{file:taskFile,tab_id:tabId,resume_id:onlyId,operation_id:'recheck-read'});
  const read=evidence('recheck-read');
  const detail=read?.detail??read;
  const text=String(detail?.text??'');
  const entry={resumeId:onlyId,name:detail?.title??null,status:detail?.status??null,chars:text.length,
   fit:new RegExp(fitPattern).test(text),coldOpen,url};
  if(favoriteOnRecheck&&entry.fit&&detail?.status!=='blocked'){
   grantOperations(taskFile,{allowedRequests:[{kind:'favorite',payload:{resumeId:onlyId,page:tabId,action:'add',group}}],confirmedAt:now(),scope:'复核后将 '+onlyId+' 加入 '+group});
   await run('favorite',{file:taskFile,tab_id:tabId,resume_id:onlyId,group,action:'add',operation_id:'recheck-fav'});
   const fav=evidence('recheck-fav');
   entry.saved=fav?.saved===true;entry.changed=fav?.changed===true;
  }
  report.recheck=entry;
  await closeTab(tabId);
  console.log(JSON.stringify({recheck:entry}));
  finished=true;
 }
 if(!onlyId){

 authorizeTask(taskFile,{allowedKinds:['prepare','search','inspect','detail','favorite'],maxOperations:budget,confirmedAt:now(),
  scope:'用户 2026-10-22 要求：完成 liepin MCP 验证并帮因时找到不少于 '+target+' 位「'+keyword+'」候选人放入收藏夹「'+group+'」；不联系、不解锁',
  allowedRequests:[{kind:'prepare',payload:{page:'pending',filters:{keyword}}},{kind:'search',payload:{keyword,pages,limit}}]});

 // ---- Phase 0: what is already in the group ------------------------------
 let t=performance.now();
 const favoritesTab=await ownAndBind(FAVORITES_URL);
 grantOperations(taskFile,{allowedRequests:[{kind:'inspect',payload:{view:'favorites',page:favoritesTab,limit:Math.min(30,Math.max(10,target)),group,workspace:true}}],confirmedAt:now(),scope:'因时寻访：读取「'+group+'」现有成员，避免重复收藏'});
 await run('favorites',{file:taskFile,tab_id:favoritesTab,group,workspace:true,limit:Math.min(30,Math.max(10,target)),operation_id:'source-readback-before'});
 const before=evidence('source-readback-before');
 const existing=new Set((before?.rows??[]).map(row=>row.resumeId).filter(Boolean));
 // The favorites read only shows the first page, so also trust the local ledgers:
 // anyone already saved into this group must never be opened again.
 const stateRoot=path.dirname(work);
 const walkLedgers=dir=>{
  for(const entry of fs.readdirSync(dir,{withFileTypes:true})){
   const full=path.join(dir,entry.name);
   if(entry.isDirectory()){if(entry.name!=='node_modules')walkLedgers(full);continue;}
   if(entry.name!=='task.json'||full===taskFile)continue;
   let past;try{past=JSON.parse(fs.readFileSync(full,'utf8'));}catch{continue}
   for(const op of past.operations??[]){
    if(op.kind==='favorite'&&op.status==='completed'&&op.evidence?.saved===true&&op.evidence?.changed===true&&op.payload?.group===group&&op.payload?.resumeId)existing.add(op.payload.resumeId);
   }
  }
 };
 walkLedgers(stateRoot);
 step('group_readback_before',t,{total:before?.total??null,rows:(before?.rows??[]).length,identified:existing.size});
 await closeTab(favoritesTab);

 // ---- Phase 1: one search, ids come from the list itself ----------------
 t=performance.now();
 searchTab=String(await client.js(`(await browser.tabs.new(${JSON.stringify(SEARCH_URL)})).id`));
 const handle=client.claimOpenedTab(searchTab);
 const bound=await handle.url();
 assertNotSecurityCheck(bound);
 if(!/getConditionItem/.test(bound??''))throw Error('搜索页地址未确认：'+(bound??'空'));
 await client.js(`await (await browser.tabs.get(${JSON.stringify(searchTab)})).release()`);
 await run('tabs',{});
 await run('bind',{file:taskFile,tab_id:searchTab,expected_url:bound});
 grantOperations(taskFile,{allowedRequests:[{kind:'prepare',payload:{page:searchTab,filters:{keyword}}}],confirmedAt:now(),scope:'因时寻访：设置关键词 '+keyword});
 await run('prepare',{file:taskFile,tab_id:searchTab,filters:{keyword},operation_id:'source-prepare'});
 approveRound(taskFile,'sourcing-round',{confirmedAt:now(),scope:'因时寻访：授权本轮搜索 '+pages+' 页'});
 await run('search',{file:taskFile,tab_id:searchTab,round_id:'sourcing-round'});
 step('search',t,{pages,rows:(evidence('round-sourcing-round')?.rows??[]).length});
 await closeTab(searchTab);searchTab=null;

 const saved=readTask(taskFile);
 const listRows=[...(saved.candidates??[]).flatMap(c=>(c.observations??[]).filter(o=>o.stage==='list')),
  ...(saved.unlinkedObservations??[])].map(o=>o.data).filter(row=>row?.resumeId);
 report.rows=listRows.map(row=>({name:row.name??null,resumeId:row.resumeId,page:row.page??null,
  company:row.currentCompany??null,title:row.currentTitle??null,expectation:row.expectation??null}));
 report.queue={listed:listRows.length,alreadyInGroup:listRows.filter(row=>existing.has(row.resumeId)).length};

 const queue=listRows.filter(row=>!existing.has(row.resumeId)&&Number(row.page??0)>=fromPage);
 if(queue.length<target)report.shortfall={wanted:target,available:queue.length};
 if(!queue.length)throw Error('没有可收藏的新候选人');

 // ---- Phase 2: open each detail by id, judge, favorite -------------------
 const fit=new RegExp(fitPattern);
 for(const [index,row] of queue.entries()){
  if(report.added.length>=target)break;
  const started=performance.now();
  let tabId=null;
  try{
   tabId=await ownAndBind(detailUrl(row.resumeId),{minChars:300});
   grantOperations(taskFile,{allowedRequests:[{kind:'detail',payload:{resumeId:row.resumeId,page:tabId}}],confirmedAt:now(),scope:'因时寻访：读取 '+row.resumeId+' 的简历正文'});
   await run('current-detail',{file:taskFile,tab_id:tabId,resume_id:row.resumeId,operation_id:`source-read-${index}`});
   const read=evidence(`source-read-${index}`);
   const detail=read?.detail??read?.inspection?.detail??read;
   const text=String(detail?.text??detail?.visibleText??'');
   const matched=fit.test(text);
   const entry={position:index+1,resumeId:row.resumeId,name:row.name??detail?.name??null,
    status:detail?.status??null,chars:text.length,fit:matched,wallMs:Math.round(performance.now()-started)};
   if(!matched||text.length<200){entry.skipped='简历内容不符合关键词或过短';report.skipped.push(entry);console.log(JSON.stringify({candidate:entry}));}
   else if(dryRun){entry.skipped='dry-run';report.skipped.push(entry);console.log(JSON.stringify({candidate:entry}));}
   else{
    grantOperations(taskFile,{allowedRequests:[{kind:'favorite',payload:{resumeId:row.resumeId,page:tabId,action:'add',group}}],confirmedAt:now(),scope:'因时寻访：将 '+row.resumeId+' 加入 '+group});
    await run('favorite',{file:taskFile,tab_id:tabId,resume_id:row.resumeId,group,action:'add',operation_id:`source-fav-${index}`});
    const fav=evidence(`source-fav-${index}`);
    if(fav?.saved!==true)throw new Error('收藏未确认');
    entry.saved=true;entry.changed=fav?.changed===true;
    entry.clickMs=fav?.timings?.clickMs??null;
    (fav?.changed===true?report.added:report.skipped).push(entry);
    console.log(JSON.stringify({candidate:entry}));
   }
  }catch(error){
   report.failed.push({position:index+1,resumeId:row.resumeId,error:error.message});
   console.log(JSON.stringify({failed:{position:index+1,resumeId:row.resumeId,error:error.message}}));
   if(/安全验证|safe\.liepin\.com/.test(error.message))throw error;
  }finally{
   if(tabId)await closeTab(tabId);
  }
  if(index<queue.length-1)await new Promise(r=>setTimeout(r,intervalMs));
 }

 // ---- Phase 3: read the group back --------------------------------------
 t=performance.now();
 const afterTab=await ownAndBind(FAVORITES_URL);
 grantOperations(taskFile,{allowedRequests:[{kind:'inspect',payload:{view:'favorites',page:afterTab,limit:30,group,workspace:true}}],confirmedAt:now(),scope:'因时寻访：回读分组核对人数'});
 await run('favorites',{file:taskFile,tab_id:afterTab,group,workspace:true,limit:30,operation_id:'source-readback-after'});
 const after=evidence('source-readback-after');
 step('group_readback_after',t,{total:after?.total??null,rows:(after?.rows??[]).length,groupReadback:after?.groupReadback===true});
 report.readback={total:after?.total??null,rows:(after?.rows??[]).length,groupReadback:after?.groupReadback===true};
 await closeTab(afterTab);
 finished=true;
}

}catch(error){
 report.error=error.message;
}finally{
 if(searchTab)await closeTab(searchTab);
 report.finishedAt=now();
 report.summary={listed:report.rows.length,added:report.added.length,skipped:report.skipped.length,
  failed:report.failed.length,readbackTotal:report.readback?.total??null,finished};
 fs.writeFileSync(evidencePath,JSON.stringify(report,null,1),{mode:0o600});
 console.log(JSON.stringify({summary:report.summary,error:report.error??null}));
 client.close();
}
if(!finished)process.exitCode=1;
