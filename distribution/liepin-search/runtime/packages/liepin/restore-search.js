import {restorationRequest,isEmptyRecoveryScene} from './lib/search-restoration.js';
export {restorationRequest,isEmptyRecoveryScene} from './lib/search-restoration.js';
import {cli} from './lib/register.js';
import {readTask,updateTask,mergeListResults} from './lib/task-store.js';
import {executeScopedOperation} from './lib/site-scope.js';
import {inspect} from './lib/dom.js';
import {openCurrentSearchDriver} from './lib/search-driver.js';
import {executeBoundSearch} from './search.js';

export async function restoreSearch(args,{openDriver=openCurrentSearchDriver,executeSearch=executeBoundSearch,pause}={}) {
 if(!args.file || !args.roundId || !args.reason?.trim())throw new Error('恢复需要原任务、轮次及实际页面丢失原因');
 const task=readTask(args.file),request=restorationRequest(task,args.roundId,args.page,args.operationId),prior=task.operations.find(o=>o.operationId===request.payload.recoveryOf);
 const collectionRoundId=`${args.roundId}-restore-${args.operationId}`;
 const evidence=await executeScopedOperation(args.file,{operationId:args.operationId,...request},async()=>{
  let driver;
  try {driver=await openDriver(args.page);}catch{return {status:'failed',evidence:{reason:'restoration_binding_unavailable',businessActionStarted:false}};}
  let closed=false;const originalClose=driver.close?.bind(driver);driver={...driver,close:async()=>{if(!closed){closed=true;await originalClose?.();}}};
  try {
   let scene;
   for(let attempt=0;attempt<20;attempt++) {
    scene={controls:await driver.evaluate(inspect,{mode:'controls'}),selected:await driver.evaluate(inspect,{mode:'selection-summary'}),results:await driver.evaluate(inspect,{mode:'results',limit:1})};
    const states=[scene.controls,scene.selected,scene.results];
    if(states.some(s=>s.login || s.risk || s.blocked) || states.every(s=>s.readyState==='complete' && !s.blank && !s.loading))break;
    if(attempt<19)await (pause??(ms=>new Promise(r=>setTimeout(r,ms))))(200);
   }
   if(!isEmptyRecoveryScene(scene,prior.finishedAt))return {status:'failed',evidence:{reason:'restoration_scene_not_empty_or_ready',businessActionStarted:false,
    sceneFacts:{priorFinishedAt:prior.finishedAt,states:[scene.controls,scene.selected,scene.results].map(s=>({url:s.url,readyState:s.readyState,timeOrigin:s.timeOrigin,blank:s.blank,loading:s.loading,login:s.login,risk:s.risk,count:s.count})),drafts:scene.controls.nonemptyInputs?.length,selected:scene.selected.selected?.length}}};
   updateTask(args.file,t=>{const round=t.rounds.find(r=>r.id===args.roundId);round.restorations??=[];
    if(!round.restorations.some(r=>r.operationId===args.operationId))round.restorations.push({status:'started',operationId:args.operationId,collectionRoundId,recoveryOf:request.payload.recoveryOf,page:args.page,at:new Date().toISOString()});return t;});
   const result=await executeSearch(args,structuredClone(request.payload.filters),{openDriver:async()=>driver,pause,collectionRoundId,recovery:true});
   return {status:result.status,evidence:{...result.evidence,rows:result.rows,roundId:args.roundId,collectionRoundId,
    recoveryOf:request.payload.recoveryOf,recoveryReason:args.reason,sceneTimeOrigin:scene.controls.timeOrigin}};
  }finally{await driver.close?.();}
 });
 const current=readTask(args.file),operation=current.operations.find(o=>o.operationId===args.operationId);
 if(operation.status!=='completed')return {status:operation.status,...evidence};
 if(!Array.isArray(evidence.rows)||evidence.roundId!==args.roundId)throw new Error('恢复证据不属于原轮次');
 updateTask(args.file,t=>{
  const next=mergeListResults(t,evidence.rows,{roundId:collectionRoundId}),round=next.rounds.find(r=>r.id===args.roundId);
  round.restorations??=[];
  const restoration=round.restorations.find(r=>r.operationId===args.operationId);
  if(restoration.status!=='completed') {
   restoration.status='completed';restoration.completedAt=new Date().toISOString();
   next.events.push({type:'search_restored',roundId:args.roundId,operationId:args.operationId,collectionRoundId,at:new Date().toISOString()});
  }
  return next;
 });
 return {status:'completed',...evidence};
}
cli({site:'liepin',name:'restore-search',access:'write',browser:false,
 description:'在没有可复用结果或草稿的搜索页恢复原已完成轮次的相同条件；保留原记录，不新建重复轮次',
 args:[{name:'file',type:'string',required:true,help:'原寻访任务 JSON'},
  {name:'roundId',type:'string',required:true,help:'原已完成的搜索轮次'},
  {name:'page',type:'string',required:true,help:'当前实际搜索目标'},
  {name:'operationId',type:'string',required:true,help:'本次恢复的持久操作ID'},
  {name:'reason',type:'string',required:true,help:'实际页面丢失或重建原因'}],
 columns:['status','roundId','collectionRoundId'],func:async args=>{const result=await restoreSearch(args);if(result.status!=='completed')throw new Error('搜索恢复未完成：'+result.reason);return [result];}});
