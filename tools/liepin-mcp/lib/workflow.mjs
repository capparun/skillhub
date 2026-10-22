import {readMcpDetail} from './detail-driver.mjs';
import {runRound} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/workflow.js';
import {executeMcpOperation} from './execution.mjs';
import {detailTargets} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/detail-targets.js';
import {run} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/engine.js';
import {plan} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/filters.js';
import {inspect} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/dom.js';
import {identifyListRow} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/list-identity.js';
import {createTask,readTask,updateTask,mergeListResults} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/task-store.js';
import {exportTask} from '../../../distribution/liepin-search/runtime/packages/liepin/lib/report.js';
import {createMcpSearchDriver} from './transport.mjs';
export {createTask,exportTask};
/** Browser operations share the original account ledger; no parallel alpha journal. */
export async function operation(file,id,payload,execute,{signal}={}){
 const {kind,...business}=payload;
 const mapped={search:'search',results:'inspect',nextpage:'page',detail:'detail-open'}[kind];
 if(!mapped)throw Error('不支持的 MCP 操作类型');
 const requestPayload=kind==='detail'?{
  observationId:business.observationId,
  observationHash:business.observationHash,
  page:business.tab_id,
 }:business;
 if(kind==='detail'&&(!requestPayload.observationId||!requestPayload.observationHash))throw Error('详情操作需要持久化观察身份');
 return executeMcpOperation(file,{operationId:id,kind:mapped,payload:requestPayload},async({check})=>{
  const result=await execute();check();
  return {status:'completed',evidence:result};
 },{signal});
}
export function logger(file,context={}){return event=>{updateTask(file,t=>({...t,events:[...t.events,{...context,...event,at:event.at??new Date().toISOString(),transport:'opencli-mcp'}]}));};}
export function saveSearchPage(file,page,roundId,tabId){
 const rows=page.rows.map(row=>({...row,source:'liepin'}));
 updateTask(file,t=>{
  const next=mergeListResults(t,rows,{roundId});
  if(tabId!==undefined){
   if(!Array.isArray(page.currentRows))throw Error('缺少当前页快照，不能绑定详情入口');
   next.mcpSearch={tabId,operationId:roundId,currentPage:page.currentPage,rows:page.currentRows.map(row=>({...row,source:'liepin'}))};
  }
  return next;
 });
 return rows;
}
export async function search(client,{file,round_id,tab_id},{signal,runSearch=run}={}){
 const task=readTask(file);
 if(task.mcpOperations?.length)throw Error('旧 MCP 原型记录需独立核对迁移，不能直接续跑或重置');
 const round=task.rounds?.find(r=>r.id===round_id);
 if(!round)throw Error('需要任务内已确认的搜索轮次');
 plan(round.filters);
 if(signal?.aborted)throw Error('操作已取消');
 const saved=await runRound(file,round_id,async filters=>{
  if(signal?.aborted)throw Error('操作已取消');
  await client.verify();const tab=client.tab(tab_id);const expectedUrl=await tab.url();
  const driver=createMcpSearchDriver(tab,{expectedUrl,signal,onAction:logger(file)});
  const result=await runSearch(driver,filters,{capture:false,onPage:async page=>saveSearchPage(file,page,round_id,tab.id)});
  if(signal?.aborted)throw Error('操作已取消，结果须核对');
  const rows=result.rows.map(row=>({...row,source:'liepin'}));
  return {...result,rows,evidence:{applied:result.applied,total:result.total,tabId:tab.id,pages:result.pages,warning:result.warning,interruption:result.interruption}};
 });
 const completed=saved.rounds.find(r=>r.id===round_id);
 const evidence=saved.operations.find(op=>op.operationId===completed.operationId)?.evidence;
 return {roundId:round_id,status:completed.status,count:completed.resultCount,pages:evidence?.pages,warning:evidence?.warning};
}
export async function results(client,{file,operation_id,tab_id,limit=3},{signal}={}){
 if(!Number.isInteger(limit)||limit<1||limit>30)throw Error('limit范围1–30');
 return operation(file,operation_id,{kind:'results',tab_id,limit},async()=>{
  await client.verify();const tab=client.tab(tab_id);const driver=createMcpSearchDriver(tab,{expectedUrl:await tab.url(),signal,onAction:logger(file)});
  const result=await driver.evaluate(inspect,{mode:'results',limit});if(result.loading||result.blank)throw Error('列表尚未就绪');
  const rows=result.rows.map(r=>({...identifyListRow(r),source:'liepin'}));
  updateTask(file,t=>({...mergeListResults(t,rows,{roundId:operation_id}),mcpSearch:{tabId:tab.id,operationId:operation_id,rows}}));
  return {count:rows.length,tabId:tab.id};
 },{signal});
}
// Advance the same result list by one page. No query is submitted again: this
// clicks the observed next-page control, re-reads, and only saves the rows after
// the page really moved.
export async function nextPage(client,{file,operation_id,tab_id},{signal,openDriver}={}){
 return operation(file,operation_id,{kind:'nextpage',tab_id},async()=>{
  await client.verify();
  const tab=client.tab(tab_id);
  const driver=openDriver?await openDriver(tab):createMcpSearchDriver(tab,{expectedUrl:await tab.url(),signal,onAction:logger(file)});
  const before=await driver.evaluate(inspect,{mode:'results',limit:30});
  if(before?.blocked||before?.login||before?.blank)throw Error('结果页未就绪，停止翻页');
  const next=before?.pagination?.next;
  if(typeof next!=='string')throw Error('当前页没有下一页控件');
  const beforePage=before?.pagination?.current??null;
  const first=before?.rows?.[0];
  const firstKey=first?`${first.name}|${first.experience}`:null;
  await driver.click(next);
  let after=null,advanced=false;
  for(let i=0;i<15;i++){
   await new Promise(r=>setTimeout(r,400));
   after=await driver.evaluate(inspect,{mode:'results',limit:30});
   const pageMoved=after?.pagination?.current&&beforePage?after.pagination.current!==beforePage:false;
   const rowMoved=firstKey!==null&&after?.rows?.[0]?`${after.rows[0].name}|${after.rows[0].experience}`!==firstKey:false;
   if(pageMoved||rowMoved){advanced=true;break;}
  }
  if(!advanced)throw Error('翻页后页码与首行均未变化；已保留原页数据，不重试');
  const rows=(after.rows??[]).map(row=>({...identifyListRow(row),source:'liepin',page:after?.pagination?.current??null}));
  updateTask(file,task=>{
   const merged=mergeListResults(task,rows,{roundId:`page-${operation_id}`});
   merged.mcpSearch={tabId:tab.id,operationId:operation_id,currentPage:after?.pagination?.current??null,rows};
   return merged;
  });
  return {page:after?.pagination?.current??null,count:rows.length};
 });
}
export async function detail(client,{file,operation_id,index},{signal}={}){
 const task=readTask(file);const state=task.mcpSearch;const row=state?.rows?.[index];
 if(!Number.isInteger(index)||index<0||!row?.detailTarget)throw Error('需要已保存列表行索引');
 const targets=detailTargets(task).filter(t=>t.roundId===state.operationId&&JSON.stringify(t.data)===JSON.stringify(row));
 if(targets.length!==1)throw Error('未找到唯一已保存列表观察，不能打开详情');
 return readMcpDetail(client,{file,operation_id,tab_id:state.tabId,observation_id:targets[0].id},{signal,onAction:logger(file)});
}
