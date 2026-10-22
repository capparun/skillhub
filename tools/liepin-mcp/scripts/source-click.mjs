// Read-only developer acceptance: one observed card click per requested detail.
// Not a sourcing decision maker. Never grants or performs favorite writes.
// Supply the real authorization text and explicit keyword; use the Skill's
// evidence evaluation and sourcing decisions for production favorites.
import fs from 'node:fs';
import {diagnosticTargets,observedDiagnosticTargets} from './diagnostic-targets.mjs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../..');
const load=p=>import(pathToFileURL(path.join(repo,p)).href);

const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0&&process.argv[i+1]?process.argv[i+1]:fallback;};
const installationPath=arg('installation');
const keyword=arg('keyword');
const authorization=arg('authorization');
const group=null;
const target=Number(arg('target','5'));
const limit=Number(arg('limit','10'));
const maxPages=Number(arg('max-pages','3'));
const intervalMs=Number(arg('interval-ms','60000'));
const dryRun=arg('dry-run','true')==='true';
if(!dryRun)throw Error('source-click仅用于只读验收；收藏请走Skill的证据评估、跟进决定及favorite-list');
if(!keyword?.trim()||!authorization?.trim())throw Error('只读验收需要明确 --keyword 和真实 --authorization 原文');
const readFirst=true;
const evidencePath=arg('evidence',path.join(process.cwd(),'source-click.json'));
if(!installationPath)throw Error('需要 --installation 指向 customer-installation.json');
if(!Number.isSafeInteger(target)||target<1||target>40)throw Error('目标人数须为 1–40');
if(!Number.isSafeInteger(limit)||limit<1||limit>30||!Number.isSafeInteger(maxPages)||maxPages<1||maxPages>5)throw Error('limit须为1–30，max-pages须为1–5');
if(!Number.isSafeInteger(intervalMs)||intervalMs<15000||intervalMs>180000)throw Error('间隔须为 15000–180000 毫秒');

const {BrowserClient}=await load('tools/liepin-mcp/lib/client.mjs');
const {initializeWorkflow,approveRound}=await load('distribution/liepin-search/runtime/packages/liepin/lib/workflow.js');
const {createSiteScope,bindSiteScope}=await load('distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js');
const {authorizeTask,grantOperations}=await load('distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js');
const {readTask}=await load('distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');

const installation=JSON.parse(fs.readFileSync(installationPath,'utf8'));
if(!installation.mcpServer)throw Error('安装回执缺少 mcpServer');
const SEARCH_URL='https://h.liepin.com/search/getConditionItem';
const budget=2+target+maxPages;
const work=path.join(path.dirname(path.resolve(evidencePath)),'source-click-task');
fs.mkdirSync(work,{recursive:true});
const taskFile=path.join(work,'task.json'),scopeFile=path.join(work,'scope.json');
if(fs.existsSync(taskFile))throw Error('本轮已开始：'+taskFile+'；中断后先核对回执，不自动重放');
const now=()=>new Date().toISOString();
initializeWorkflow(taskFile,{title:'列表点击详情只读验收（'+keyword+'）',
 criteria:[{id:'servo',label:'仅验证详情采集流程，不形成岗位适配判断',category:'experience',kind:'required',weight:1}],
 rounds:[{id:'sourcing-round',phase:'trial',filters:{keyword,pages:1,limit}}]});
createSiteScope(scopeFile,{label:'只读详情验收 '+keyword,maxOperations:budget,confirmedAt:now()});
bindSiteScope(taskFile,scopeFile);

const client=new BrowserClient(undefined,{requestTimeoutMs:180000});
client.command=installation.mcpServer.command;client.args=installation.mcpServer.args;
const run=(name,args)=>client.js(`await sites.run('liepin',${JSON.stringify(name)},${JSON.stringify(args)})`);
const evidence=id=>readTask(taskFile).operations.find(o=>o.operationId===id)?.evidence;
const report={mode:'click',keyword,group,target,limit,maxPages,intervalMs,dryRun,
 installation:installation.fingerprint??null,startedAt:now(),steps:[],added:[],skipped:[],failed:[],pages:[]};
const step=(name,startedAt,extra)=>{const item={step:name,wallMs:Math.round(performance.now()-startedAt),...(extra??{})};report.steps.push(item);console.log(JSON.stringify(item));return item;};
const readCountSafe=()=>report.skipped.filter(row=>row.decision==='not_evaluated').length;
const closeTab=async id=>{try{await client.js(`await browser.chrome.call('tabs.remove',[${Number(id)}])`);return true;}catch{return false;}};
const assertNotSecurityCheck=url=>{
 if(/^https:\/\/safe\.liepin\.com\//.test(String(url??'')))
  throw new Error('猎聘要求账号安全验证（safe.liepin.com）：请在浏览器里手动点通该页面，再重新开始；不要自动重试');
};

let searchTab,finished=false;
try{
 await client.start();
 await client.rpc('tools/call',{name:'sites_search',arguments:{query:'liepin',limit:30}}).catch(()=>{});

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

 authorizeTask(taskFile,{allowedKinds:['prepare','search','page','detail-open'],maxOperations:budget,confirmedAt:now(),
  scope:authorization+'；只读开发验收，不收藏、不联系、不解锁',
  allowedRequests:[{kind:'prepare',payload:{page:searchTab,filters:{keyword}}},{kind:'search',payload:{keyword,pages:1,limit}}]});

 // ---- search once --------------------------------------------------------
 t=performance.now();
 await run('prepare',{file:taskFile,tab_id:searchTab,filters:{keyword},operation_id:'click-prepare'});
 approveRound(taskFile,'sourcing-round',{confirmedAt:now(),scope:authorization+'；本轮只读搜索1页'});
 await run('search',{file:taskFile,tab_id:searchTab,round_id:'sourcing-round'});
 step('search',t,{rows:(evidence('round-sourcing-round')?.rows??[]).length});

 // ---- walk pages, collect by clicking ------------------------------------
 const done=new Set();
 let pageNo=1,readCount=0,candidateNo=0;
 for(let page=1;page<=maxPages&&readCount<target;page++){
  // rows currently on screen, tied back to their saved observations
  const task=readTask(taskFile);
  const current=Number(task.mcpSearch?.currentPage??pageNo);
  const listObs=observedDiagnosticTargets(task,current);
  report.pages.push({page:current,candidates:listObs.length});
  for(const item of diagnosticTargets(listObs,{remaining:target-readCount,done})){
   if(readCount>=target)break;
   if(done.has(item.resumeId))continue;
   done.add(item.resumeId);
   candidateNo+=1;
   const started=performance.now();
   try{
    let detail=null,text='';
    if(readFirst){
     grantOperations(taskFile,{allowedRequests:[{kind:'detail-open',payload:{
      observationId:item.id,observationHash:item.hash,page:searchTab}}],
      confirmedAt:now(),scope:authorization+'；只读本次已观察卡片详情'});
     await run('open-detail',{file:taskFile,tab_id:searchTab,observation_id:item.id,
      operation_id:`click-read-${candidateNo}`});
     detail=evidence(`click-read-${candidateNo}`)?.detail;
     text=String(detail?.text??'');
     if(!['readable','partial'].includes(detail?.status))throw Error('详情未可读，停止本轮');
     readCount+=1;
    }
    const entry={position:candidateNo,status:detail?.status??null,chars:text.length,
     coldOpen:false,decision:'not_evaluated',wallMs:Math.round(performance.now()-started)};
    report.skipped.push({...entry,skipped:'read-only acceptance; no favorite write'});
    console.log(JSON.stringify({candidate:entry}));
   }catch(error){
    report.failed.push({position:candidateNo,resumeId:item.resumeId,error:error.message});
    console.log(JSON.stringify({failed:{position:candidateNo,resumeId:item.resumeId,error:error.message}}));
    throw error; // unknown outcomes never advance to another candidate
   }
   if(readCount<target)await new Promise(r=>setTimeout(r,intervalMs));
  }
  if(readCount>=target||page===maxPages)break;
  // 3) turn one page in the same session, no new query
  const tp=performance.now();
  try{
   grantOperations(taskFile,{allowedRequests:[{kind:'page',payload:{tab_id:searchTab}}],confirmedAt:now(),scope:authorization+'；已批准范围内下一页只读验收'});
   await run('next-page',{file:taskFile,tab_id:searchTab,operation_id:`click-page-${page+1}`});
   const turned=evidence(`click-page-${page+1}`);
   pageNo=turned?.page??page+1;
   step('next_page',tp,{page:pageNo,count:turned?.count??null});
  }catch(error){report.failed.push({stage:'next-page',error:error.message});break;}
 }
 finished=readCount>=target;
 if(!finished)report.stopReason="批准页数已用尽，详情数不足目标；不追加搜索或读取";
}catch(error){
 report.error=error.message;
}finally{
 if(searchTab&&finished)report.searchClosed=await closeTab(searchTab);
 else if(searchTab)report.searchPreserved=true; // keep failure scene for native-window diagnosis
 report.finishedAt=now();
 report.summary={read:readCountSafe(),added:0,skipped:report.skipped.length,failed:report.failed.length,finished};
 fs.writeFileSync(evidencePath,JSON.stringify(report,null,1),{mode:0o600});
 console.log(JSON.stringify({summary:report.summary,error:report.error??null}));
 client.close();
}
if(!finished)process.exitCode=1;
