import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {nextAdapterPage} from '../../lib/site-adapter-search.mjs';
export default defineAdapter({
 description:'在已绑定的搜索结果上翻到下一页并保存新一页，不重新提交查询；页码与首行都未变化则停止',
 domain:'h.liepin.com',access:'write',result:{kind:'value',description:'新页页码、保存数量与绑定标签ID'},
 args:[{name:'file',type:'string',required:true},{name:'operation_id',type:'string',required:true},{name:'tab_id',type:'string',required:true}],
 run:withAdapterDeadline(nextAdapterPage),
});
