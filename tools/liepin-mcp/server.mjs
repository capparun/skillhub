#!/usr/bin/env node
import {runLocalTask,taskModes} from '../../distribution/liepin-search/runtime/packages/liepin/lib/task-service.js';
import {filters} from '../../distribution/liepin-search/runtime/packages/liepin/lib/filters.js';
import {createInterface} from 'node:readline';
import {validate} from './lib/validate.mjs';
import {BrowserClient} from './lib/client.mjs';
import {prepare,savedSearch,favorite,favorites} from './lib/business.mjs';
import {detailBatch,readMcpDetail,currentDetail} from './lib/detail-driver.mjs';
import {logger} from './lib/workflow.mjs';
import {existingTabs,bindExisting} from './lib/connection.mjs';
import {diagnose} from './lib/diagnostics.mjs';
import {createTask,exportTask,search,results,detail} from './lib/workflow.mjs';
const str={type:'string',minLength:1};
const filterSchema={type:'object',properties:Object.fromEntries(Object.entries(filters).map(([key,[,kind]])=>[key,{type:kind==='check'?'boolean':'string'}])),additionalProperties:false};
const bound={file:str,operation_id:str,tab_id:str};
const definitions=[
 ['liepin_doctor','只读检查本机Node和MCP命令来源，不启动浏览器',{},[]],
 ['liepin_tabs','读取猎聘标签元数据清单，不读取页面正文',{},[]],
 ['liepin_bind','绑定清单中的已有猎聘标签，不新建页面或关闭用户标签',{file:str,tab_id:str,expected_url:str},['file','tab_id','expected_url']],
 ['liepin_current_detail','读取已打开且身份匹配的详情；可选展开经历，不关闭用户标签',{...bound,resume_id:str,expand:{type:'boolean'}},[...Object.keys(bound),'resume_id']],
 ['liepin_detail_observation','按已保存观察身份读取详情并保存关联，不按姓名猜测',{...bound,observation_id:str},[...Object.keys(bound),'observation_id']],
 ['liepin_detail_batch','创建或继续持久详情队列；创建不访问浏览器、不自动授权',{file:str,id:str,tab_id:str,observation_ids:{type:'array',items:str,minItems:1,maxItems:30},interval_ms:{type:'integer',minimum:1000,maximum:60000}},['file','id']],
 ['liepin_prepare','设置并回读筛选，不点击搜索；站点可能自动查询',{...bound,filters:filterSchema},[...Object.keys(bound),'filters']],
 ['liepin_saved_search','读取、保存、应用或删除搜索方案；写操作必须匹配任务授权',{...bound,action:{type:'string',enum:['list','save','apply','delete']},name:str,current:{type:'boolean'},filters:filterSchema,limit:{type:'integer',minimum:1,maximum:30}},[...Object.keys(bound),'action']],
 ['liepin_favorite','核对指定详情的收藏状态、添加或取消收藏；写操作必须匹配任务授权',{...bound,action:{type:'string',enum:['status','add','remove']},resume_id:str,group:str},[...Object.keys(bound),'action','resume_id']],
 ['liepin_favorites','读取并保存当前收藏列表，不翻页或修改收藏',{...bound,limit:{type:'integer',minimum:1,maximum:30}},Object.keys(bound)],
 ['liepin_task','本地任务：需求、授权记录、复核、评估、名单、导入与恢复；不访问浏览器',{file:str,mode:{type:'string',enum:taskModes},input:{type:['object','array']},source:{type:'string',enum:['liepin','linkedin','maimai']},roundId:str,stage:{type:'string',enum:['list','detail']}},['file','mode']],
 ['liepin_conditions','离线列出支持的筛选字段与类型',{},[]],
 ['liepin_task_init','创建本地任务；不访问浏览器',{file:str,title:str},['file','title']],
 ['liepin_search','按已批准轮次设置筛选、提交一次搜索并读取授权页数；逐页保存',{file:str,round_id:str,tab_id:str},['file','round_id','tab_id']],
 ['liepin_results','保存当前页列表，不重新搜索',{file:str,operation_id:str,tab_id:str,limit:{type:'integer',minimum:1,maximum:30}},['file','operation_id','tab_id']],
 ['liepin_detail','核对已保存卡片，打开并展开允许的经历，保存后关闭详情',{file:str,operation_id:str,index:{type:'integer',minimum:0}},['file','operation_id','index']],
 ['liepin_report','从本地已保存任务导出报告，不访问浏览器',{file:str,output:str,format:{type:'string',enum:['html','json','markdown','csv']}},['file','output','format']],
 ['liepin_connect','核验兼容扩展并创建独立搜索页',{},[]],
 ['liepin_close','关闭本次MCP会话拥有的指定测试页',{tab_id:str},['tab_id']],
].map(([name,description,properties,required])=>({name,description,inputSchema:{type:'object',properties,required,additionalProperties:false}}));
let client;
async function browser(){
 if(!client){
  const candidate=new BrowserClient(process.env.HUNTER_MCP_COMMAND);
  try{await candidate.start();client=candidate;}catch(error){candidate.close();throw error;}
 }
 return client;
}
export async function dispatch(name,args,{signal}={}){
 if(signal?.aborted)throw Error('请求已取消');
 const def=definitions.find(d=>d.name===name);if(!def)throw Error('未知工具');
 validate(args,def.inputSchema);
 if(name==='liepin_doctor')return diagnose();
 if(name==='liepin_task')return runLocalTask(args);
 if(name==='liepin_conditions')return Object.entries(filters).map(([key,[label,type]])=>({key,label,type}));
 if(name==='liepin_task_init'){const task=createTask(args.file,{title:args.title});return {id:task.id,file:args.file};}
 if(name==='liepin_report')return exportTask(args.file,args);
 if(name==='liepin_connect'){const c=await browser();await c.verify();return {tabId:(await c.newSearch()).id};}
 if(name==='liepin_close'){if(!client)throw Error('本会话尚未创建标签，无需连接浏览器');await client.tab(args.tab_id).close();return {closed:true};}
 const c={claimOpenedTab:id=>client.claimOpenedTab(id),verify:async()=>{return (await browser()).verify();},existingTabs:()=>client.existingTabs(),claimExisting:(...args)=>client.claimExisting(...args),tab:id=>{if(!client)throw Error('连接尚未核验');return client.tab(id);}};
 if(name==='liepin_tabs')return existingTabs(c);
 if(name==='liepin_bind')return bindExisting(c,args);
 if(name==='liepin_detail_batch')return detailBatch(c,args,{signal,onAction:logger(args.file)});
 if(name==='liepin_detail_observation')return readMcpDetail(c,args,{signal,onAction:logger(args.file)});
 if(name==='liepin_current_detail')return currentDetail(c,args,{signal,onAction:logger(args.file)});
 return ({liepin_search:search,liepin_results:results,liepin_detail:detail,liepin_prepare:prepare,liepin_saved_search:savedSearch,liepin_favorite:favorite,liepin_favorites:favorites})[name](c,args,{signal});
}
// Serialize calls: one browser operation at a time. Do not parallelize real-account mutations.
let chain=Promise.resolve();
const controllers=new Map();
const output=r=>process.stdout.write(JSON.stringify(r)+'\n');
createInterface({input:process.stdin}).on('line',line=>{
 let req;try{req=JSON.parse(line);}catch{return output({jsonrpc:'2.0',id:null,error:{code:-32700,message:'Invalid JSON'}});}
 if(!req||typeof req!=='object'||Array.isArray(req)||typeof req.method!=='string'){output({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid Request'}});return;}
 if(req.id!==undefined&&(typeof req.id!=='string'&&!Number.isSafeInteger(req.id))){output({jsonrpc:'2.0',id:null,error:{code:-32600,message:'Invalid request ID'}});return;}
 if(req.method==='notifications/cancelled'){controllers.get(req.params?.requestId)?.abort();return;}
 if(req.id===undefined)return;
 if(controllers.has(req.id)){output({jsonrpc:'2.0',id:req.id,error:{code:-32600,message:'Duplicate active request ID'}});return;}
 const controller=new AbortController();controllers.set(req.id,controller);
 chain=chain.then(async()=>{
 try{let result;
  if(req.method==='initialize')result={protocolVersion:'2024-11-05',capabilities:{tools:{}},serverInfo:{name:'hunter-liepin-mcp',version:'0.3.0-alpha.1'}};
  else if(req.method==='ping')result={};
  else if(req.method==='tools/list')result={tools:definitions};
  else if(req.method==='tools/call'){try{const value=await dispatch(req.params.name,req.params.arguments??{},{signal:controller.signal});result={content:[{type:'text',text:JSON.stringify(value)}]};}catch(e){result={isError:true,content:[{type:'text',text:JSON.stringify({code:e.code??'LIEPIN_ERROR',message:e.message})}]};}}
  else throw Error('Unsupported method');
  output({jsonrpc:'2.0',id:req.id,result});
 }catch(e){output({jsonrpc:'2.0',id:req.id,error:{code:-32601,message:e.message}});}finally{controllers.delete(req.id);}
});}).on('close',()=>{chain.finally(()=>client?.close());});
process.on('SIGTERM',()=>{client?.close();process.exit(0);});
