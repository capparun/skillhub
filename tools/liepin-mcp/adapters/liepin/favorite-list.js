import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {favoriteFromList} from '../../lib/site-adapter-favorite-list.mjs';
export default defineAdapter({
 description:'按已保存跟进依据，从核实过的列表打开对应详情并收藏到指定组，回读后关闭本次详情返回列表；不重新搜索',
 domain:'h.liepin.com',access:'write',result:{kind:'value',description:'收藏回执；已有收藏但组别未核实会明确保留'},
 args:[{name:'action',type:'string',choices:['add','remove'],default:'add'},{name:'file',type:'string',required:true},{name:'operation_id',type:'string',required:true},{name:'open_operation_id',type:'string',required:true},{name:'tab_id',type:'string',required:true},{name:'observation_id',type:'string',required:true},{name:'group',type:'string',required:true},{name:'verify_only',type:'boolean',default:false},{name:'create_group',type:'boolean',default:false},{name:'group_operation_id',type:'string'}],
 run:withAdapterDeadline(favoriteFromList),
});
