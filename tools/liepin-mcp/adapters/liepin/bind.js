import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {adapterBind} from '../../lib/site-adapter-binding.mjs';
export default defineAdapter({description:'将观察到的已有猎聘标签绑定到Adapter会话，核对完整URL并保留用户页面',domain:'h.liepin.com',access:'write',args:[{name:'file',type:'string',required:true},{name:'tab_id',type:'string',required:true},{name:'expected_url',type:'string',required:true}],result:{kind:'value',description:'绑定ID与用户页面归属'},run:withAdapterDeadline(adapterBind)});
