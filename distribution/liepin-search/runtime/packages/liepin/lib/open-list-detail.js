import {readExpandedDetail} from './expanded-detail.js';
import {LIEPIN_SESSION,LIEPIN_CONNECTION,LIEPIN_MANAGED,LIEPIN_MANAGED_SESSION,LIEPIN_DETAIL_SESSION} from './connection.js';
import {createLiepinPage} from './page-connection.js';
import {createOfficialPopupController,createManagedPopupController} from './official-popup.js';
import {checkReadRuntime} from './current-detail.js';
import {readBoundLocation} from './bound-page.js';
import {createNativeActions} from './native-actions.js';
import {parseDetail} from './detail.js';
import {readTask,updateTask,mergeObservations} from './task-store.js';
import {executeScopedOperation} from './site-scope.js';
import {detailTargets} from './detail-targets.js';

export function inspectSavedCard({cardSelector,detailTarget,summary,includeOrigin=false,diagnostic=false}) {
 const cards=document.querySelectorAll(cardSelector),targets=document.querySelectorAll(detailTarget);
 // Liepin adds an isolated visible 阅读 marker after opening a card. Only this
 // observed one-character status line may vary; identity/job content stays exact.
 const cardText=value=>value.trim().split('\n').filter(line=>line.trim()!=='阅').join('\n').trim();
 const matched=location.origin==='https://h.liepin.com' && location.pathname==='/search/getConditionItem'
  && cards.length===1 && targets.length===1 && cards[0].contains(targets[0])
  && targets[0].matches('.new-resume-personal-name') && cardText(cards[0].innerText)===cardText(summary);
 return includeOrigin?{matched,openerTimeOrigin:performance.timeOrigin,...(diagnostic?{cardCount:cards.length,targetCount:targets.length,currentSummary:cards.length===1?cards[0].innerText.trim():null}:{} )}:matched;
}
export function inspectDetailClickTarget({detailTarget}) {
 if(location.origin!=='https://h.liepin.com' || location.pathname!=='/search/getConditionItem')return null;
 const containers=document.querySelectorAll(detailTarget);
 if(containers.length!==1 || !containers[0].matches('.new-resume-personal-name'))return null;
 const selector=`${detailTarget} > em`,names=document.querySelectorAll(selector);
 if(names.length!==1 || names[0].parentElement!==containers[0] || !names[0].textContent.trim())return null;
 return selector;
}
export async function openListDetailDriver(pageId,{returnToList=false}={}) {
 checkReadRuntime();
 const {bindTab}=await import(new URL('daemon-client.js',import.meta.resolve('@jackwener/opencli/browser/page')).href);
 const page=await createLiepinPage();page.setActivePage(pageId);
 const manager=LIEPIN_MANAGED?await createLiepinPage({session:LIEPIN_MANAGED_SESSION}):null;
 const detailPage=LIEPIN_MANAGED?await createLiepinPage({session:LIEPIN_DETAIL_SESSION}):page;
 try {
  if(manager){await manager.selectTab(pageId);await bindTab(LIEPIN_SESSION);}
  const bound=(await page.tabs()).find(t=>t.page===pageId);
  if(LIEPIN_CONNECTION!=='official' && !bound?.popupAdoption)throw new Error('配套扩展尚不支持详情子标签接管；未点击卡片');
  if(LIEPIN_CONNECTION!=='official' && returnToList && !bound.parentReturn)throw new Error('配套扩展尚不支持返回搜索页；未开始批量详情');
  const expectedUrl=await readBoundLocation(page,pageId,'/search/getConditionItem',{requireConnection:true});
  const actions=createNativeActions(page,{expectedUrl});
  const official=LIEPIN_CONNECTION==='official'?(LIEPIN_MANAGED
   ?createManagedPopupController({page:detailPage,parentPage:manager,pageId,expectedUrl,bind:()=>bindTab(LIEPIN_DETAIL_SESSION)})
   :createOfficialPopupController({page,pageId,expectedUrl,bind:()=>bindTab(LIEPIN_SESSION)})):null;
  let adoptedPage,openerTimeOrigin;
  return {observation:()=>official?.observation(),method:LIEPIN_MANAGED?'observed-card-managed-tab':official?'observed-card-foreground':'observed-card-popup',check:async row=>{
    const state=await page.evaluate(inspectSavedCard,{...row,includeOrigin:true});openerTimeOrigin=state.openerTimeOrigin;return state.matched && Number.isFinite(openerTimeOrigin);},
   children:async()=>{
    if(official)return official.children();
    const tabs=await page.tabs(),matches=tabs.filter(t=>t.page===pageId);
    if(matches.length!==1 || !Array.isArray(matches[0].children))throw new Error('详情发现期间搜索页绑定或子标签能力丢失；停止，不重复点击');
    return matches[0].children;
   },
   click:async row=>{
    const clickTarget=await page.evaluate(inspectDetailClickTarget,{detailTarget:row.detailTarget});
    if(!clickTarget)throw new Error('无法确认唯一姓名文字入口；未点击容器空白区域');
    await actions.scrollTo({actionId:'detail-scroll',selector:clickTarget});
    const current=await page.evaluate(inspectSavedCard,{...row,includeOrigin:true});
    if(!current.matched || current.openerTimeOrigin!==openerTimeOrigin)throw new Error('列表卡片或搜索文档已变化');
    await actions.click({actionId:'detail-open',selector:clickTarget});official?.clicked({...row,openerTimeOrigin});
    if(manager)await page.closeWindow();},
   read:async child=>{
    if(official)await official.adopt(child);
    else if(adoptedPage!==child.page){await bindTab(LIEPIN_SESSION,{page:child.page});page.setActivePage(child.page);adoptedPage=child.page;}
    await readBoundLocation(detailPage,child.page,'/resume/showresumedetail/',{requireConnection:true});
    return readExpandedDetail(detailPage,new URL(child.url).searchParams.get('res_id_encode'));},
   returnToList:async()=>{
    if(official)await official.returnToList();
    else {await bindTab(LIEPIN_SESSION,{page:pageId});page.setActivePage(pageId);adoptedPage=undefined;}
    if(manager){await detailPage.closeWindow();return;}
    const actual=await readBoundLocation(page,pageId,'/search/getConditionItem',{requireConnection:true});
    if(actual!==expectedUrl)throw new Error('返回的搜索页已变化');
   },close:async()=>{if(detailPage!==page)await detailPage.closeWindow();await page.closeWindow();}};
 }catch(error){if(detailPage!==page)await detailPage.closeWindow();await page.closeWindow();throw error;}
}
export async function openListDetail(args,{openDriver=openListDetailDriver,pause=ms=>new Promise(r=>setTimeout(r,ms)),validatePage=page=>/^[a-fA-F0-9]{16,128}$/.test(page ?? ''),execute=executeScopedOperation}={}) {
 if(!validatePage(args.page))throw new Error('需要当前绑定搜索页的 targetId');
 const task=readTask(args.file),record=detailTargets(task).find(o=>o.id===args.observationId);
 if(!record || !record.data.detailTarget || !record.data.cardSelector || !record.data.summary)throw new Error('该列表记录缺少已观察到的详情入口；请使用已有详情读取，不猜测卡片位置');
 const request={operationId:args.operationId,kind:'detail-open',payload:{observationId:record.id,observationHash:record.hash,page:args.page}};
 const evidence=await execute(args.file,request,async()=>{
  const driver=await openDriver(args.page,{returnToList:args.returnToList===true});
  try {
   if(!await driver.check(record.data))return {status:'blocked',evidence:{reason:'saved_card_changed'}};
   const before=new Set((await driver.children()).map(t=>t.page));
   const discovery={beforePages:[...before],samples:[]};
   const started=Date.now();
   await driver.click(record.data);
   let child;
   for(let i=0;i<30;i++) {
    let children;
    try{children=await driver.children();}catch(error){
     return {status:'unknown',evidence:{reason:'detail_discovery_failed',discovery,observation:driver.observation?.(),error:error.message}};
    }
    const fresh=children.filter(t=>!before.has(t.page));
    discovery.samples.push({elapsedMs:Date.now()-started,pages:children.map(t=>t.page),freshPages:fresh.map(t=>t.page),observation:driver.observation?.()});
    if(fresh.length>1)return {status:'unknown',evidence:{reason:'multiple_new_detail_tabs',discovery}};
    if(fresh.length===1){child=fresh[0];break;}
    await pause(300);
   }
   if(!child)return {status:'unknown',evidence:{reason:'detail_tab_not_confirmed',discovery}};
   const url=new URL(child.url),ids=url.searchParams.getAll('res_id_encode');
   if(url.origin!=='https://h.liepin.com' || url.pathname!=='/resume/showresumedetail/' || ids.length!==1 || !/^[A-Za-z0-9_-]{1,512}$/.test(ids[0]))return {status:'blocked',evidence:{reason:'invalid_detail_identity'}};
   if(record.candidateKey && record.candidateKey!==`liepin:${ids[0]}`)return {status:'blocked',evidence:{reason:'detail_identity_mismatch',expectedCandidateKey:record.candidateKey}};
   let detail;
   for(let i=0;i<20;i++){
    detail=parseDetail(await driver.read(child),ids[0]);
    if(!['loading','unrecognized'].includes(detail.status))break;
    if(i<19)await pause(300);
   }
   let returnError;
   if(args.returnToList && ['readable','partial'].includes(detail.status)) {
    try{await driver.returnToList();}catch(error){returnError=error.message;}
   }
   return {status:['readable','partial'].includes(detail.status)?'completed':'blocked',evidence:{detail,observationId:record.id,observationHash:record.hash,parentPage:args.page,detailPage:child.page,method:driver.method??'observed-card-popup',...(returnError?{returnError}:{})}};
  }finally{await driver.close();}
 });
 if(!evidence.detail || !['readable','partial'].includes(evidence.detail.status))return evidence;
 if(record.candidateKey && record.candidateKey!==`liepin:${evidence.detail.resumeId}`)throw new Error('详情身份与原列表记录不一致，未合并');
 updateTask(args.file,current=>{
  const next=mergeObservations(current,[evidence.detail],{stage:'detail',roundId:`detail-${args.operationId}`});
  const original=(next.unlinkedObservations ?? []).find(o=>o.id===record.id);
  const candidate=next.candidates.find(c=>c.key===`liepin:${evidence.detail.resumeId}`);
  if(!original)return next;
  if(original.identityStatus==='linked') {
   if(original.link.candidateKey!==candidate.key)throw new Error('原记录已有不同身份关联');
   return next;
  }
  const link={candidateKey:candidate.key,method:evidence.method,operationId:args.operationId,detailPage:evidence.detailPage};
  candidate.observations.push({stage:'list',roundId:original.roundId,capturedAt:original.capturedAt,hash:original.hash,data:structuredClone(original.data),identityLink:link});
  original.identityStatus='linked';original.link=link;
  next.events.push({type:'list_identity_linked',observationId:original.id,...link,at:new Date().toISOString()});return next;
 });
 return evidence;
}
