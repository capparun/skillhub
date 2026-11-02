// Explicitly approved, bounded development acceptance. Not a customer command.
// Reads an approval plan; never creates one or expands its limits.
import fs from 'node:fs';import path from 'node:path';import {pathToFileURL,fileURLToPath} from 'node:url';
export async function acceptRemaining(plan){
 if(plan?.approved!==true||!Number.isFinite(Date.parse(plan.confirmedAt))||!plan.userConfirmation?.trim()||plan.maxDetailTabs!==2||plan.schemeApplyLimit!==1||plan.listLimit!==10||plan.favoritesLimit!==2||!/^验收[a-f0-9]{4}$/.test(plan.schemeName??''))throw Error('需要本次明确批准的固定范围计划；不自行扩大搜索、详情或写入');
 const {taskFile,installedDirectory,assetsFile,evidenceFile}=plan;
 const assets=JSON.parse(fs.readFileSync(assetsFile)),load=p=>import(pathToFileURL(path.join(installedDirectory,p))),core='distribution/liepin-search/runtime/packages/liepin/lib/';
 if(assets.directory!==installedDirectory||assets.sourceFingerprint!==plan.fingerprint)throw Error('安装资产与批准候选不一致');
 const {verifyPreparedRuntime}=await load('tools/liepin-mcp/scripts/verify-prepared-runtime.mjs');verifyPreparedRuntime(installedDirectory);
 const {BrowserClient}=await load('tools/liepin-mcp/lib/client.mjs');const {readTask,updateTask}=await load(core+'task-store.js');const {grantOperations}=await load(core+'operation-gate.js');const {executeMcpOperation}=await load('tools/liepin-mcp/lib/execution.mjs');const {inspectFavorite}=await load(core+'favorite.js');const {COMPAT_PUBLIC_KEY}=await load('tools/liepin-mcp/lib/compat-build.mjs');
 const task=readTask(taskFile),scope=readTask(task.siteScope.file);
 for(const state of [task,scope])if(state.status!=='ready'||state.operations.some(o=>['started','unknown','blocked','failed'].includes(o.status)))throw Error('仍有待核对操作，不能用新计划绕过');
 if(scope.operations.length+12>scope.requirements.maxOperations)throw Error('当前共用预算不足，不扩大');
 const targets=task.candidates.flatMap(c=>{const d=c.observations.filter(o=>o.stage==='detail').at(-1);if(!d)return [];const url=new URL(d.data.url);return url.origin==='https://h.liepin.com'&&url.pathname==='/resume/showresumedetail/'&&url.searchParams.getAll('res_id_encode').length===1&&url.searchParams.get('res_id_encode')===d.data.resumeId?[{url:url.href,resumeId:d.data.resumeId,hash:d.hash}]:[];}).slice(0,2);
 if(!targets.length)throw Error('没有已保存并核对身份的详情原地址，不拼接简历URL');
 const evidence={candidate:plan.fingerprint,schemeName:plan.schemeName,startedAt:new Date().toISOString(),status:'started',steps:[],ownedViews:[]};
 fs.writeFileSync(evidenceFile,JSON.stringify(evidence),{flag:'wx',mode:0o600});const save=()=>fs.writeFileSync(evidenceFile,JSON.stringify(evidence,null,2));
 const client=new BrowserClient(assets.launcher);let search,success=false, favoriteClosedLoop=false;
 const log=(description,phase='dispatching')=>updateTask(taskFile,t=>{t.events.push({type:'acceptance_browser_action',description,phase,transport:'opencli-mcp',at:new Date().toISOString()});return t;});
 const grant=request=>grantOperations(taskFile,{confirmedAt:plan.confirmedAt,scope:plan.userConfirmation,allowedRequests:[request]});
 const invoke=async(name,args)=>{const result=await client.js(`await sites.run('liepin',${JSON.stringify(name)},${JSON.stringify(args)})`);evidence.steps.push({name,operationId:args.operation_id,result,at:new Date().toISOString()});save();return result;};
 const ownView=async(url,tag,resumeId)=>{
  const request={operationId:'remaining-open-'+tag,kind:'inspect',payload:{purpose:'approved-acceptance-owned-view',url,...(resumeId?{resumeId}:{})}};grant(request);
  let view;
  await executeMcpOperation(taskFile,request,async()=>{
   log(resumeId?'打开已保存原地址对应的简历标签，仅核对收藏状态':'打开已知猎聘收藏列表页');
   const id=await client.js(`(await browser.tabs.new(${JSON.stringify(url)})).id`);if(!/^\d+$/.test(String(id)))throw Error('未返回唯一新标签ID');
   view={id:String(id),url,closed:false};evidence.ownedViews.push(view);save();
   return {status:'completed',evidence:{createdTabId:view.id,url,ownership:'created-by-this-call'}};
  });return view;
 };
 const closeView=async view=>{
  const actual=await client.js(`await browser.chrome.call('tabs.get',[${Number(view.id)}])`);if(actual.url!==view.url)throw Error('自建页地址已变化，保留页面，不自动关闭');
  log('关闭本轮创建且地址一致的验收标签');await client.js(`await browser.user.closeTabs([${Number(view.id)}])`);
  const remains=await client.js(`(await browser.chrome.call('tabs.query',[{}])).some(t=>t.id===${Number(view.id)})`);if(remains)throw Error('自建标签关闭未确认');view.closed=true;save();log('已核验本轮自建标签关闭','verified');
 };
 try{
  await client.start();await client.verify();const manifest=await client.js("await browser.chrome.call('runtime.getManifest',[])");if(manifest.key!==COMPAT_PUBLIC_KEY)throw Error('尚未连接批准的固定身份兼容扩展，未开始业务');
  const tabs=await invoke('tabs',{}),matches=tabs.filter(t=>t.view==='search');if(matches.length!==1)throw Error('需要唯一已有搜索页，不新建搜索页');search=matches[0];await invoke('bind',{file:taskFile,tab_id:search.tab_id,expected_url:search.url});
  for(const action of ['save','apply','delete']){
   const kind={save:'save-search',apply:'apply-search',delete:'delete-search'}[action];const payload={action,page:search.tab_id,name:plan.schemeName,...(action==='save'?{current:true}:{}),...(action==='apply'?{limit:10}:{})};grant({kind,payload});
   const result=(await invoke('saved-search',{file:taskFile,operation_id:'remaining-scheme-'+action,tab_id:search.tab_id,action,name:plan.schemeName,...(action==='save'?{current:true}:{}),...(action==='apply'?{limit:10}:{})})).snapshot;
   if(action==='save'&&(!result.saved||result.subscribed===true))throw Error('测试方案保存/关闭订阅未确认');
   if(action==='apply'&&(!Array.isArray(result.rows)||result.rows.length>10))throw Error('应用方案结果超出已批准首页范围');
   if(action==='delete'&&!result.deleted)throw Error('测试方案删除未确认');
  }
  for(const [index,target] of targets.entries()){
   const view=await ownView(target.url,'favorite-'+index,target.resumeId),tab=client.tab(view.id);let state;
   for(let i=0;i<10;i++){state=await tab.evaluate(inspectFavorite,{arg:{resumeId:target.resumeId}});if(!state.blocked&&state.known)break;await new Promise(r=>setTimeout(r,300));}
   if(state.blocked||!state.known)throw Error('收藏详情页未就绪，未点击');
   if(state.saved){evidence.steps.push({name:'favorite-preserved',existing:true});save();await closeView(view);continue;}
   const popupRequest={operationId:'remaining-favorite-picker-'+index,kind:'inspect',payload:{purpose:'inspect-favorite-groups',page:view.id,resumeId:target.resumeId}};grant(popupRequest);
   const picker=await executeMcpOperation(taskFile,popupRequest,async()=>{log('点击收藏按钮，仅展开分组选择弹窗');await tab.act({action:'click',target:{selector:state.button}});let groups;
    for(let i=0;i<10;i++){groups=await tab.evaluate(({resumeId})=>{const url=new URL(location.href);if(url.origin!=='https://h.liepin.com'||url.pathname!=='/resume/showresumedetail/'||url.searchParams.get('res_id_encode')!==resumeId)throw Error('详情身份变化');const visible=e=>e.getClientRects().length>0&&getComputedStyle(e).visibility!=='hidden';const norm=s=>(s??'').replace(/\s+/g,'');const leaf=[...document.querySelectorAll('span,div,p')].filter(e=>visible(e)&&norm(e.textContent)==='请设置收藏').sort((a,b)=>a.children.length-b.children.length)[0];let root=leaf?.parentElement;while(root&&root!==document.body){if([...root.querySelectorAll('button')].filter(e=>visible(e)&&norm(e.textContent)==='保存').length===1){const options=[...root.querySelectorAll('label')].filter(e=>visible(e)&&e.querySelector('input[type=radio]')).map(e=>({name:e.textContent.trim(),checked:e.querySelector('input[type=radio]').checked}));return {options};}root=root.parentElement;}return {options:[]};},{arg:{resumeId:target.resumeId}});if(groups.options.length)break;await new Promise(r=>setTimeout(r,200));}
    const selected=groups.options.filter(g=>g.checked),chosen=selected.length===1?selected[0]:groups.options.length===1?groups.options[0]:null;if(!chosen?.name)throw Error('没有唯一默认收藏分组，不猜分组或新建分组');return {status:'completed',evidence:{group:chosen.name}};
   });
   await client.js(`await (await browser.tabs.get(${JSON.stringify(view.id)})).release()`);await invoke('bind',{file:taskFile,tab_id:view.id,expected_url:view.url});
   const common={resumeId:target.resumeId,page:view.id};grant({kind:'favorite',payload:{...common,action:'add',group:picker.group}});
   const added=await invoke('favorite',{file:taskFile,operation_id:'remaining-favorite-add',tab_id:view.id,resume_id:target.resumeId,action:'add',group:picker.group});
   if(!added.saved)throw Error('添加收藏未回读确认，不自动重试或取消');
   if(added.changed){grant({kind:'unfavorite',payload:{...common,action:'remove'}});const removed=await invoke('favorite',{file:taskFile,operation_id:'remaining-favorite-remove',tab_id:view.id,resume_id:target.resumeId,action:'remove'});if(removed.saved||!removed.changed)throw Error('取消本轮新增收藏未确认');favoriteClosedLoop=true;}
   await closeView(view);break;
  }
  const favorites=await ownView('https://h.liepin.com/resumemanage/showmytalentlist','favorites-list');await client.js(`await (await browser.tabs.get(${JSON.stringify(favorites.id)})).release()`);await invoke('bind',{file:taskFile,tab_id:favorites.id,expected_url:favorites.url});
  grant({kind:'inspect',payload:{view:'favorites',page:favorites.id,limit:2}});await invoke('favorites',{file:taskFile,operation_id:'remaining-favorites-list',tab_id:favorites.id,limit:2});await closeView(favorites);
  await invoke('bind',{file:taskFile,tab_id:search.tab_id,expected_url:search.url});log('切回原搜索标签');await client.js(`await browser.chrome.call('tabs.update',[${Number(search.tab_id)},{active:true}])`);const returned=await client.js(`await browser.chrome.call('tabs.get',[${Number(search.tab_id)}])`);if(returned.url!==search.url||!returned.active)throw Error('返回原搜索页未核验');log('已保留并返回原搜索标签','verified');
  evidence.favoriteClosedLoop=favoriteClosedLoop;evidence.status=favoriteClosedLoop?'completed':'partial-existing-favorites-preserved';success=true;
 }catch(error){evidence.status='stopped';evidence.error=error.message;throw error;}
 finally{evidence.finishedAt=new Date().toISOString();evidence.unclosedViews=evidence.ownedViews.filter(v=>!v.closed).map(v=>v.id);evidence.environment='compatibility-retained';if(!success)evidence.note='效果不明时保留原任务与页面供核对，不自动重放写入或取消已有收藏';save();client.close();}
 return evidence;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))acceptRemaining(JSON.parse(fs.readFileSync(process.argv[2]))).then(result=>console.log(JSON.stringify({status:result.status,evidenceFile:process.argv[2],unclosedViews:result.unclosedViews}))).catch(error=>{console.error(error.message);process.exitCode=1;});
