import {readExpandedDetail} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/expanded-detail.js';
import {assertLiepinUrl} from './transport.mjs';
/** Public SDK only: fixed observers and act; no direct CDP dependency. */
export function adapterExpansionPage(tab,{resumeId,signal,onAction=()=>{}}={}){
 let stopped=false;
 const guarded=async work=>{
  if(stopped||signal?.aborted)throw Error('详情展开已停止');
  try{
   const url=assertLiepinUrl(await tab.url(),'/resume/showresumedetail/');
   const ids=url.searchParams.getAll('res_id_encode');
   if(ids.length!==1||ids[0]!==resumeId)throw Error('详情身份变化');
   if(signal?.aborted)throw Error('详情展开已取消');
   const result=await work();
   if(signal?.aborted)throw Error('详情展开已取消，已派发效果须核对');
   return result;
  }catch(error){stopped=true;throw error;}
 };
 const page={evaluate:(fn,arg)=>guarded(()=>tab.evaluate(fn,{arg}))};
 const createActions=()=>({
  scrollTo:({selector})=>guarded(async()=>{
   onAction({phase:'dispatching',description:'滚动至已识别的经历展开按钮'});
   return tab.evaluate(({selector})=>{const nodes=document.querySelectorAll(selector);if(nodes.length!==1)throw Error('展开目标不唯一');nodes[0].scrollIntoView({block:'center'});return {scrolled:true};},{arg:{selector}});
  }),
  click:({selector})=>guarded(async()=>{
   onAction({phase:'dispatching',description:'点击已核对的“显示其他经历”按钮'});
   const result=await tab.act({action:'click',target:{selector}});
   onAction({phase:'returned',description:'展开点击已返回，继续回读经历内容确认效果'});
   return result;
  }),
 });
 return {page,createActions};
}
export function readAdapterExpandedDetail(tab,resumeId,options={}){
 const {page,createActions}=adapterExpansionPage(tab,{...options,resumeId});
 return readExpandedDetail(page,resumeId,{createActions});
}
