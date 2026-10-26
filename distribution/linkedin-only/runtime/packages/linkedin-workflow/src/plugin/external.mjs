import {readFile,realpath,access} from 'node:fs/promises';
import {join,dirname,isAbsolute} from 'node:path';
import {homedir} from 'node:os';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const exec=promisify(execFile);
export const externalCommands=JSON.parse(await readFile(new URL('./external-commands.json',import.meta.url),'utf8'));
const fail=(code,message)=>Object.assign(new Error(message),{code});
export async function externalPlan(name,args,environment=process.env){
 const c=externalCommands.find(x=>x.name===name);if(!c)throw fail('unsupported_command','Unknown command');
 if(!args.input||c.output_dir&&!args['output-dir'])throw fail('invalid_input','--input and the documented --output-dir are required');
 let data;try{data=JSON.parse(await readFile(args.input,'utf8'));}catch{throw fail('invalid_input','Input file must contain valid JSON');}
 if(!data||typeof data!=='object'||Array.isArray(data))throw fail('invalid_input','Input must be an object');
 // Never replace the upstream approval gates or infer approval from plugin access.
 if(name==='execute-approved-outreach'&&data.execute!==true)throw fail('execution_not_approved','Input execute:true and upstream content/recipient approval are required');
 let root=environment.HUNTER_SKILLS_ROOT;
 if(!root){try{const plugin=await realpath(join(homedir(),'.opencli/plugins/hunter-linkedin'));root=join(dirname(dirname(plugin)),'skills');}catch{throw fail('dependency_missing','Set HUNTER_SKILLS_ROOT to the installed Hunter skills directory');}}
 if(!isAbsolute(root))throw fail('dependency_missing','HUNTER_SKILLS_ROOT must be absolute');
 const script=join(root,c.skill,'scripts',name+'.mjs');try{await access(script);}catch{throw fail('dependency_missing','Required Hunter script is missing; install the matching Hunter skill');}
 let argv;
 if(name==='discover-linkedin-xray'){
  const fields=['keyword','plan','title','location','company','exclude','limit','output','normalized-output','opencli-bin','channel','skip-google','no-human-assist'];
  if(Object.keys(data).some(k=>!fields.includes(k))||!data.keyword&&!data.plan)throw fail('invalid_input','Provide keyword or plan and only documented X-ray options');
  argv=[];for(const [k,v] of Object.entries(data)){if(['skip-google','no-human-assist'].includes(k)){if(typeof v!=='boolean')throw fail('invalid_input','Boolean option expected');if(v)argv.push('--'+k);}else{if(!['string','number'].includes(typeof v))throw fail('invalid_input','Scalar option expected');argv.push('--'+k,String(v));}}
 }else if(name==='enrich-linkedin-profiles'){
  const fields=['input_path','output','include','limit','min-score','delay-ms','command-timeout-ms','opencli-bin','all'];
  if(!data.input_path||Object.keys(data).some(k=>!fields.includes(k)))throw fail('invalid_input','Provide input_path and only documented enrichment options');
  argv=[data.input_path];for(const [k,v] of Object.entries(data)){if(k==='input_path')continue;if(k==='all'){if(typeof v!=='boolean')throw fail('invalid_input','all must be boolean');if(v)argv.push('--all');}else{if(!['string','number'].includes(typeof v))throw fail('invalid_input','Scalar option expected');argv.push('--'+k,String(v));}}
 }else argv=[args.input,'--output-dir',args['output-dir']];
 return {script,argv};
}
export async function runExternal(name,args,options={}){
 const plan=await externalPlan(name,args,options.environment);let result;
 try{result=await (options.exec??exec)(process.execPath,[plan.script,...plan.argv],{maxBuffer:32*1024*1024});}
 catch{throw fail('external_execution_failed','Hunter script failed; inspect its output directory before retrying. No automatic retry performed.');}
 let data;try{data=JSON.parse(result.stdout);}catch{throw fail('invalid_response','Hunter script returned an invalid receipt');}
 if(!data||typeof data!=='object'||data.success===false||data.ok===false)throw fail('external_execution_failed','Hunter script did not confirm success');
 return data;
}
