#!/usr/bin/env node
import {inspectProfileLock,recoverProfileLock} from './profile-lock.mjs';
import './distribution-binding.mjs';
import {taskResume,consolidatedReport} from './linkedin/task-closeout.mjs';
import {inspectAccount} from './linkedin/account-inspect.mjs';
import {routeOptions} from './linkedin/route-options.mjs';
import {taskLockInspect,taskLockRecover,taskContinue,taskRecovery,outreachInput,prepareOutreach,companyPeopleTask,resolveOperation,importSourcing,createTask,taskExecute,taskStatus,taskAssess,taskReport} from './linkedin/task-store.mjs';
import {readFile} from 'node:fs/promises';
import {compile,execute,operations,validateTask} from './linkedin/gateway.mjs';
try {
 const [command,path,...extra]=process.argv.slice(2);
 if(extra.length)throw new Error('invalid_arguments');
 let data;
 if(command==='capabilities'&&!path)data={schema_version:1,operations,mode:'development',business_decisions:'model_owned',ordinary_runtime:'HUNTER_OPENCLI_ENTRY',runtime_status:'not_checked'};
 else {
  const input=JSON.parse(await readFile(path,'utf8'));const options={linkedinEntry:process.env.HUNTER_OPENCLI_ENTRY};
  if(command==='profile-lock-inspect')data=await inspectProfileLock(input.profile);
  else if(command==='profile-lock-recover')data=await recoverProfileLock(input);
  else if(command==='task-lock-inspect')data=await taskLockInspect(input);
  else if(command==='task-lock-recover')data=await taskLockRecover(input);
  else if(command==='task-continue')data=await taskContinue(input,options);
  else if(command==='task-resume')data=await taskResume(input,options);
  else if(command==='task-consolidate')data=await consolidatedReport(input);
  else if(command==='task-recovery')data=await taskRecovery(input);
  else if(command==='account-inspect')data=await inspectAccount(input,options);
  else if(command==='route-options')data=routeOptions(input,options);
  else if(command==='task-outreach-input')data=await outreachInput(input);
  else if(command==='task-prepare-outreach')data=await prepareOutreach(input);
  else if(command==='task-company-people')data=await companyPeopleTask(input);
  else if(command==='task-resolve')data=await resolveOperation(input);
  else if(command==='task-import-sourcing')data=await importSourcing(input);
  else if(command==='task-create')data=await createTask(input);
  else if(command==='task-execute')data=await taskExecute(input,options);
  else if(command==='task-status')data=await taskStatus(input);
  else if(command==='task-assess')data=await taskAssess(input);
  else if(command==='task-report')data=await taskReport(input);
  else if(command==='task-validate')data=validateTask(input);
  else if(command==='plan')data={...compile(input,options),status:'planned',dispatched:false};
  else if(command==='execute')data=await execute(input,options);
  else throw new Error('unsupported_command');
 }
 console.log(JSON.stringify({ok:true,data}));
}catch(e){console.log(JSON.stringify({ok:false,error:{code:e.code??'invalid_input',...(e.stage?{stage:e.stage}:{})}}));process.exitCode=2;}
