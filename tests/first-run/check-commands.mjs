// Run against an explicitly supplied product runtime; never use global OpenCLI.
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
const runtime=process.argv[2], output=process.argv[3];
if(!runtime||!output)throw Error('Usage: node check-commands.mjs <runtime-directory> <report.json>');
const entry=path.resolve(runtime,'opencli.mjs');
const commands=[['--version'],['hunter-linkedin','--help'],['hunter-linkedin','capabilities','-f','json'],['hunter-linkedin','task-execute','--help'],['hunter-linkedin','account-inspect','--help'],['hunter-linkedin','route-options','--help'],['linkedin','whoami','--help'],['doctor','--help'],['profile','--help'],['daemon','status','--help']];
const checks=commands.map(args=>({entry,args}));
checks.push({entry:path.resolve(runtime,'..','doctor.mjs'),args:['--help']});
const results=checks.map(({entry:commandEntry,args})=>{const start=Date.now();const r=spawnSync(process.execPath,[commandEntry,...args],{encoding:'utf8',timeout:15000,maxBuffer:1024*1024});let valid=r.status===0;if(args.includes('capabilities')){try{const body=JSON.parse(r.stdout);valid=valid&&body.ok===true&&body.data!=null;}catch{valid=false;}}return {command:['node',commandEntry===entry?'<runtime>/opencli.mjs':'<package>/doctor.mjs',...args].join(' '),verification:args.includes('--help')?'command_registration_only':'offline_execution',passed:valid,exitCode:r.status,elapsedMs:Date.now()-start,stdout:r.stdout,stderr:r.stderr,error:r.error?.code};});
fs.writeFileSync(output,JSON.stringify({runtime:entry,results,liveChecksPending:['doctor --linkedin-runtime','profile list','linkedin whoami with selected profile','account-inspect with bound identity','first business task and cursor continuation'],notes:'Help checks do not prove browser, identity or business operation success.'},null,2));
console.log(JSON.stringify(results.map(({command,passed,elapsedMs})=>({command,passed,elapsedMs})),null,2));
process.exitCode=results.some(r=>!r.passed)?1:0;
