/** MCP transport for the existing fixed Liepin observers and search engine. */
import {createSearchDriver} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/search-driver.js';
export function assertLiepinUrl(value, path) {
 const url=new URL(value);
 if(url.origin!=='https://h.liepin.com'||url.pathname!==path||url.username||url.password)throw Error('猎聘页面地址或身份已变化');
 return url;
}
export function createPageFacade(tab,{signal,onAction=()=>{}}={}) {
 let stopped=false;
 const guard=async fn=>{if(stopped||signal?.aborted)throw Error('执行已停止，需核对任务后继续');try{const result=await fn();if(signal?.aborted)throw Error('操作已取消，已派发效果须核对');return result;}catch(e){stopped=true;throw e;}};
 return {
  evaluate:(fn,arg)=>guard(async()=>{const result=await tab.evaluate(fn,{arg});if(result?.url==='about:blank')throw Object.assign(Error('猎聘页面已变为空白，停止且不重放'),{code:'LIEPIN_UNEXPECTED_BLANK_PAGE'});return result;}),
  cdp:(method,params)=>guard(async()=>{
   const descriptions={
    'DOM.getDocument':'读取页面文档结构（不点击）',
    'DOM.querySelectorAll':'定位页面控件（不点击）',
    'DOM.scrollIntoViewIfNeeded':'将已定位控件滚动到可见区域',
    'DOM.focus':'将输入焦点移到已定位控件',
    'Input.insertText':'向当前输入框输入文本',
    'Input.dispatchMouseEvent':`${{mouseMoved:'移动鼠标',mousePressed:'按下鼠标',mouseReleased:'松开鼠标'}[params?.type]??'派发鼠标事件'}，位置(${params?.x}, ${params?.y})`,
    'Input.dispatchKeyEvent':`${{keyDown:'按下按键',rawKeyDown:'按下按键',keyUp:'松开按键',char:'输入字符'}[params?.type]??'派发键盘事件'}`,
   };
   if(!Object.hasOwn(descriptions,method))throw Error('此通道只允许已审核的DOM定位与输入指令');
   onAction({at:new Date().toISOString(),phase:'dispatching',description:descriptions[method],method});
   const result=await tab.cdp.send(method,params);
   onAction({at:new Date().toISOString(),phase:'returned',description:descriptions[method]+'：指令已返回，效果待回读',method});
   return result;
  }),
  scroll:(direction,amount)=>guard(async()=>{
   if(!['up','down','left','right'].includes(direction)||!Number.isInteger(amount)||amount<1||amount>1200)throw Error('滚动方向或距离无效');
   onAction({at:new Date().toISOString(),phase:'dispatching',description:`向${{up:'上',down:'下',left:'左',right:'右'}[direction]}滚动页面 ${amount} 像素`});
   const result=await tab.act({action:'scroll',direction,amount});
   onAction({at:new Date().toISOString(),phase:'returned',description:'滚动指令已返回，控件位置仍由回读确认',delivery:result.delivery});return result;
  }),
  action:async(action,selector,value,label)=>guard(async()=>{
   onAction({at:new Date().toISOString(),phase:'dispatching',description:`${{click:'点击',fill:'输入',hover:'将鼠标移到',press:'按键',scroll:'滚动'}[action]??action}：${label??selector??value}`});
   const result=await tab.act({action,...(selector?{target:{selector}}:{}),...(value!==undefined?{value}:{})});
   onAction({at:new Date().toISOString(),phase:'returned',description:'浏览器已返回动作结果，业务效果仍由回读确认',delivery:result.delivery});return result;
  }),
 };
}
export function createMcpSearchDriver(tab,{expectedUrl,signal,onAction}={}) {
 assertLiepinUrl(expectedUrl,'/search/getConditionItem');
 const checkedTab={evaluate:(...args)=>tab.evaluate(...args),cdp:tab.cdp,act:async args=>{assertLiepinUrl(await tab.url(),'/search/getConditionItem');return tab.act(args);}};
 const page=createPageFacade(checkedTab,{signal,onAction});
 const actions={
  click:({selector,label})=>page.action('click',selector,undefined,label),
  fill:({selector,value,label})=>page.action('fill',selector,value,label),
  hover:({selector,label})=>page.action('hover',selector,undefined,label),
  // MCP act performs its own actionable/viewport handling. An explicit scroll
  // request is kept separate from business clicks and only addresses observed nodes.
  scrollTo:async({selector})=>{onAction?.({at:new Date().toISOString(),phase:'dispatching',description:'滚动至已定位的筛选控件'});const result=await page.evaluate(({selector})=>{const nodes=document.querySelectorAll(selector);if(nodes.length!==1)throw Error('滚动目标不唯一');nodes[0].scrollIntoView({block:'center'});return {scrolled:true};},{selector});onAction?.({at:new Date().toISOString(),phase:'returned',description:'滚动指令已返回，控件位置待重新观察'});return result;},
  scroll:({direction,pixels})=>page.scroll(direction,pixels),
  escape:()=>page.action('press','body','Escape','Escape（关闭当前下拉框）'),
 };
 return createSearchDriver(page,{expectedUrl,actions,onAction});
}
