import {createLiepinPage} from './page-connection.js';
import {checkReadRuntime} from './current-detail.js';
import {readBoundLocation} from './bound-page.js';
import {createNativeActionSequence,inspectActionTarget} from './native-actions.js';
import {executeScopedOperation} from './site-scope.js';
import {detailUrl} from './detail.js';

export function inspectFavorite({resumeId,group}) {
 const url=new URL(location.href),text=document.body?.innerText ?? '';
 if(url.origin!=='https://h.liepin.com' || url.pathname!=='/resume/showresumedetail/' || url.searchParams.get('res_id_encode')!==resumeId)return {blocked:true,reason:'wrong_detail'};
 if(/验证码|访问过于频繁|安全验证|异常访问|请登录|扫码登录/.test(text))return {blocked:true,reason:'page_unavailable'};
 const norm=x=>(x ?? '').replace(/\s+/g,'');
 const visible=e=>e.getClientRects().length>0 && getComputedStyle(e).visibility!=='hidden';
 const path=e=>{
  if(!e)return null;const parts=[];
  while(e && e!==document.documentElement){const siblings=[...e.parentElement.children].filter(n=>n.tagName===e.tagName);parts.unshift(`${e.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(e)+1})`);e=e.parentElement;}
  return 'html > '+parts.join(' > ');
 };
 const buttons=[...document.querySelectorAll('button,[role=button]')].filter(visible);
 const named=(name,root=document)=>buttons.filter(b=>root.contains(b) && norm(b.textContent)===name);
 const one=items=>items.length===1?items[0]:null;
 const favorite=one(named('收藏')),saved=one(named('已收藏'));
 const popup=(label,action)=>{
  const leaves=[...document.querySelectorAll('span,div,p')].filter(e=>visible(e) && norm(e.textContent)===label);
  for(const leaf of leaves){let root=leaf.parentElement;while(root && root!==document.body){if(named(action,root).length===1)return root;root=root.parentElement;}}
  return null;
 };
 const add=popup('请设置收藏','保存'),remove=popup('您确认要取消收藏吗？','确定');
 const radios=add?[...add.querySelectorAll('label,[role=radio]')].filter(e=>visible(e) && (e.matches('[role=radio]') || e.querySelector('input[type=radio]'))):[];
 const match=one(radios.filter(e=>e.textContent.trim()===String(group??'').trim()));
 // Ant radio labels include text outside the actual control. Aim at the
 // observed radio wrapper, whose hit area includes its native input.
 const input=match?.querySelector('input[type=radio]');
 const groupControl=input?.parentElement?.matches('span.ant-radio')?input.parentElement:match;
 const save=add?one(named('保存',add)):null,confirm=remove?one(named('确定',remove)):null;
 return {blocked:false,saved:!!saved,known:!!favorite!==!!saved,readyState:document.readyState,visibleTextLength:text.length,favoriteMatches:named('收藏').length,savedMatches:named('已收藏').length,button:path(saved || favorite),
  addDialog:!!add,removeDialog:!!remove,groupSelector:path(groupControl),groupMatched:!!match,
  groupSelected:!!match && (match.getAttribute('aria-checked')==='true' || !!match.querySelector('input[type=radio]')?.checked),
  save:save && !save.disabled?path(save):null,confirm:path(confirm),groups:radios.map(e=>e.textContent.trim()),groupDialogHtml:add?.outerHTML?.slice(0,24000)??null};
}
export async function openFavoriteDriver(pageId,resumeId) {
 checkReadRuntime();
 const page=await createLiepinPage();page.setActivePage(pageId);
 try {
  const expectedUrl=await readBoundLocation(page,pageId,'/resume/showresumedetail/',{requireConnection:true});
  if(new URL(expectedUrl).searchParams.get('res_id_encode')!==resumeId)throw new Error('当前详情与指定简历不符');
  const actions=createNativeActionSequence(page,{expectedUrl,inspectTarget:inspectActionTarget});let sequence=0;
  return {inspect:group=>page.evaluate(inspectFavorite,{resumeId,group}),click:(selector,label)=>actions.click({actionId:`favorite-${++sequence}`,selector,label}),close:()=>page.closeWindow()};
 }catch(error){await page.closeWindow();throw error;}
}
export async function setFavorite(args,{openDriver=openFavoriteDriver,pause=ms=>new Promise(r=>setTimeout(r,ms)),validatePage=page=>/^[a-fA-F0-9]{16,128}$/.test(page ?? ''),execute=executeScopedOperation}={}) {
 detailUrl(args.resumeId);
 if(!['add','remove','status'].includes(args.action) || !validatePage(args.page))throw new Error('需要 add/remove/status 和已绑定详情 page');
 if(args.action==='add' && (typeof args.group!=='string' || !args.group.trim()))throw new Error('收藏需要明确指定分组');
 const kind={add:'favorite',remove:'unfavorite',status:'inspect'}[args.action];
 const payload={resumeId:args.resumeId,page:args.page,action:args.action,...(args.action==='add'?{group:args.group}:{})};
 // Historical group observations are advisory; only the live dialog can
 // establish current availability before selecting and saving.
 return execute(args.file,{operationId:args.operationId,kind,payload},async()=>{
  const requested=typeof args.group==='string'?args.group.trim():null;
  const driver=await openDriver(args.page,args.resumeId);let dispatched=0,lastInspection,observedGroups=null;
  const click=async(...params)=>{dispatched++;return driver.click(...params);};
  try {
   const read=async()=>{for(let i=0;i<15;i++){const s=await driver.inspect(args.group);lastInspection=s;if(s.blocked)throw new Error('收藏页面状态未确认');if(s.known)return s;if(i<14)await pause(200);}throw new Error('收藏页面状态未确认');};
   const first=await read(),desired=args.action==='add';
   const firstGroups=Array.isArray(first.groups)&&first.groups.length?first.groups:null;
   if(args.action==='status' || first.saved===desired)return {status:'completed',evidence:{saved:first.saved,changed:false,resumeId:args.resumeId,groupVerified:false,requestedGroup:args.group??null,...(firstGroups?{availableGroups:firstGroups}:{})}};
   // Reuse the visible dialog after a verified pre-save interruption.
   if(!(desired?first.addDialog:first.removeDialog))await click(first.button,desired?'收藏':'已收藏');
   let state;
   const groupsAre=state=>Array.isArray(state.groups)&&state.groups.length?state.groups:null;
   for(let i=0;i<15;i++){
    state=await read();
    if(groupsAre(state))observedGroups=groupsAre(state);
    if(desired?(state.addDialog && state.groupSelector):(state.removeDialog && state.confirm))break;
    await pause(200);
   }
   if(desired){
    if(!state.addDialog || !state.groupSelector){
     const groups=observedGroups??groupsAre(first);
     return {status:'blocked',evidence:{reason:'favorite_group_not_found',favoriteActionDispatched:true,resumeId:args.resumeId,requestedGroup:requested,...(groups?{availableGroups:groups}:{}),inspection:state}};
    }
    // A single click can land while the dialog is still settling, and Ant
    // re-renders the radio list on open. Observe up to five seconds; only a
    // closed dialog or a vanished control ends the wait early. Then, if the
    // freshly observed control is still present but unselected, click it once
    // more. Never click a vanished control and never substitute another one.
    const select=async current=>{
     await click(current.groupSelector,'指定收藏分组');
     for(let i=0;i<25;i++){
      current=await read();
      if(groupsAre(current))observedGroups=groupsAre(current);
      if(current.groupSelected&&current.save)return current;
      if(!current.addDialog)return current;
      await pause(200);
     }
     return current;
    };
    state=await select(state);
    if(!state.groupSelected && state.addDialog && state.groupSelector)state=await select(state);
    if(!state.groupSelected || !state.save)return {status:'blocked',evidence:{reason:'favorite_group_not_selected',resumeId:args.resumeId,requestedGroup:requested,groupMatched:state.groupMatched===true,...(observedGroups?{availableGroups:observedGroups}:{}),inspection:state}};
    await click(state.save,'保存收藏');
   }else{
    if(!state.removeDialog || !state.confirm)return {status:'blocked',evidence:{reason:'unfavorite_confirmation_missing'}};
    await click(state.confirm,'确认取消收藏');
   }
   for(let i=0;i<10;i++){state=await read();if(state.saved===desired && !state.addDialog && !state.removeDialog)return {status:'completed',evidence:{saved:desired,changed:true,resumeId:args.resumeId,group:args.group ?? null,groupSelectedBeforeSave:desired,groupVerified:false,verification:'saved-state-readback',...(desired&&observedGroups?{availableGroups:observedGroups}:{})}};await pause(200);}
   return {status:'unknown',evidence:{reason:'favorite_result_not_confirmed',resumeId:args.resumeId}};
  }catch(error){if(dispatched===0)return {status:'blocked',evidence:{reason:'favorite_preflight_unavailable',favoriteActionDispatched:false,resumeId:args.resumeId,inspection:lastInspection??null}};throw error;}finally{await driver.close();}
 });
}
