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
 const match=one(radios.filter(e=>norm(e.textContent)===norm(group)));
 // Ant radio labels include text outside the actual control. Aim at the
 // observed radio wrapper, whose hit area includes its native input.
 const input=match?.querySelector('input[type=radio]');
 const groupControl=input?.parentElement?.matches('span.ant-radio')?input.parentElement:match;
 const save=add?one(named('保存',add)):null,confirm=remove?one(named('确定',remove)):null;
 return {blocked:false,saved:!!saved,known:!!favorite!==!!saved,button:path(saved || favorite),
  addDialog:!!add,removeDialog:!!remove,groupSelector:path(groupControl),
  groupSelected:!!match && (match.getAttribute('aria-checked')==='true' || !!match.querySelector('input[type=radio]')?.checked),
  save:save && !save.disabled?path(save):null,confirm:path(confirm)};
}
export async function openFavoriteDriver(pageId,resumeId) {
 checkReadRuntime();
 const page=await createLiepinPage();page.setActivePage(pageId);
 try {
  const expectedUrl=await readBoundLocation(page,pageId,'/resume/showresumedetail/',{requireConnection:true});
  if(new URL(expectedUrl).searchParams.get('res_id_encode')!==resumeId)throw new Error('当前详情与指定简历不符');
  const actions=createNativeActionSequence(page,{expectedUrl,inspectTarget:inspectActionTarget});let sequence=0;
  return {inspect:group=>page.evaluate(inspectFavorite,{resumeId,group}),click:selector=>actions.click({actionId:`favorite-${++sequence}`,selector}),close:()=>page.closeWindow()};
 }catch(error){await page.closeWindow();throw error;}
}
export async function setFavorite(args,{openDriver=openFavoriteDriver,pause=ms=>new Promise(r=>setTimeout(r,ms))}={}) {
 detailUrl(args.resumeId);
 if(!['add','remove','status'].includes(args.action) || !/^[a-fA-F0-9]{16,128}$/.test(args.page ?? ''))throw new Error('需要 add/remove/status 和已绑定详情 page');
 if(args.action==='add' && (typeof args.group!=='string' || !args.group.trim()))throw new Error('收藏需要明确指定分组');
 const kind={add:'favorite',remove:'unfavorite',status:'inspect'}[args.action];
 const payload={resumeId:args.resumeId,page:args.page,action:args.action,...(args.action==='add'?{group:args.group}:{})};
 return executeScopedOperation(args.file,{operationId:args.operationId,kind,payload},async()=>{
  const driver=await openDriver(args.page,args.resumeId);
  try {
   const read=async()=>{const s=await driver.inspect(args.group);if(s.blocked || !s.known)throw new Error('收藏页面状态未确认');return s;};
   const first=await read(),desired=args.action==='add';
   if(args.action==='status' || first.saved===desired)return {status:'completed',evidence:{saved:first.saved,changed:false,resumeId:args.resumeId}};
   // Reuse the visible dialog after a verified pre-save interruption.
   if(!(desired?first.addDialog:first.removeDialog))await driver.click(first.button);
   let state;
   for(let i=0;i<10;i++){state=await read();if(desired?state.addDialog && state.groupSelector:state.removeDialog && state.confirm)break;await pause(200);}
   if(desired){
    if(!state.addDialog || !state.groupSelector)return {status:'blocked',evidence:{reason:'favorite_group_not_found',resumeId:args.resumeId}};
    await driver.click(state.groupSelector);state=await read();
    if(!state.groupSelected || !state.save)return {status:'blocked',evidence:{reason:'favorite_group_not_selected'}};
    await driver.click(state.save);
   }else{
    if(!state.removeDialog || !state.confirm)return {status:'blocked',evidence:{reason:'unfavorite_confirmation_missing'}};
    await driver.click(state.confirm);
   }
   for(let i=0;i<10;i++){state=await read();if(state.saved===desired && !state.addDialog && !state.removeDialog)return {status:'completed',evidence:{saved:desired,changed:true,resumeId:args.resumeId,group:args.group ?? null}};await pause(200);}
   return {status:'unknown',evidence:{reason:'favorite_result_not_confirmed',resumeId:args.resumeId}};
  }finally{await driver.close();}
 });
}
