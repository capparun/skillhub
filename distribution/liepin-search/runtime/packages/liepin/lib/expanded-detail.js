import {inspectDetail,parseDetail} from './detail.js';
import {createNativeActionSequence,inspectActionTarget} from './native-actions.js';

// Only the observed experience-expansion labels are actionable. Never treat
// generic “查看更多”, attachment, contact or purchase controls as expansion.
export function inspectExperienceExpanders({resumeId}) {
 const url=new URL(location.href),text=document.body?.innerText ?? '';
 if(url.origin!=='https://h.liepin.com' || url.pathname!=='/resume/showresumedetail/' || url.searchParams.get('res_id_encode')!==resumeId)throw new Error('详情页面身份变化');
 if(/验证码|访问过于频繁|操作频繁|安全验证|异常访问|请登录|扫码登录/.test(text))throw new Error('详情页面不可继续操作');
 const label=el=>el.textContent.replace(/\s/g,'');
 const pattern=/^显示其他\d+段(?:工作|项目|教育)经历$/;
 const matches=[...document.querySelectorAll('button,a,span,div,[role=button]')].filter(el=>
  el.getClientRects().length && getComputedStyle(el).visibility!=='hidden' && pattern.test(label(el))
  && ![...el.children].some(child=>pattern.test(label(child))));
 return matches.map(el=>{
  const text=label(el),parts=[];
  for(let node=el;node && node!==document.documentElement;node=node.parentElement){
   const peers=[...node.parentElement.children].filter(n=>n.tagName===node.tagName);
   parts.unshift(`${node.tagName.toLowerCase()}:nth-of-type(${peers.indexOf(node)+1})`);
  }
  return {label:text,selector:'html > '+parts.join(' > ')};
 });
}

export async function readExpandedDetail(page,resumeId,{pause=ms=>new Promise(r=>setTimeout(r,ms)),createActions=createNativeActionSequence}={}) {
 let snapshot=await page.evaluate(inspectDetail);
 if(!['readable','partial'].includes(parseDetail(snapshot,resumeId).status))return snapshot;
 const actions=createActions(page,{expectedUrl:snapshot.url,inspectTarget:inspectActionTarget});
 const attempted=new Set();let expanded=0;
 for(let i=0;i<12;i++) {
  const controls=await page.evaluate(inspectExperienceExpanders,{resumeId});
  if(!controls.length)return {...snapshot,expansion:{expanded}};
  const target=controls[0],key=target.selector+'|'+target.label;
  if(attempted.has(key))return {...snapshot,expansion:{expanded,incomplete:true,reason:'expansion_not_confirmed'}};
  attempted.add(key);
  await actions.scrollTo({actionId:`expand-scroll-${i}`,selector:target.selector});
  const current=await page.evaluate(inspectExperienceExpanders,{resumeId});
  if(!current.some(c=>c.selector===target.selector && c.label===target.label))throw new Error('展开入口已变化');
  await actions.click({actionId:`expand-click-${i}`,selector:target.selector});
  let confirmed=false;
  for(let attempt=0;attempt<10;attempt++) {
   snapshot=await page.evaluate(inspectDetail);
   if(!['readable','partial'].includes(parseDetail(snapshot,resumeId).status))return snapshot;
   const remaining=await page.evaluate(inspectExperienceExpanders,{resumeId});
   if(!remaining.some(c=>c.selector===target.selector && c.label===target.label)){confirmed=true;break;}
   if(attempt<9)await pause(200);
  }
  if(!confirmed)return {...snapshot,expansion:{expanded,incomplete:true,reason:'expansion_not_confirmed'}};
  expanded++;
 }
 return {...snapshot,expansion:{expanded,incomplete:true,reason:'expansion_limit'}};
}
