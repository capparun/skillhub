import {openCurrentSearchDriver} from './search-driver.js';
import {run} from './engine.js';
import {updateTask,mergeListResults} from './task-store.js';

export async function executeBoundSearch(args,filters,{openDriver=openCurrentSearchDriver,pause,collectionRoundId=args.roundId,recovery=false,onCheckpoint}={}) {
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
   onPage:async checkpoint=>{updateTask(args.file,task=>{
    const next=mergeListResults(task,checkpoint.rows.map(row=>({...row,source:'liepin'})),{roundId:collectionRoundId});
    const round=next.rounds.find(item=>item.id===args.roundId);
    round[recovery?'restorationCheckpoint':'checkpoint']={pages:checkpoint.pages,resultCount:checkpoint.rows.length,total:checkpoint.total,savedAt:new Date().toISOString()};
    confirmedRows=checkpoint.rows.map(row=>({...row,source:'liepin'}));
    return next;
   });await onCheckpoint?.(checkpoint);},
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
