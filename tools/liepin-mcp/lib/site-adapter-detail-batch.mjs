import {runDetailBatch} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/detail-batch.js';
import {boundContext} from './site-adapter-search.mjs';
import {openAdapterDetail} from './site-adapter-open-detail.mjs';
export function adapterDetailBatch(context){
 boundContext(context);
 return runDetailBatch({file:context.args.file,id:context.args.id,intervalMs:context.args.interval_ms??6000,maxItems:1},{
  readDetail:args=>{
   if(context.signal?.aborted)throw Error('详情批次已取消，保留已完成记录');
   if(args.page!==context.args.tab_id)throw Error('批次保存页面与当前绑定页面不符');
   return openAdapterDetail({...context,args:{file:args.file,tab_id:args.page,operation_id:args.operationId,observation_id:args.observationId}});
  },
 });
}
