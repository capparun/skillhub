import {cli} from './lib/register.js';
import {runRound} from './lib/workflow.js';
import {openCurrentSearchDriver} from './lib/search-driver.js';
import {run,SearchError} from './lib/engine.js';
import {updateTask,mergeListResults} from './lib/task-store.js';

export async function executeBoundSearch(args,filters,{openDriver=openCurrentSearchDriver,pause,collectionRoundId=args.roundId,recovery=false}={}) {
  let driver;
  try {driver=await openDriver(args.page);}
  catch(error) {
   // The factory only lists the bound tab and reads its address. No search
   // action exists yet; retain the failed attempt without claiming a click
   // outcome is unknown. The persistent scope still pauses; no automatic retry.
   return {status:'failed',rows:[],evidence:{reason:'search_preflight_failed',
    businessActionStarted:false,targetId:args.page,message:String(error?.message ?? error)}};
  }
  let phase='preflight_complete';
  let confirmedRows=[];
  let result;
  try {result=await run(driver,filters,{capture:false,requireFresh:true,...(pause?{pause}:{}),
   onProgress:async nextPhase=>{
    await updateTask(args.file,task=>{
     const round=task.rounds.find(item=>item.id===args.roundId);
     round[recovery?'restorationExecution':'execution']={phase:nextPhase,at:new Date().toISOString()};
     return task;
    });
    phase=nextPhase;
   },
   onPage:checkpoint=>updateTask(args.file,task=>{
    const next=mergeListResults(task,checkpoint.rows.map(row=>({...row,source:'liepin'})),{roundId:collectionRoundId});
    const round=next.rounds.find(item=>item.id===args.roundId);
    round[recovery?'restorationCheckpoint':'checkpoint']={pages:checkpoint.pages,resultCount:checkpoint.rows.length,total:checkpoint.total,savedAt:new Date().toISOString()};
    confirmedRows=checkpoint.rows.map(row=>({...row,source:'liepin'}));
    return next;
   }),
  });} catch(error) {
   return {status:'unknown',rows:confirmedRows,evidence:{
    reason:'search_execution_interrupted',phase,code:error?.code ?? null,
    message:String(error?.message ?? error),targetId:args.page,
    submissionAttempted:['submitting','submission_acknowledged','results_confirmed'].includes(phase),
   }};
  } finally {
   await driver.close?.();
  }
  return {status:result.status,rows:result.rows.map(row=>({...row,source:'liepin'})),evidence:{
   applied:result.applied,total:result.total,pages:result.pages,warning:result.warning ?? null,
   interruption:result.interruption,
   targetId:args.page,identityPolicy:'unidentified-cards-preserved-without-name-merging',
  }};
}
export async function runSearchCommand(args,options={}) {
 if(typeof args.page!=='string' || !/^[A-Fa-f0-9]{16,128}$/.test(args.page))throw new Error('必须提供已观察到的 targetId');
 if(!args.file || !args.roundId)throw new Error('需要明确的本地任务和已授权轮次');
 return runRound(args.file,args.roundId,filters=>executeBoundSearch(args,filters,options));
}
export async function searchCli(args,options) {
 const task=await runSearchCommand(args,options);
 const operation=task.operations.find(item=>item.operationId===`round-${args.roundId}`);
 if(operation?.status!=='completed')throw new SearchError('SEARCH_STOPPED',
  `搜索未完成，结果已保存且任务暂停；不要自动重试。${operation?.evidence?.message ?? operation?.evidence?.reason ?? '请核对任务记录'}`);
 return [task];
}
cli({site: 'liepin',name: 'search',access:'write',browser:false,
 description:'执行已授权的寻访轮次：绑定现有搜索页、单次提交、持久保存；未知结果不重试',
 args:[
  {name:'file',type:'string',required:true,help:'本地寻访任务 JSON 路径'},
  {name:'roundId',type:'string',required:true,help:'已明确批准的搜索轮次 ID'},
  {name:'page',type:'string',required:true,help:'已观察到的猎聘搜索标签 targetId'},
 ],columns:['id','status','rounds','candidates','unlinkedObservations'],
 func:async args=>searchCli(args),
});
