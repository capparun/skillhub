import {readTask,updateTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {setFavorite} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/favorite.js';
import {favoriteListTarget} from './site-adapter-favorite-list.mjs';
import {adapterFavoriteDriver} from './site-adapter-favorite.mjs';
import {executeMcpOperation} from './execution.mjs';
import {logger} from './workflow.mjs';
/** Continue a runtime-owned open detail after the Agent has evaluated saved evidence. */
export async function continueDetailReview(context,{favorite=setFavorite}={}){
 const {args,signal,detailReviews}=context;
 if(!detailReviews?.use||!detailReviews?.finish)throw Error('当前运行时不支持详情审阅；不重新打开页面');
 const task=readTask(args.file),review=task.detailReviews?.find(r=>r.token===args.review_token);
 if(!review||review.parentTab!==args.parent_tab_id)throw Error('详情审阅回执与任务或父页不符');
 if(args.action==='close'&&review.status==='closed')return {closed:true,cached:true};
 const identity={file:args.file,parent:review.parentTab},onAction=logger(args.file,{operationId:args.operation_id,tabId:review.tabId});
 if(signal?.aborted)throw Error('详情审阅已取消');
 if(args.action==='close'){
  if(task.operations.some(o=>['favorite','unfavorite'].includes(o.kind)&&['unknown','pending','running'].includes(o.status)))throw Error('收藏结果尚未确认，保留详情现场先核对');
  onAction({phase:'dispatching',description:'关闭本次保留的详情页并返回原搜索列表'});
  const result=await detailReviews.finish(args.review_token,identity);
  updateTask(args.file,t=>{const item=t.detailReviews.find(r=>r.token===args.review_token);item.status='closed';item.closedAt=new Date().toISOString();return t;});
  onAction({phase:'returned',description:result.returned?'本次保留详情已关闭，返回原搜索页指令已完成':'本次保留详情已关闭，但返回原搜索页失败，需核对窗口'});return result;
 }
 if(args.action!=='add')throw Error('仅支持add或close');
 if(!args.operation_id||!args.group?.trim())throw Error('收藏需要独立operation_id与准确group');
 if(review.status!=='open')throw Error('详情审阅已结束；不重新打开');
 const record=favoriteListTarget(task,{observation_id:review.observationId,group:args.group,action:'add'});
 const resumeId=record.candidateKey.slice(7);
 return detailReviews.use(args.review_token,identity,async child=>{
  if(String(child.id)!==review.tabId||await child.url()!==review.url)throw Error('当前详情身份已变化');
  return favorite({file:args.file,operationId:args.operation_id,page:review.tabId,resumeId,action:'add',group:args.group},{
   validatePage:id=>/^\d+$/.test(id),
   execute:(file,request,work)=>executeMcpOperation(file,{...request,payload:{observationId:record.id,observationHash:record.hash,page:review.parentTab,resumeId,action:'add',group:args.group}},work,{signal}),
   openDriver:async()=>adapterFavoriteDriver(child,{resumeId,signal,onAction}),
  });
 });
}
