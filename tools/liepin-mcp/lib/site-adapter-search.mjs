import {search,results,nextPage,logger,saveSearchPage} from './workflow.mjs';
import {restoreSearch} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/restore-search-task.js';
import {executeBoundSearch} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/bound-search-task.js';
import {executeMcpOperation} from './execution.mjs';
import {createMcpSearchDriver} from './transport.mjs';
// Adapt only the documented context tab; never create a browser or subprocess.
export function boundContext({tab,args,signal}){
 const check=()=>{
  if(signal?.aborted)throw Error('操作已取消');
  if(String(tab.id)!==args.tab_id)throw Error('官方 Adapter 绑定的页面与指定标签不一致');
 };
 check();return {verify:async()=>check(),tab:id=>{check();if(id!==args.tab_id)throw Error('不能访问未绑定标签');return tab;}};
}
export function searchAdapterRound(context,dependencies={}){
 if(context.args.restore===true)return restoreAdapterRound(context,dependencies).then(snapshot=>({snapshot}));
 return search(boundContext(context),context.args,{...dependencies,signal:context.signal});
}
export function nextAdapterPage(context){
 return nextPage(boundContext(context),context.args,{signal:context.signal});
}
export function readAdapterResults(context){
 return results(boundContext(context),context.args,{signal:context.signal});
}

export function restoreAdapterRound(context,{openRestoreDriver,executeRestoreSearch=executeBoundSearch,pause}={}){
 const {args,signal}=context;
 if(!args.operation_id||!args.reason?.trim())throw Error('恢复需要新的操作ID与实际原因；不会自动重复搜索');
 const onAction=logger(args.file,{operationId:args.operation_id,tabId:args.tab_id});
 return restoreSearch({file:args.file,roundId:args.round_id,page:args.tab_id,operationId:args.operation_id,reason:args.reason},{
  pause,execute:(file,request,work)=>executeMcpOperation(file,request,work,{signal}),
  openDriver:openRestoreDriver??(async id=>{const client=boundContext(context);await client.verify();const tab=client.tab(id);return {...createMcpSearchDriver(tab,{expectedUrl:await tab.url(),signal,onAction}),close:async()=>{}};}),
  executeSearch:(request,filters,options)=>executeRestoreSearch(request,filters,{...options,onCheckpoint:checkpoint=>saveSearchPage(args.file,checkpoint,options.collectionRoundId,args.tab_id)}),
 });
}
