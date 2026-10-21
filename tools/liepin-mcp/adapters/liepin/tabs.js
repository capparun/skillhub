import {defineAdapter} from 'opencli-mcp/adapter-sdk';
import {withAdapterDeadline} from '../../lib/site-adapter-deadline.mjs';
import {adapterTabs} from '../../lib/site-adapter-binding.mjs';
export default defineAdapter({description:'列出支持的已有猎聘标签元数据，不读取正文或新建页面；需兼容运行时',domain:'h.liepin.com',access:'read',args:[],result:{kind:'rows',description:'标签ID、URL、页面类型'},run:withAdapterDeadline(adapterTabs)});
