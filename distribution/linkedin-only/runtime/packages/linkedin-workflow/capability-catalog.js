import {cli,getRegistry,Strategy} from '@jackwener/opencli/registry';
import {readFileSync} from 'node:fs';
const definitions=JSON.parse(readFileSync(new URL('./src/plugin/commands.json',import.meta.url),'utf8'));
const historical=JSON.parse(readFileSync(new URL('./docs/reference/linkedin-cli-catalog.json',import.meta.url),'utf8'));
const contracts=JSON.parse(readFileSync(new URL('./src/linkedin/operation-contracts.json',import.meta.url),'utf8'));
const salesnavContracts=JSON.parse(readFileSync(new URL('./src/salesnav-contracts.json',import.meta.url),'utf8')).contracts;
const directContracts=JSON.parse(readFileSync(new URL('./src/direct-command-contracts.json',import.meta.url),'utf8')).contracts;
// Commands that never touch LinkedIn itself. Keeping them out of platform_adapter
// makes the catalog answer "what can this do to the account" without reading contracts.
const LOCAL_SUPPORT=new Set(['capabilities','account-inspect','plan','execute','route-options','capability-catalog','normalize','evaluate','report','outreach-plan','outreach-ledger','collect-outreach-context','create-email-draft','summarize-outreach-batch']);
function layerOf(c,{platformContract,definition}){
 if(platformContract)return 'platform_operation';
 if(LOCAL_SUPPORT.has(c.name))return 'local_support';
 if(c.name.startsWith('profile-lock-'))return 'execution_support';
 if(c.name.startsWith('task-'))return 'task_support';
 // Only the hunter-linkedin salesnav-* entries are local gateway wrappers; the
 // builtin linkedin salesnav-* commands really talk to the platform.
 if(c.site==='hunter-linkedin'&&c.name.startsWith('salesnav-'))return 'gateway_or_support';
 if(definition)return 'gateway_or_support';
 return 'platform_adapter';
}
export function capabilityCatalog(registry=getRegistry(),command){
 const entries=[...registry.values()].filter(c=>['linkedin','hunter-linkedin'].includes(c.site)).map(c=>{
  const name=`${c.site} ${c.name}`,definition=c.site==='hunter-linkedin'?definitions.find(d=>d.name===c.name):null;
  const platformContract=salesnavContracts.find(c=>c.command===name);
  const reference=historical.find(r=>r.command===`opencli ${name}`);
  return {command:name,description:c.description,layer:layerOf(c,{platformContract,definition}),
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
// Compact index: one line per command, small enough to load into context before choosing.
export function capabilitySummary(registry=getRegistry()){
 const commands=capabilityCatalog(registry).entries.map(e=>({command:e.command,description:e.description,layer:e.layer,access:e.access_declared,browser:e.browser_declared}));
 return {schema_version:1,scope:'installed_linkedin_commands',count:commands.length,commands,
  warning:'Existence only. Parameters and contracts need --command; live availability needs a real execution.'};
}
cli({site:'hunter-linkedin',name:'capability-catalog',description:'读取当前安装的 LinkedIn 命令及参数；不访问浏览器',access:'read',browser:false,strategy:Strategy.LOCAL,
 args:[
  {name:'command',type:'string',required:false,help:'可选完整命令名，例如 linkedin profile-read'},
  {name:'summary',type:'boolean',default:false,help:'只返回命令、用途、层级与读写属性的精简清单'},
 ],
 func:args=>args.summary?capabilitySummary(getRegistry()):capabilityCatalog(getRegistry(),args.command)});
