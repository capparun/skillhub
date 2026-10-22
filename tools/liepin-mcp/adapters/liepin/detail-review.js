import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {continueDetailReview} from '../../lib/site-adapter-detail-review.mjs';
export default defineAdapter({
 description:'继续本运行时保留的详情：完成证据评估后按授权收藏，或关闭并返回列表；不重复打开',
 domain:'h.liepin.com',access:'write',result:{kind:'value',description:'收藏回读或审阅关闭结果'},
 args:[{name:'file',type:'string',required:true},{name:'parent_tab_id',type:'string',required:true},{name:'review_token',type:'string',required:true},{name:'action',type:'string',required:true,choices:['add','close']},{name:'operation_id',type:'string'},{name:'group',type:'string'}],
 run:withAdapterDeadline(continueDetailReview),
});
