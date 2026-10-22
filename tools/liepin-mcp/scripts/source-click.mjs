// Path A: everything happens on the result list. One search, then per candidate
//   open-detail (real card click, read, back to list)
//   -> judge fit -> favorite-list (real card click, favorite, readback, back)
//   -> next-page (no new query) when the page is exhausted.
// Nothing is opened by a synthesised URL, so every detail request carries the
// search context and referrer a person would produce.
//
//   node tools/liepin-mcp/scripts/source-click.mjs \
//     --installation <customer-installation.json> --keyword 伺服驱动 \
//     --group 因时伺服控制 --target 5 --interval-ms 60000 --evidence <out.json>
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
const limit=Number(arg('limit','10'));
const maxPages=Number(arg('max-pages','3'));
const intervalMs=Number(arg('interval-ms','60000'));
const dryRun=arg('dry-run','false')==='true';
// Judge from the card first (期望/技能/公司都在卡片上); only read the full resume
// first when the card is ambiguous. Reading and then reopening the same resume a
// few seconds apart is exactly the pattern that looks automated.
const readFirst=arg('read-first','false')==='true';
const fitPattern=arg('fit','伺服|驱动|运动控制|电机|自动化|变频|电气');
const evidencePath=arg('evidence',path.join(process.cwd(),'source-click.json'));
if(!installationPath)throw Error('需要 --installation 指向 customer-installation.json');
if(!Number.isSafeInteger(target)||target<1||target>40)throw Error('目标人数须为 1–40');
if(!Number.isSafeInteger(intervalMs)||intervalMs<15000||intervalMs>180000)throw Error('间隔须为 15000–180000 毫秒');

const {BrowserClient}=await load('tools/liepin-mcp/lib/client.mjs');
const {initializeWorkflow,approveRound}=await load('distribution/liepin-search/runtime/packages/liepin/lib/workflow.js');
const {createSiteScope,bindSiteScope}=await load('distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js');
const {authorizeTask,grantOperations}=await load('distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js');
const {readTask}=await load('distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');

const installation=JSON.parse(fs.readFileSync(installationPath,'utf8'));
if(!installation.mcpServer)throw Error('安装回执缺少 mcpServer');
const SEARCH_URL='https://h.liepin.com/search/getConditionItem';
const budget=Math.min(100,4+target*3);
const work=path.join(path.dirname(path.resolve(evidencePath)),'source-click-task');
fs.mkdirSync(work,{recursive:true});
const taskFile=path.join(work,'task.json'),scopeFile=path.join(work,'scope.json');
if(fs.existsSync(taskFile))throw Error('本轮已开始：'+taskFile+'；中断后先核对回执，不自动重放');
const now=()=>new Date().toISOString();
initializeWorkflow(taskFile,{title:'因时伺服方向寻访（点击主链路，'+keyword+'）',
 criteria:[{id:'servo',label:'伺服/驱动/运动控制相关经验',category:'experience',kind:'required',weight:1}],
 rounds:[{id:'sourcing-round',phase:'trial',filters:{keyword,pages:1,limit}}]});
createSiteScope(scopeFile,{label:'因时寻访 '+keyword,maxOperations:budget,confirmedAt:now()});
bindSiteScope(taskFile,scopeFile);

const client=new BrowserClient(undefined,{requestTimeoutMs:180000});
client.command=installation.mcpServer.command;client.args=installation.mcpServer.args;
const run=(name,args)=>client.js(`await sites.run('liepin',${JSON.stringify(name)},${JSON.stringify(args)})`);
const evidence=id=>readTask(taskFile).operations.find(o=>o.operationId===id)?.evidence;
const report={mode:'click',keyword,group,target,limit,maxPages,intervalMs,dryRun,
 installation:installation.fingerprint??null,startedAt:now(),steps:[],added:[],skipped:[],failed:[],pages:[]};
const step=(name,startedAt,extra)=>{const item={step:name,wallMs:Math.round(performance.now()-startedAt),...(extra??{})};report.steps.push(item);console.log(JSON.stringify(item));return item;};
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

 authorizeTask(taskFile,{allowedKinds:['prepare','search','page','detail-open','favorite'],maxOperations:budget,confirmedAt:now(),
  scope:'用户 2026-10-22 要求：完成 liepin MCP 验证并帮因时找到不少于 '+target+' 位「'+keyword+'」候选人放入收藏夹「'+group+'」；只走列表点击，不联系、不解锁',
  allowedRequests:[{kind:'prepare',payload:{page:searchTab,filters:{keyword}}},{kind:'search',payload:{keyword,pages:1,limit}}]});

 // ---- search once --------------------------------------------------------
 t=performance.now();
 await run('prepare',{file:taskFile,tab_id:searchTab,filters:{keyword},operation_id:'click-prepare'});
 approveRound(taskFile,'sourcing-round',{confirmedAt:now(),scope:'因时寻访：授权本轮搜索 1 页'});
 await run('search',{file:taskFile,tab_id:searchTab,round_id:'sourcing-round'});
 step('search',t,{rows:(evidence('round-sourcing-round')?.rows??[]).length});

 // ---- walk pages, collect by clicking ------------------------------------
 const done=new Set();
 let pageNo=1,added=0,candidateNo=0;
 for(let page=1;page<=maxPages&&added<target;page++){
  // rows currently on screen, tied back to their saved observations
  const task=readTask(taskFile);
  const current=Number(task.mcpSearch?.currentPage??pageNo);
  const listObs=(task.candidates??[]).flatMap(c=>(c.observations??[])
   .filter(o=>o.stage==='list'&&Number(o.data?.page)===current)
   .map(o=>({id:o.id,resumeId:String(c.identity).replace(/^liepin:/,''),name:o.data?.name??null,
     page:current,summary:o.data?.summary??null})));
  report.pages.push({page:current,candidates:listObs.length});
  for(const item of listObs){
   if(added>=target)break;
   if(done.has(item.resumeId))continue;
   done.add(item.resumeId);
   candidateNo+=1;
   const started=performance.now();
   try{
    // 1) decide from the card; read the resume only when asked
    let fit=new RegExp(fitPattern).test(String(item.summary??''));
    let detail=null,text='';
    if(readFirst){
     grantOperations(taskFile,{allowedRequests:[{kind:'detail-open',payload:{
      observationId:item.id,observationHash:readTask(taskFile).candidates.flatMap(c=>c.observations).find(o=>o.id===item.id)?.hash,page:searchTab}}],
      confirmedAt:now(),scope:'因时寻访：点开 '+item.resumeId+' 的简历'});
     await run('open-detail',{file:taskFile,tab_id:searchTab,observation_id:item.id,
      operation_id:`click-read-${candidateNo}`});
     detail=evidence(`click-read-${candidateNo}`)?.detail;
     text=String(detail?.text??'');
     fit=new RegExp(fitPattern).test(text);
    }
    const entry={position:candidateNo,resumeId:item.resumeId,name:item.name,status:detail?.status??null,
     chars:text.length,fit,coldOpen:false,byCard:!readFirst,wallMs:Math.round(performance.now()-started)};
    if(!fit){entry.skipped='未命中关键词（'+(readFirst?'正文':'卡片')+'）';report.skipped.push(entry);console.log(JSON.stringify({candidate:entry}));continue;}
    if(readFirst&&text.length<200){entry.skipped='正文过短';report.skipped.push(entry);console.log(JSON.stringify({candidate:entry}));continue;}
    if(dryRun){entry.skipped='dry-run';report.skipped.push(entry);console.log(JSON.stringify({candidate:entry}));continue;}

    // 2) favorite the same card from the list (opens, saves, reads back, returns)
    const openOp=`click-favopen-${candidateNo}`;
    grantOperations(taskFile,{allowedRequests:[
     {kind:'favorite-open',payload:{observationId:item.id,observationHash:readTask(taskFile).candidates.flatMap(c=>c.observations).find(o=>o.id===item.id)?.hash,page:searchTab,purpose:'favorite',favoriteOperationId:`click-fav-${candidateNo}`}},
     {kind:'favorite',payload:{observationId:item.id,observationHash:readTask(taskFile).candidates.flatMap(c=>c.observations).find(o=>o.id===item.id)?.hash,page:searchTab,resumeId:item.resumeId,action:'add',group}}],
     confirmedAt:now(),scope:'因时寻访：将 '+item.resumeId+' 加入 '+group});
    await run('favorite-list',{file:taskFile,tab_id:searchTab,observation_id:item.id,
     action:'add',group,open_operation_id:openOp,operation_id:`click-fav-${candidateNo}`});
    const fav=evidence(`click-fav-${candidateNo}`);
    entry.saved=fav?.favoriteSaved===true||fav?.saved===true;entry.changed=entry.saved;
    (entry.saved?report.added:report.failed).push(entry);
    if(entry.saved)added+=1;
    console.log(JSON.stringify({candidate:entry}));
   }catch(error){
    report.failed.push({position:candidateNo,resumeId:item.resumeId,error:error.message});
    console.log(JSON.stringify({failed:{position:candidateNo,resumeId:item.resumeId,error:error.message}}));
    if(/安全验证|safe\.liepin\.com/.test(error.message))throw error;
   }
   if(added<target)await new Promise(r=>setTimeout(r,intervalMs));
  }
  if(added>=target||page===maxPages)break;
  // 3) turn one page in the same session, no new query
  const tp=performance.now();
  try{
   await run('next-page',{file:taskFile,tab_id:searchTab,operation_id:`click-page-${page+1}`});
   const turned=evidence(`click-page-${page+1}`);
   pageNo=turned?.page??page+1;
   step('next_page',tp,{page:pageNo,count:turned?.count??null});
  }catch(error){report.failed.push({stage:'next-page',error:error.message});break;}
 }
 finished=true;
}catch(error){
 report.error=error.message;
}finally{
 if(searchTab)await closeTab(searchTab);
 report.finishedAt=now();
 report.summary={added:report.added.length,skipped:report.skipped.length,failed:report.failed.length,finished};
 fs.writeFileSync(evidencePath,JSON.stringify(report,null,1),{mode:0o600});
 console.log(JSON.stringify({summary:report.summary,error:report.error??null}));
 client.close();
}
if(!finished)process.exitCode=1;
