// Read-only acceptance probe for list identity: does the result list expose a
// resume id before anyone is opened? One search page, one search, one results
// read. It never opens a detail and never writes a favorite.
//
//   node tools/liepin-mcp/scripts/verify-list-identity.mjs \
//     --installation <customer-installation.json> \
//     --keyword 伺服驱动 --evidence <output.json>
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';

const here=path.dirname(fileURLToPath(import.meta.url));
const repo=path.resolve(here,'../../..');
const load=p=>import(pathToFileURL(path.join(repo,p)).href);

const arg=(name,fallback)=>{const i=process.argv.indexOf('--'+name);return i>0&&process.argv[i+1]?process.argv[i+1]:fallback;};
const installationPath=arg('installation');
const keyword=arg('keyword','伺服驱动');
const limit=Number(arg('limit','10'));
const pages=Number(arg('pages','2'));
const turnPage=arg('next-page','false')==='true';
const evidencePath=arg('evidence',path.join(process.cwd(),'list-identity.json'));
if(!installationPath)throw Error('需要 --installation 指向 customer-installation.json');
if(!Number.isSafeInteger(limit)||limit<1||limit>30)throw Error('limit 须为 1–30');

const {BrowserClient}=await load('tools/liepin-mcp/lib/client.mjs');
const {initializeWorkflow,approveRound}=await load('distribution/liepin-search/runtime/packages/liepin/lib/workflow.js');
const {createSiteScope,bindSiteScope}=await load('distribution/liepin-search/runtime/packages/liepin/lib/site-scope.js');
const {authorizeTask}=await load('distribution/liepin-search/runtime/packages/liepin/lib/operation-gate.js');
const {readTask}=await load('distribution/liepin-search/runtime/packages/liepin/lib/task-store.js');

const installation=JSON.parse(fs.readFileSync(installationPath,'utf8'));
if(!installation.mcpServer)throw Error('安装回执缺少 mcpServer');
const SEARCH_URL='https://h.liepin.com/search/getConditionItem';
const work=path.join(path.dirname(path.resolve(evidencePath)),'list-identity-task');
fs.mkdirSync(work,{recursive:true});
const taskFile=path.join(work,'task.json'),scopeFile=path.join(work,'scope.json');
if(fs.existsSync(taskFile))throw Error('本轮探针已开始：'+taskFile+'；中断后请先核对回执，不自动重放');
const now=()=>new Date().toISOString();
initializeWorkflow(taskFile,{title:'列表身份只读探针（'+keyword+'）',
 criteria:[{id:'probe',label:'只读探针，不作适岗结论',category:'experience',kind:'required',weight:1}],
 rounds:[{id:'probe-round',phase:'trial',filters:{keyword,pages,limit}}]});
createSiteScope(scopeFile,{label:'列表身份探针',maxOperations:6,confirmedAt:now()});
bindSiteScope(taskFile,scopeFile);

const client=new BrowserClient(undefined,{requestTimeoutMs:120000});
client.command=installation.mcpServer.command;client.args=installation.mcpServer.args;
const run=(name,args)=>client.js(`await sites.run('liepin',${JSON.stringify(name)},${JSON.stringify(args)})`);
const evidence=id=>readTask(taskFile).operations.find(o=>o.operationId===id)?.evidence;
const report={keyword,limit,pages,installation:installation.fingerprint??null,startedAt:now(),steps:[]};
const step=(name,startedAt,extra)=>{const item={step:name,wallMs:Math.round(performance.now()-startedAt),...(extra??{})};report.steps.push(item);console.log(JSON.stringify(item));return item;};

let searchTab,finished=false;
try{
 await client.start();
 await client.rpc('tools/call',{name:'sites_search',arguments:{query:'liepin',limit:30}}).catch(()=>{});

 let t=performance.now();
 searchTab=String(await client.js(`(await browser.tabs.new(${JSON.stringify(SEARCH_URL)})).id`));
 const handle=client.claimOpenedTab(searchTab);
 const bound=await handle.url();
 // A redirect to safe.liepin.com is the account security check; stop and say so.
 if(/^https:\/\/safe\.liepin\.com\//.test(String(bound??'')))
  throw Error('猎聘要求账号安全验证（safe.liepin.com）：请在浏览器里手动点通该页面，再重新开始；不要自动重试');
 if(!/getConditionItem/.test(bound??''))throw Error('搜索页地址未确认：'+(bound??'空'));
 await client.js(`await (await browser.tabs.get(${JSON.stringify(searchTab)})).release()`);
 await run('tabs',{});
 await run('bind',{file:taskFile,tab_id:searchTab,expected_url:bound});
 step('open_search_tab_and_bind',t,{tabId:searchTab});

 authorizeTask(taskFile,{allowedKinds:['prepare','search','page'],maxOperations:6,confirmedAt:now(),
  scope:'用户 2026-10-22 要求开启列表行 class 身份来源并只读验证：一次搜索首页 '+limit+' 条，不打开任何人、不收藏',
  allowedRequests:[{kind:'prepare',payload:{page:searchTab,filters:{keyword}}},{kind:'search',payload:{keyword,pages,limit}},...(turnPage?[{kind:'page',payload:{tab_id:searchTab}}]:[])]});

 t=performance.now();
 await run('prepare',{file:taskFile,tab_id:searchTab,filters:{keyword},operation_id:'probe-prepare'});
 step('prepare',t,{});
 approveRound(taskFile,'probe-round',{confirmedAt:now(),scope:'列表身份探针：授权本轮搜索 '+pages+' 页'});

 t=performance.now();
 await run('search',{file:taskFile,tab_id:searchTab,round_id:'probe-round'});
 step('search',t,{rows:evidence('round-probe-round')?.rows?.length??0});

 if(turnPage){
  const t2=performance.now();
  await run('next-page',{file:taskFile,tab_id:searchTab,operation_id:'probe-next-page'});
  const turned=evidence('probe-next-page');
  step('next_page',t2,{page:turned?.page??null,count:turned?.count??null});
 }

 // The search itself already saves every page it read, with identity resolved
 // by the list observer, so no second read is needed here.
 const saved=readTask(taskFile);
 const listRows=[...(saved.candidates??[]).flatMap(c=>(c.observations??[]).filter(o=>o.stage==='list')),
  ...(saved.unlinkedObservations??[])].map(o=>({...o.data,identityStatus:o.identityStatus??null}));
 report.rows=listRows.map(row=>({name:row.name??null,resumeId:row.resumeId??null,
  identityEvidence:row.identityEvidence??null,rowClassResumeId:row.rowClassResumeId??null,
  identityStatus:row.identityStatus??null,page:row.page??null,
  hasDetailLinks:Array.isArray(row.detailLinks)&&row.detailLinks.length>0}));
 const rows=report.rows;
 const withId=report.rows.filter(row=>!!row.resumeId);
 report.summary={rows:rows.length,withResumeId:withId.length,
  byEvidence:report.rows.reduce((map,row)=>(map[row.identityEvidence]=(map[row.identityEvidence]??0)+1,map),{})};
 finished=true;
}catch(error){
 report.error=error.message;
}finally{
 if(searchTab)await client.js(`await browser.chrome.call('tabs.remove',[${Number(searchTab)}])`).catch(()=>{});
 report.finishedAt=now();
 fs.writeFileSync(evidencePath,JSON.stringify(report,null,1),{mode:0o600});
 console.log(JSON.stringify({summary:report.summary??null,error:report.error??null}));
 client.close();
}
if(!finished)process.exitCode=1;
