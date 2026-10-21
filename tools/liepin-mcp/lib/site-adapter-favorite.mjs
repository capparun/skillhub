import {setFavorite,inspectFavorite} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/favorite.js';
import {executeMcpOperation} from './execution.mjs';
import {boundContext} from './site-adapter-search.mjs';
import {assertLiepinUrl} from './transport.mjs';
import {logger} from './workflow.mjs';
export function adapterFavoriteDriver(tab,{resumeId,signal,onAction=()=>{}}){
 let stopped=false,last;
 const guard=async work=>{
  if(stopped||signal?.aborted)throw Error('收藏操作已停止');
  try{
   const url=assertLiepinUrl(await tab.url(),'/resume/showresumedetail/'),ids=url.searchParams.getAll('res_id_encode');
   if(ids.length!==1||ids[0]!==resumeId)throw Error('收藏简历身份变化');
   if(signal?.aborted)throw Error('收藏操作已取消');
   const result=await work();if(signal?.aborted)throw Error('收藏操作已取消，需核对已派发效果');return result;
  }catch(error){stopped=true;throw error;}
 };
 return {
  inspect:group=>guard(async()=>{
   last=await tab.evaluate(inspectFavorite,{arg:{resumeId,group}});
   onAction({phase:'observed',description:'读取收藏按钮、目标分组选中状态及保存按钮，不点击',favoriteState:{known:last.known===true,blocked:last.blocked===true,saved:last.saved===true,addDialog:last.addDialog===true,groupFound:!!last.groupSelector,groupSelected:last.groupSelected===true,saveReady:!!last.save,readyState:last.readyState??null}});
   return last;
  }),
  click:selector=>guard(async()=>{
   if(!selector||last?.blocked||!last?.known||![last.button,last.groupSelector,last.save,last.confirm].includes(selector))throw Error('收藏目标未经当前观察确认');
   const label=selector===last.groupSelector?'指定收藏分组':selector===last.save?'保存收藏':selector===last.confirm?'确认取消收藏':last.saved?'已收藏按钮':'收藏按钮';
   last=undefined; // A dispatched target cannot be reused without observing again.
   onAction({phase:'dispatching',description:`点击${label}`});
   const result=await tab.act({action:'click',target:{selector}});
   onAction({phase:'returned',description:'收藏点击已返回，等待页面回读确认'});return result;
  }),
  close:async()=>{},
 };
}
export function adapterFavorite(context){
 boundContext(context);
 const {args,tab,signal}=context;
 return setFavorite({file:args.file,operationId:args.operation_id,page:args.tab_id,resumeId:args.resume_id,action:args.action,group:args.group},{
  validatePage:page=>typeof page==='string'&&/^\d+$/.test(page)&&Number.isSafeInteger(Number(page)),
  execute:(file,request,work)=>executeMcpOperation(file,request,work,{signal}),
  openDriver:async()=>adapterFavoriteDriver(tab,{resumeId:args.resume_id,signal,onAction:logger(args.file,{operationId:args.operation_id,tabId:args.tab_id})}),
 });
}
