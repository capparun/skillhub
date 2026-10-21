import {createLiepinPage} from './page-connection.js';
import {LIEPIN_CONNECTION} from './connection.js';
import {checkReadRuntime} from './current-detail.js';
import {readBoundLocation} from './bound-page.js';
import {executeScopedOperation} from './site-scope.js';
import {readTask,updateTask,mergeListResults} from './task-store.js';
import {createNativeActionSequence,inspectActionTarget} from './native-actions.js';
import {identifyListRow} from './list-identity.js';

// Fixed read-only inspector for the observed talent-management favorites view.
// Generic talent-library cards must not be mistaken for favorites.
export function inspectFavorites({limit}) {
 const visible=el=>Boolean(el && el.getClientRects().length && getComputedStyle(el).visibility!=='hidden' && getComputedStyle(el).display!=='none');
 const text=document.body?.innerText ?? '';
 if(location.origin!=='https://h.liepin.com' || location.pathname!=='/resumemanage/showmytalentlist')return {status:'wrong_page'};
 if(/验证码|操作过于频繁|访问受限|安全验证/.test(text))return {status:'blocked'};
 if(![...document.querySelectorAll('h1,h2,h3,h4,h5,h6,[role="heading"]')].some(el=>visible(el) && el.innerText.replace(/\s/g,'')==='收藏的简历·Talent'))return {status:'not_favorites'};
 if([...document.querySelectorAll('.ant-spin-spinning,[aria-busy="true"]')].some(visible))return {status:'loading'};
 const totalMatch=text.match(/共\s*([\d,]+)\s*份简历/);
 if(!totalMatch)return {status:'loading'};
 const total=Number(totalMatch[1].replace(/,/g,''));
 const selected=[...document.querySelectorAll('.ant-tree-node-selected')].filter(visible).map(el=>el.innerText.trim());
 const groupMatch=selected.length===1?selected[0].match(/^(.*?)\s*[（(]([\d,]+)[）)]$/):null;
 const selectedCount=groupMatch?Number(groupMatch[2].replace(/,/g,'')):null;
 const selectedGroup=groupMatch?groupMatch[1].trim():null;
 if(selectedCount!==null&&selectedCount!==total)return {status:'loading',reason:'selected_count_mismatch',selectedGroup,selectedCount,total};
 const cards=[...document.querySelectorAll('dl')].filter(el=>visible(el) && /收藏时间[：:]/.test(el.innerText));
 const rows=cards.slice(0,limit).map(el=>({
  source:'liepin',collection:'favorites',summary:el.innerText.trim(),
  savedAt:el.innerText.match(/收藏时间[：:]\s*(\d{4}-\d{2}-\d{2})/)?.[1] ?? null,
  detailLinks:[...el.querySelectorAll('a[href]')].filter(visible).map(a=>a.getAttribute('href')),
 }));
 if(total>0 && !rows.length)return {status:'loading'};
 return {status:'ready',total,rows,selectedGroup,groupReadback:selectedGroup!==null&&selectedCount===total};
}
// Navigation changes only the selected collection; never accept generic talent rows.
export function inspectFavoritesEntry() {
 if(location.origin!=='https://h.liepin.com'||location.pathname!=='/resumemanage/showmytalentlist')return null;
 if(/验证码|操作过于频繁|访问受限|安全验证/.test(document.body?.innerText??''))return null;
 const matches=[...document.querySelectorAll('span[data-tlg-ext]')].filter(el=>{
  if(!el.getClientRects().length||getComputedStyle(el).visibility==='hidden')return false;
  try{return JSON.parse(decodeURIComponent(el.getAttribute('data-tlg-ext'))).title_name==='我的收藏'&&/^我的收藏[（(][\d,]+[）)]$/.test(el.textContent.replace(/\s/g,''));}catch{return false;}
 });
 if(matches.length!==1)return null;
 return 'span[data-tlg-ext="'+CSS.escape(matches[0].getAttribute('data-tlg-ext'))+'"]';
}
export function inspectFavoriteGroupEntry({group}) {
 if(location.origin!=='https://h.liepin.com'||location.pathname!=='/resumemanage/showmytalentlist')return null;
 if(/验证码|操作过于频繁|访问受限|安全验证/.test(document.body?.innerText??''))return null;
 const matches=[...document.querySelectorAll('.ant-tree-node-content-wrapper')].filter(el=>{
  const rect=el.getBoundingClientRect();
  if(!rect.width||!rect.height||getComputedStyle(el).visibility==='hidden')return false;
  const title=el.querySelector('.ant-tree-title')?.innerText??el.innerText;
  return title.trim().replace(/\s*[（(][\d,]+[）)]$/,'').trim()===group;
 });
 if(matches.length!==1)return null;
 let el=matches[0];const parts=[];
 while(el&&el!==document.documentElement){const siblings=[...el.parentElement.children].filter(n=>n.tagName===el.tagName);parts.unshift(`${el.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(el)+1})`);el=el.parentElement;}
 return 'html > '+parts.join(' > ');
}
export async function readFavoritesView(page,limit,{click,group,pause=ms=>new Promise(r=>setTimeout(r,ms)),now=()=>performance.now(),delaySchedule=[40,80,120,200,250]}={}) {
 // Diagnostic counters only. Same call sequence, same polling bounds.
 const startedAt=now(),metrics={evaluates:0,payloadBytes:0,entryPolls:0,groupPolls:0,clicks:0};
 const inspect=async()=>{const state=await page.evaluate(inspectFavorites,{limit});metrics.evaluates++;metrics.payloadBytes+=JSON.stringify(state??null).length;return state;};
 const timed=result=>({...result,timings:{totalMs:Math.round(now()-startedAt),...metrics}});
 // Adaptive backoff replaces the fixed 250ms interval: ready pages advance on
 // the next observation, and slow ones still get the same 8s+3s budget.
 const waitStep=attempt=>pause(delaySchedule[Math.min(attempt,delaySchedule.length-1)]);
 let result=await inspect(),clicked=false,polls=0;
 // Collection navigation may finish after the first three seconds. Poll state
 // without replaying the navigation click; return as soon as it is ready.
 // A stale count on another collection is not a prerequisite for navigating
 // to the requested group. Its own count and rows must still pass readback.
 const canSelectRequestedGroup=state=>!!group&&state.status==='loading'&&state.reason==='selected_count_mismatch'&&!!state.selectedGroup&&state.selectedGroup!==group;
 for(let attempt=0;attempt<40&&['not_favorites','loading'].includes(result.status)&&!canSelectRequestedGroup(result);attempt++){
  if(result.status==='not_favorites'&&!clicked&&click){
   const selector=await page.evaluate(inspectFavoritesEntry,{});
   if(selector){await click(selector);clicked=true;}
  }
  await waitStep(attempt);result=await inspect();polls++;metrics.entryPolls++;
 }
 if(['not_favorites','loading'].includes(result.status)&&!canSelectRequestedGroup(result))return timed({...result,readbackFailure:{stage:'favorites-entry',polls,lastReason:result.reason??null,selectedGroup:result.selectedGroup??null,selectedCount:result.selectedCount??null,total:result.total??null}});
 if(!group||(result.status!=='ready'&&!canSelectRequestedGroup(result)))return timed(result);
 if(result.groupReadback&&result.selectedGroup===group)return timed(result);
 const navigationEvidence=canSelectRequestedGroup(result)?{reason:result.reason,fromGroup:result.selectedGroup,selectedCount:result.selectedCount,total:result.total}:null;
 const selector=await page.evaluate(inspectFavoriteGroupEntry,{group});
 if(!selector||!click)return timed({status:'group_not_found_or_ambiguous'});
 await click(selector,group);metrics.clicks++;
 for(let i=0;i<16;i++){
  await waitStep(i);result=await inspect();metrics.groupPolls++;
  if(result.status==='blocked'||result.status==='wrong_page')return timed(result);
  if(result.status==='ready'&&result.groupReadback&&result.selectedGroup===group)return timed({...result,...(navigationEvidence?{navigationEvidence}:{})});
 }
 return timed({status:'group_selection_not_confirmed',readbackFailure:{stage:'target-group',lastStatus:result.status,lastReason:result.reason??null,selectedCount:result.selectedCount??null,total:result.total??null,lastSelectedGroup:result.selectedGroup??null,groupReadback:result.groupReadback===true}});
}
export async function openFavoritesDriver(pageId,{checkRuntime=checkReadRuntime,createPage}={}) {
 checkRuntime();
 if(!createPage) {
  createPage=createLiepinPage;
 }
 const page=await createPage();page.setActivePage(pageId);
 try {
  if(LIEPIN_CONNECTION!=='official' && !(await page.tabs()).find(tab=>tab.page===pageId)?.favoritesRead)throw new Error('配套扩展尚不支持收藏页读取');
  const expectedUrl=await readBoundLocation(page,pageId,'/resumemanage/showmytalentlist',{requireConnection:true});
  let actions;
 let sequence=0;
 return {read:(limit,group)=>readFavoritesView(page,limit,{group,click:(selector,label='我的收藏')=>{actions??=createNativeActionSequence(page,{expectedUrl,inspectTarget:inspectActionTarget});return actions.click({actionId:`favorites-navigation-${++sequence}`,selector,label});}}),close:()=>page.closeWindow()};
 }catch(error){await page.closeWindow();throw error;}
}
export async function readFavorites(args,{openDriver=openFavoritesDriver,validatePage=page=>/^[a-fA-F0-9]{16,128}$/.test(page ?? ''),execute=executeScopedOperation}={}) {
 const limit=Number(args.limit ?? 10);
 if(!Number.isSafeInteger(limit) || limit<1 || limit>30 || !validatePage(args.page))throw new Error('需要已绑定页面，limit 为1–30');
 if(args.group!==undefined&&(typeof args.group!=='string'||!args.group.trim()||args.group!==args.group.trim()||args.group.length>100))throw Error('需要准确收藏分组名');
 if(args.afterOperationId!==undefined){
  const mutation=readTask(args.file).operations?.find(o=>o.operationId===args.afterOperationId);
  if(!args.group||!mutation||!['favorite','unfavorite'].includes(mutation.kind)||mutation.status!=='completed'||mutation.payload?.group!==args.group||typeof mutation.evidence?.saved!=='boolean')throw Error('重新核验收藏组需要同组已完成的收藏或取消回执');
 }
 const evidence=await execute(args.file,{operationId:args.operationId,kind:'inspect',payload:{view:'favorites',page:args.page,limit,...(args.group?{group:args.group}:{}),...(args.workspace===true?{workspace:true}:{}),...(args.afterOperationId?{afterOperationId:args.afterOperationId}:{})}},async()=>{
  const driver=await openDriver(args.page);
  try {
   const result=await driver.read(limit,args.group);
   if(result.status!=='ready' || !Array.isArray(result.rows) || !Number.isSafeInteger(result.total) || result.total<0)return {status:'blocked',evidence:{reason:result.status ?? 'favorites_not_ready',...(result.readbackFailure?{readbackFailure:result.readbackFailure}:{}),...(result.timings?{timings:result.timings}:{})}};
   if(args.group&&(result.selectedGroup!==args.group||result.groupReadback!==true))return {status:'blocked',evidence:{reason:'requested_group_not_verified',selectedGroup:result.selectedGroup??null,groupReadback:result.groupReadback===true,...(result.timings?{timings:result.timings}:{})}};
   return {status:'completed',evidence:{collection:'favorites',total:result.total,selectedGroup:result.selectedGroup??null,groupReadback:result.groupReadback===true,verification:'favorites-list-readback',...(result.navigationEvidence?{navigationEvidence:result.navigationEvidence}:{}),...(result.timings?{timings:result.timings}:{}),rows:result.rows.slice(0,limit).map(row=>({...identifyListRow(row),source:'liepin',collection:'favorites'}))}};
  }finally{await driver.close();}
 });
 if(!evidence.rows)throw new Error('收藏列表未确认：'+evidence.reason);
 // An exact-group verification is operational evidence in the journal, not
 // new résumé evidence. Do not invalidate the assessments it is verifying.
 if(!args.group)updateTask(args.file,task=>mergeListResults(task,evidence.rows,{roundId:`favorites-${args.operationId}`}));
 return evidence;
}
