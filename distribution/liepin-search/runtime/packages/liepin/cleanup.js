import {cli} from './lib/register.js';
import {cleanupManagedDetails} from './lib/official-cleanup.js';
cli({site:'liepin',name:'cleanup',access:'write',browser:false,
 description:'关闭本任务已持久保存且来源可核对的独立模式详情；保留搜索页、其他页面及未知目标',
 args:[{name:'file',type:'string',required:true,help:'原任务文件'},
 {name:'page',type:'string',required:true,help:'原独立搜索 targetId'}],
 columns:['complete','results'],func:async args=>[await cleanupManagedDetails(args)]});
