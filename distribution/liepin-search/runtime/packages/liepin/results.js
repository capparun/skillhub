import {cli} from './lib/register.js';
import {inspect} from './lib/dom.js';
import {identifyListRow} from './lib/list-identity.js';
import {openCurrentSearchDriver} from './lib/search-driver.js';
import {executeScopedOperation} from './lib/site-scope.js';
import {updateTask,mergeListResults} from './lib/task-store.js';
export async function readCurrentResults(args,{openDriver=openCurrentSearchDriver}={}) {
 const limit=Number(args.limit ?? 10);
 if(!Number.isInteger(limit) || limit<1 || limit>30 || !/^[a-fA-F0-9]{16,128}$/.test(args.page ?? ''))throw new Error('需要已绑定 page，limit 必须为1–30');
 const request={operationId:args.operationId,kind:'inspect',payload:{page:args.page,limit}};
 const evidence=await executeScopedOperation(args.file,request,async()=>{
  const driver=await openDriver(args.page);
  try {
   const result=await driver.evaluate(inspect,{mode:'results',limit});
   if(result.blank || result.loading || result.login || result.risk || result.blocked || !Array.isArray(result.rows) || (!result.count && !result.empty))return {status:'blocked',evidence:{reason:'results_not_ready'}};
   return {status:'completed',evidence:{rows:result.rows.slice(0,limit).map(row=>({...identifyListRow(row),source:'liepin'})),total:result.total}};
  }finally{await driver.close();}
 });
 if(!evidence.rows)throw new Error('当前结果页未确认；任务已保存并暂停');
 updateTask(args.file,task=>mergeListResults(task,evidence.rows,{roundId:`results-${args.operationId}`}));
 return evidence;
}
cli({site:'liepin',access:'read',name:'results',browser:false,
 description:'读取并保存已绑定的当前结果页，不提交搜索、不翻页',
 args:[{name:'file',help:'本地任务 JSON 文件',type:'string',required:true},{name:'page',help:'connect 返回的当前页面 targetId',type:'string',required:true},{name:'operationId',help:'持久操作标识',type:'string',required:true},{name:'limit',help:'本次读取条数，1–30',type:'int',default:10}],
 columns:['total','rows'],func:async args=>[await readCurrentResults(args)]});
