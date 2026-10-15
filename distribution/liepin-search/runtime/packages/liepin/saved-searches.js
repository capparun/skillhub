import {cli} from './lib/register.js';
import {savedSearchTask,savedTaskArgs} from './lib/saved-search-task.js';
cli({site:'liepin',name:'saved-searches',access:'read',browser:false,
 description:'已绑定页面的搜索方案读取，保留任务记录',
 args:[...savedTaskArgs],columns:['name','schemes','saved','deleted','total','rows'],func:async args=>[await savedSearchTask('list',args)]});
