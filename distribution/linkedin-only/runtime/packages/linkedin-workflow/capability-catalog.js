import {cli,getRegistry,Strategy} from '@jackwener/opencli/registry';
import {readFileSync} from 'node:fs';
const definitions=JSON.parse(readFileSync(new URL('./src/plugin/commands.json',import.meta.url),'utf8'));
const historical=JSON.parse(readFileSync(new URL('./docs/reference/linkedin-cli-catalog.json',import.meta.url),'utf8'));
const contracts=JSON.parse(readFileSync(new URL('./src/linkedin/operation-contracts.json',import.meta.url),'utf8'));
const salesnavContracts=JSON.parse(readFileSync(new URL('./src/salesnav-contracts.json',import.meta.url),'utf8')).contracts;
const directContracts=JSON.parse(readFileSync(new URL('./src/direct-command-contracts.json',import.meta.url),'utf8')).contracts;
export function capabilityCatalog(registry=getRegistry(),command){
 const entries=[...registry.values()].filter(c=>['linkedin','hunter-linkedin'].includes(c.site)).map(c=>{
  const name=`${c.site} ${c.name}`,definition=c.site==='hunter-linkedin'?definitions.find(d=>d.name===c.name):null;
  const platformContract=salesnavContracts.find(c=>c.command===name);
  const reference=historical.find(r=>r.command===`opencli ${name}`);
  return {command:name,description:c.description,layer:platformContract?'platform_operation':c.name.startsWith('profile-lock-')?'execution_support':c.name.startsWith('task-')?'task_support':definition?'gateway_or_support':'platform_adapter',
   access_declared:c.access??'unknown',browser_declared:c.browser??null,
   parameters:c.args.map(({name,type,required,default:defaultValue,description,help,choices,positional})=>({name,type,required:required??false,...(defaultValue===undefined?{}:{default:defaultValue}),description:description??help??'',...(choices?{choices}:{}),positional:positional??false})),
   input_contract:definition?.parameters??null,
   gateway_contracts:contracts.operations.filter(o=>o.cli===name),
   platform_contract:platformContract??null,
   direct_command_contract:directContracts.find(item=>item.command===name)??null,
   output_reference:reference?.output??null,
   output_reference_status:reference?'historical_requires_revalidation':'not_documented',
   verification:{registration:'observed',live_execution:'not_checked'},
   help:`node scripts/opencli.mjs ${name} --help -f json`};
 }).sort((a,b)=>a.command.localeCompare(b.command));
 const selected=command?entries.filter(e=>e.command===command):entries;
 if(command&&!selected.length)throw Object.assign(Error('Unknown installed command'),{code:'unknown_capability'});
 return {schema_version:1,scope:'installed_linkedin_commands',entries:selected,count:selected.length,
  warning:'Registration and parameter discovery do not prove browser availability or business success. Historical output references are not authoritative current schemas.'};
}
cli({site:'hunter-linkedin',name:'capability-catalog',description:'读取当前安装的 LinkedIn 命令及参数；不访问浏览器',access:'read',browser:false,strategy:Strategy.LOCAL,args:[{name:'command',type:'string',required:false,help:'可选完整命令名，例如 linkedin profile-read'}],func:args=>capabilityCatalog(getRegistry(),args.command)});
