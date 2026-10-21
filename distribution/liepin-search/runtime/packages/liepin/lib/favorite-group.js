/** Visible收藏 tree only. No APIs, hidden state, or implicit creation. */
export function inspectFavoriteGroup({resumeId,name}){
 const url=new URL(location.href),body=document.body?.innerText??'',norm=s=>(s??'').replace(/\s+/g,'');
 if(url.origin!=='https://h.liepin.com'||url.pathname!=='/resume/showresumedetail/'||url.searchParams.getAll('res_id_encode').length!==1||url.searchParams.get('res_id_encode')!==resumeId||/验证码|访问过于频繁|安全验证|请登录|扫码登录/.test(body))return {blocked:true};
 const visible=e=>{const r=e.getBoundingClientRect();return r.width>0&&r.height>0&&getComputedStyle(e).visibility!=='hidden';};
 const selector=e=>{if(!e)return null;const a=[];while(e&&e!==document.documentElement){const siblings=[...e.parentElement.children].filter(n=>n.tagName===e.tagName);a.unshift(`${e.tagName.toLowerCase()}:nth-of-type(${siblings.indexOf(e)+1})`);e=e.parentElement;}return 'html > '+a.join(' > ');};
 const one=a=>a.length===1?a[0]:null,buttons=[...document.querySelectorAll('button,[role=button]')].filter(visible);
 const favorite=one(buttons.filter(e=>norm(e.textContent)==='收藏')),saved=one(buttons.filter(e=>norm(e.textContent)==='已收藏'));
 const popup=one([...document.querySelectorAll('.ant-popover-inner')].filter(e=>visible(e)&&norm(e.querySelector('.ant-popover-title')?.textContent)==='请设置收藏'));
 if(!popup)return {blocked:false,known:!!favorite!==!!saved,saved:!!saved,favorite:selector(favorite),popup:false};
 const labels=[...popup.querySelectorAll('label.ant-radio-wrapper')].filter(visible),groups=labels.map(e=>e.textContent.trim()),matches=labels.filter(e=>e.textContent.trim()===name.trim());
 const root=one([...popup.querySelectorAll('.tree-title-box')].filter(e=>norm(e.querySelector('label')?.textContent)==='我的收藏'));
 const add=root?one([...root.querySelectorAll('button')].filter(e=>visible(e)&&norm(e.textContent)==='添加子节点')):null;
 const input=one([...popup.querySelectorAll('input:not([type=radio])')].filter(e=>visible(e)&&!e.disabled&&!e.readOnly));
 let save=null;
 if(input){let parent=input.parentElement;while(parent&&parent!==popup){const controls=[...parent.querySelectorAll('button,[role=button],[role=img][aria-label=check]')].filter(e=>visible(e)&&!e.disabled&&(/^(确定|保存|完成)$/.test(norm(e.textContent))||e.getAttribute('aria-label')==='check'));save=one(controls);if(save)break;parent=parent.parentElement;}}
 return {blocked:false,known:true,popup:true,groups,exists:matches.length===1,ambiguous:matches.length>1,root:selector(root),add:selector(add),input:selector(input),value:input?.value??null,save:selector(save),editorHtml:input?(input.closest('.tree-title-box')??input.parentElement)?.outerHTML?.slice(0,16000):null};
}
export async function createFavoriteGroup(args,{execute,openDriver,pause=ms=>new Promise(r=>setTimeout(r,ms))}){
 if(typeof args.name!=='string'||!args.name.trim()||args.name.length>100)throw Error('需要准确分组名');
 return execute(args.file,{operationId:args.operationId,kind:'favorite-group-create',payload:args.payload},async()=>{
  const driver=await openDriver();let submitted=false,state;
  const read=async()=>{for(let i=0;i<15;i++){state=await driver.inspect();if(state.blocked)throw Error('分组页面不可用');if(state.known)return state;await pause(200);}throw Error('分组控件未就绪');};
  try{
   await read();if(!state.popup){if(state.saved||!state.favorite)return {status:'blocked',evidence:{reason:'group_management_unavailable',createSubmitted:false}};await driver.act('click',state.favorite);}
   for(let i=0;i<25&&!state.popup;i++){await pause(200);await read();}
   if(!state.popup||state.ambiguous)return {status:'blocked',evidence:{reason:'group_dialog_not_unique',createSubmitted:false}};
   if(state.exists)return {status:'completed',evidence:{name:args.name,parent:'我的收藏',groupVerified:true,created:false,availableGroups:state.groups}};
   // "添加子节点" only appears while the root row itself is hovered, and the
   // tree re-renders as the popup settles. Hover, then observe before deciding
   // the control is absent; repeat the hover at most twice, never clicking an
   // unobserved control.
   for(let attempt=0;attempt<3&&!state.input&&!state.add&&state.root;attempt++){
    await driver.act('hover',state.root);
    for(let i=0;i<10&&!state.add&&!state.input;i++){await pause(200);await read();}
   }
   if(!state.input){if(!state.add)return {status:'blocked',evidence:{reason:'root_group_add_missing',createSubmitted:false,inspection:state}};await driver.act('click',state.add);}
   for(let i=0;i<15&&!state.input;i++){await pause(200);await read();}
   if(!state.input)return {status:'blocked',evidence:{reason:'group_editor_unrecognized',createSubmitted:false,inspection:state}};
   await driver.act('fill',state.input,args.name);await read();
   if(state.value!==args.name||!state.save)return {status:'blocked',evidence:{reason:'group_save_unrecognized',createSubmitted:false,inspection:state}};
   submitted=true;await driver.act('click',state.save);
   for(let i=0;i<15;i++){await read();if(state.exists&&!state.input&&!state.ambiguous)return {status:'completed',evidence:{name:args.name,parent:'我的收藏',groupVerified:true,created:true,availableGroups:state.groups}};await pause(200);}
   return {status:'unknown',evidence:{reason:'group_creation_not_confirmed',name:args.name,createSubmitted:true}};
  }catch(error){if(!submitted)return {status:'blocked',evidence:{reason:'group_preflight_failed',createSubmitted:false,error:error.message}};throw error;}
 });
}
