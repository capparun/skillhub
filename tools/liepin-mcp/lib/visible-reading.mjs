import {assertLiepinUrl} from './transport.mjs';
/** Fixed observer: visible text only; no scrolling, focus, or DOM mutation. */
export function inspectReadingViewport({resumeId}){
 if(location.origin!=='https://h.liepin.com'||location.pathname!=='/resume/showresumedetail/'||new URL(location.href).searchParams.get('res_id_encode')!==resumeId)return {status:'page_changed'};
 const body=document.body?.innerText??'';
 if(/验证码|操作过于频繁|访问受限|安全验证/.test(body))return {status:'risk_signal'};
 if(/扫码登录|请登录/.test(body))return {status:'login_required'};
 const texts=[],walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
 let node;while((node=walker.nextNode())){
  if(!node.textContent.trim()||!node.parentElement||['SCRIPT','STYLE','NOSCRIPT'].includes(node.parentElement.tagName))continue;
  const style=getComputedStyle(node.parentElement);if(style.display==='none'||style.visibility==='hidden')continue;
  const range=document.createRange();range.selectNodeContents(node);
  if([...range.getClientRects()].some(r=>r.width>0&&r.height>0&&r.bottom>0&&r.top<innerHeight&&r.right>0&&r.left<innerWidth))texts.push(node.textContent.trim());
 }
 const text=texts.join('\n').slice(0,6000),root=document.scrollingElement??document.documentElement;
 return {status:'ready',text,characters:text.length,y:root.scrollTop,height:root.scrollHeight,viewport:innerHeight,atEnd:root.scrollTop+innerHeight>=root.scrollHeight-4};
}
/** Deliberate content review, not simulated activity or a detection guarantee. */
export async function reviewVisibleDetail(tab,resumeId,{signal,onAction=()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms)),maxViews=3}={}){
 const check=()=>{if(signal?.aborted)throw Error('可见内容阅读已取消');};
 const emit=(phase,description,extra={})=>onAction({at:new Date().toISOString(),phase,description,...extra});
 const observe=async()=>{check();const url=assertLiepinUrl(await tab.url(),'/resume/showresumedetail/');if(url.searchParams.get('res_id_encode')!==resumeId)throw Error('阅读详情身份变化');const s=await tab.evaluate(inspectReadingViewport,{arg:{resumeId}});check();if(s.status!=='ready'||![s.y,s.height,s.viewport,s.characters].every(Number.isFinite)||s.viewport<=0)throw Error('可见内容阅读停止：'+s.status);return s;};
 let state=await observe(),moves=0;
 // Expansion can leave the page near its end. Return upward in bounded steps.
 while(state.y>4&&moves<8){const amount=Math.min(1200,Math.ceil(state.y));emit('dispatching',`向上滚动详情 ${amount} 像素，回到简历起始内容`);await tab.act({action:'scroll',direction:'up',amount});check();const next=await observe();if(next.y>=state.y)throw Error('详情向上滚动未确认');state=next;moves++;}
 if(state.y>4)throw Error('未回到简历起始位置，保留资料后停止逐屏阅读');
 const views=[];
 for(let i=0;i<maxViews;i++){
  check();const dwellMs=Math.min(4000,Math.max(1000,Math.ceil(state.characters/200)*1000));
  emit('reading',`查看详情第 ${i+1} 屏可见内容，停留 ${dwellMs/1000} 秒供栏目核对`,{visibleCharacters:state.characters,scrollY:state.y});
  await pause(dwellMs);check();views.push({y:state.y,characters:state.characters,dwellMs});
  if(state.atEnd){emit('observed','已逐屏到达简历页面底部；适岗结论仍由已保存证据评估');return {views,atEnd:true};}
  if(i+1===maxViews)break;
  const amount=Math.min(700,Math.max(200,Math.floor(state.viewport*.7)));emit('dispatching',`向下滚动详情 ${amount} 像素，查看后续栏目`);
  await tab.act({action:'scroll',direction:'down',amount});check();const next=await observe();if(next.y<=state.y)throw Error('详情向下滚动未确认');state=next;
 }
 emit('observed','本次逐屏阅读达到上限，后续栏目尚未逐屏核对；不宣称完整人工阅读');return {views,atEnd:false,reason:'view_limit'};
}
export function inspectListReadingTarget({selector}){
 if(location.origin!=='https://h.liepin.com'||location.pathname!=='/search/getConditionItem')return {status:'page_changed'};
 if(/验证码|操作过于频繁|访问受限|安全验证/.test(document.body?.innerText??''))return {status:'risk_signal'};
 const nodes=document.querySelectorAll(selector);if(nodes.length!==1)return {status:'target_not_unique'};
 const el=nodes[0],rect=el.getBoundingClientRect(),style=getComputedStyle(el);
 if(!rect.width||!rect.height||style.display==='none'||style.visibility==='hidden')return {status:'target_unavailable'};
 return {status:'ready',top:rect.top,bottom:rect.bottom,viewport:innerHeight,characters:el.innerText?.length??0,inView:rect.top>=0&&rect.top<innerHeight-80&&rect.bottom>0};
}
export async function reviewListTarget(tab,selector,{signal,onAction=()=>{},pause=ms=>new Promise(r=>setTimeout(r,ms))}={}){
 const check=()=>{if(signal?.aborted)throw Error('列表阅读已取消');};
 const observe=async()=>{check();assertLiepinUrl(await tab.url(),'/search/getConditionItem');const s=await tab.evaluate(inspectListReadingTarget,{arg:{selector}});check();if(s.status!=='ready'||![s.top,s.bottom,s.viewport,s.characters].every(Number.isFinite))throw Error('列表阅读停止：'+s.status);return s;};
 for(let step=0;step<8;step++){
  const s=await observe();
  if(s.inView){const dwellMs=Math.min(2000,Math.max(500,Math.ceil(s.characters/200)*500));onAction({phase:'reading',description:`查看当前可见候选卡片，停留 ${dwellMs/1000} 秒核对职位与经历`});await pause(dwellMs);check();return {visible:true,scrolls:step};}
  const direction=s.top<0?'up':'down',amount=Math.min(600,Math.max(200,Math.floor(s.viewport*.65)));
  onAction({phase:'reading',description:'先核对当前列表可见内容，再滚动查看后续卡片'});await pause(500);check();
  onAction({phase:'dispatching',description:`向${direction==='down'?'下':'上'}滚动列表 ${amount} 像素`});await tab.act({action:'scroll',direction,amount});check();
 }
 throw Error('列表逐屏滚动达到上限，目标卡片尚未核对，不自动打开');
}
