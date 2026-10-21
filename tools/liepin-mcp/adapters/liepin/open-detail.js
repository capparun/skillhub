import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {openAdapterDetail} from '../../lib/site-adapter-open-detail.mjs';
export default defineAdapter({
 description:'核对已保存列表卡片后点击姓名，展开详情、保存并关闭本次详情返回列表；需要同会话标签兼容接口',
 domain:'h.liepin.com',access:'write',result:{kind:'value',description:'已保存详情、列表身份关联及返回状态'},
 args:[{name:'file',type:'string',required:true},{name:'operation_id',type:'string',required:true},{name:'tab_id',type:'string',required:true},{name:'observation_id',type:'string',required:true}],
 run:withAdapterDeadline(openAdapterDetail),
});
