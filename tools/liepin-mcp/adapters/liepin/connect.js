import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {connectAdapterSearch} from '../../lib/site-adapter-connect.mjs';
export default defineAdapter({
 description:'在官方猎聘Adapter会话中打开搜索页并返回实际标签ID；需明确授权，不用于白屏重试',
 domain:'h.liepin.com',access:'write',result:{kind:'value',description:'Adapter会话标签ID与页面地址，未证明登录或业务就绪'},
 args:[{name:'replaces_operation_id',type:'string',description:'可选：原独立工作页创建回执；只在Chrome确认该页已不存在时新建替代页，不提交搜索'},{name:'new_workspace',type:'boolean',default:false,description:'新建搜索标签并保留当前页面；需精确授权newWorkspace:true'},{name:'file',type:'string',required:true},{name:'operation_id',type:'string',required:true}],
 run:withAdapterDeadline(connectAdapterSearch),
});
