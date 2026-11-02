import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {adapterFavorites} from '../../lib/site-adapter-business.mjs';
export default defineAdapter({
 description:'读取已绑定的猎聘收藏列表，可在独立工作标签核验；不更改收藏、不翻页',
 domain:'h.liepin.com',access:'read',result:{kind:'value',description:'当前可见收藏条目及保存结果'},
 args:[{name:'after_operation_id',type:'string',description:'可选：同组已完成收藏/取消的操作ID；据此登记写后新核验，原读取回执仍保留'},{name:'workspace',type:'boolean',default:false,description:'新建人才管理工作页，读取后关闭；tab_id 为保留的原页面，须授权 workspace:true 请求'},{name:'file',type:'string',required:true},{name:'operation_id',type:'string',required:true},{name:'tab_id',type:'string',required:true},{name:'limit',type:'int',min:1,max:30,default:3},{name:'group',type:'string',description:'可选：准确收藏分组名，仅切换视图并回读，不增删收藏'}],
 run:withAdapterDeadline(adapterFavorites),
});
