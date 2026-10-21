// Repeatable latency walk for the shipped site adapter. Not a customer command:
// it performs one real search, one real detail open and one temporary favorite
// that is always removed before finishing.
//
//   node tools/liepin-mcp/scripts/verify-flow-latency.mjs \
//     --installation <customer-installation.json> \
//     --keyword 伺服驱动 --group 因时伺服控制 \
//     --evidence <output.json>
//
// It prints one line per step with its wall time and writes the same data as
// JSON, so a candidate can be compared against a baseline instead of relying on
// a one-off script per investigation.
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
const evidencePath=arg('evidence',path.join(process.cwd(),'flow-latency.json'));
if(!installationPath)throw Error('需要 --installation 指向 customer-installation.json');
const limit=Number(arg('limit','10'));

const {BrowserClient}=await load('tools/liepin-mcp/lib/client.mjs');
const {initializeWorkflow,approveRound}=await load('distribution/liepin-search/runtime/packages/liepin/lib/workflow.js');
const {createSiteScope,bindSiteScope}=await load('distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js');
const {authorizeTask,grantOperations}=await load('distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js');
const {readTask}=await load('distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');

const installation=JSON.parse(fs.readFileSync(installationPath,'utf8'));
if(!installation.mcpServer)throw Error('安装回执缺少 mcpServer');
const SEARCH_URL='https://h.liepin.com/search/getConditionItem';
const work=path.join(path.dirname(path.resolve(evidencePath)),'flow-latency-task');
fs.mkdirSync(work,{recursive:true});
const taskFile=path.join(work,'task.json'),scopeFile=path.join(work,'scope.json');
if(fs.existsSync(taskFile))throw Error('本轮已走过：'+taskFile+'；先核对回执，不重放');
const now=()=>new Date().toISOString();
initializeWorkflow(taskFile,{title:'流程耗时实测（'+keyword+'，临时加组后取消）',
 criteria:[{id:'latency',label:'只测流程耗时，不作适岗结论',category:'experience',kind:'required',weight:1}],
 rounds:[{id:'latency-round',phase:'trial',filters:{keyword,pages:1,limit}}]});
createSiteScope(scopeFile,{label:'流程耗时实测',maxOperations:16,confirmedAt:now()});
bindSiteScope(taskFile,scopeFile);

const client=new BrowserClient(undefined,{requestTimeoutMs:120000});
client.command=installation.mcpServer.command;client.args=installation.mcpServer.args;
const run=(name,args)=>client.js(`await sites.run('liepin',${JSON.stringify(name)},${JSON.stringify(args)})`);
const evidence=id=>readTask(taskFile).operations.find(o=>o.operationId===id)?.evidence;
const report={keyword,group,installation:installation.fingerprint??null,steps:[],startedAt:now()};
const step=(name,startedAt,extra)=>{const item={step:name,wallMs:Math.round(performance.now()-startedAt),...(extra??{})};report.steps.push(item);console.log(JSON.stringify(item));return item;};

let tabId,detailTab,opened=false,added=false;
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

 authorizeTask(taskFile,{allowedKinds:['prepare','search','inspect','favorite','unfavorite'],maxOperations:16,confirmedAt:now(),
  scope:'流程耗时实测：一次 '+keyword+' 搜索、点开首位人选详情、一位原本未收藏者临时加入 '+group+' 后立即取消；不联系、不解锁、不翻页',
  allowedRequests:[{kind:'prepare',payload:{page:tabId,filters:{keyword}}},{kind:'search',payload:{keyword,pages:1,limit}}]});

 t=performance.now();
 await run('prepare',{file:taskFile,tab_id:tabId,filters:{keyword},operation_id:'latency-prepare'});
 step('prepare',t,{applied:JSON.stringify(evidence('latency-prepare')?.applied??null).slice(0,160)});

 approveRound(taskFile,'latency-round',{confirmedAt:now(),scope:'流程耗时实测：授权本轮搜索一次'});

 t=performance.now();
 await run('search',{file:taskFile,tab_id:tabId,round_id:'latency-round'});
 const searchEvidence=evidence('round-latency-round');
 const rows=searchEvidence?.rows??[];
 step('search',t,{rows:rows.length,total:searchEvidence?.total??null,unresolved:readTask(taskFile).rounds[0]?.unresolvedIdentities??null});

 // Open the first card through the product's own command: it clicks the card,
 // opens a child detail tab and links the identity. Hand-rolling a click here
 // would fight the adapter session that owns the search page.
 const observation=(readTask(taskFile).unlinkedObservations??[])[0];
 if(!observation?.id||!observation?.hash)throw Error('搜索没有留下可打开的观察记录');
 grantOperations(taskFile,{allowedRequests:[{kind:'detail-open',payload:{observationId:observation.id,observationHash:observation.hash,page:tabId}}],confirmedAt:now(),scope:'流程耗时实测：点开首位人选详情一份'});
 t=performance.now();
 await run('open-detail',{file:taskFile,tab_id:tabId,observation_id:observation.id,operation_id:'latency-detail'});
 const detailEvidence=evidence('latency-detail');
 detailTab=String(detailEvidence?.detailPage??'');
 const detailUrl=detailEvidence?.detail?.url??null;
 const resumeId=detailEvidence?.detail?.resumeId??null;
 step('open_detail',t,{status:detailEvidence?.detail?.status??null,resumeId,detailTab});
 if(!detailTab||!detailUrl||!resumeId)throw Error('详情未确认');
 opened=true;

 await run('tabs',{});
 await run('bind',{file:taskFile,tab_id:detailTab,expected_url:detailUrl});

 grantOperations(taskFile,{allowedRequests:[{kind:'inspect',payload:{resumeId,page:detailTab,action:'status'}}],confirmedAt:now(),scope:'流程耗时实测：读取收藏状态'});
 t=performance.now();
 await run('favorite',{file:taskFile,tab_id:detailTab,resume_id:resumeId,action:'status',operation_id:'latency-status'});
 step('favorite_status',t,{saved:evidence('latency-status')?.saved});

 grantOperations(taskFile,{allowedRequests:[{kind:'favorite',payload:{resumeId,page:detailTab,action:'add',group}}],confirmedAt:now(),scope:'流程耗时实测：临时加入 '+group});
 t=performance.now();
 await run('favorite',{file:taskFile,tab_id:detailTab,resume_id:resumeId,group,action:'add',operation_id:'latency-add'});
 const addEvidence=evidence('latency-add');
 step('favorite_add',t,{saved:addEvidence?.saved,changed:addEvidence?.changed,clickMs:addEvidence?.timings?.clickMs??null});
 if(addEvidence?.saved!==true)throw Error('添加未确认');
 added=true;

 grantOperations(taskFile,{allowedRequests:[{kind:'unfavorite',payload:{resumeId,page:detailTab,action:'remove'}}],confirmedAt:now(),scope:'流程耗时实测：取消临时收藏'});
 t=performance.now();
 await run('favorite',{file:taskFile,tab_id:detailTab,resume_id:resumeId,action:'remove',operation_id:'latency-remove'});
 const removeEvidence=evidence('latency-remove');
 step('favorite_remove',t,{saved:removeEvidence?.saved,changed:removeEvidence?.changed,clickMs:removeEvidence?.timings?.clickMs??null});
 added=false;
 report.totalMs=report.steps.reduce((sum,item)=>sum+item.wallMs,0);
 report.status='completed';
}catch(error){
 report.error=error.message;report.status='stopped';
}finally{
 if(opened){
  await client.js(`await browser.chrome.call('tabs.remove',[${Number(tabId)},${Number(detailTab)}])`).catch(error=>{report.closeError=error.message;});
 }
 report.warning=added?'临时收藏仍存在，需人工取消':null;
 report.finishedAt=now();
 fs.writeFileSync(evidencePath,JSON.stringify(report,null,1),{mode:0o600});
 console.log(JSON.stringify({summary:{status:report.status,totalMs:report.totalMs??null,error:report.error??null,warning:report.warning??null}}));
 client.close();
}
if(report.status!=='completed')process.exitCode=1;
