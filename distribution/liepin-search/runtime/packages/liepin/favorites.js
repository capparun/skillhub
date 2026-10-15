import {cli} from './lib/register.js';
import {readFavorites} from './lib/favorites-list.js';
cli({site:'liepin',name:'favorites',access:'read',browser:false,
 description:'只读保存当前我的收藏列表，不翻页、不打开简历、不改变收藏',
 args:[{name:'file',type:'string',required:true,help:'本地任务文件'},{name:'page',type:'string',required:true,help:'人才管理收藏页 connect 返回的 targetId'},{name:'operationId',type:'string',required:true,help:'持久操作标识'},{name:'limit',type:'int',default:10,help:'当前页读取条数，1–30'}],
 columns:['total','rows'],func:async args=>[await readFavorites(args)]});
