import {spawn} from 'node:child_process';
import {createInterface} from 'node:readline';
import {resolveUpstream} from './upstream.mjs';
import {verifyCompatManifest} from './compat-build.mjs';
/** One official MCP child per process. Never replay calls after disconnect. */
export class BrowserClient {
 constructor(command,{spawnProcess=spawn,requestTimeoutMs=100000}={}) {
  if(!Number.isSafeInteger(requestTimeoutMs)||requestTimeoutMs<1)throw Error('MCP超时配置无效');
  const runtime=resolveUpstream(command);this.command=runtime.command;this.args=runtime.args;this.spawnProcess=spawnProcess;this.requestTimeoutMs=requestTimeoutMs;
  this.pending=new Map();this.sequence=0;this.ownedTabs=new Set();
 }
 fail(error){
  this.failure??=error;
  for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(this.failure);}this.pending.clear();
 }
 async start(){
  if(this.child||this.failure)throw Error('MCP连接不能重复启动；先核对未确认操作');
  this.child=this.spawnProcess(this.command,this.args,{stdio:['pipe','pipe','pipe']});
  this.child.stderr.on('data',b=>process.stderr.write(b));
  this.child.stdin.on('error',error=>this.fail(error));
  this.child.on('error',error=>this.fail(error));
  this.child.on('exit',()=>this.fail(Error('MCP连接已退出，结果可能未知；不自动重放')));
  createInterface({input:this.child.stdout}).on('line',line=>{
   let r;try{r=JSON.parse(line);}catch{return;}
   const p=this.pending.get(r.id);if(!p)return;
   this.pending.delete(r.id);clearTimeout(p.timer);r.error?p.reject(Error(r.error.message)):p.resolve(r.result);
  });
  await this.rpc('initialize',{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'hunter-liepin-mcp',version:'0.3.0-alpha.1'}},{timeoutMs:Math.min(this.requestTimeoutMs,10000)});
  this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',method:'notifications/initialized'})+'\n',error=>{if(error)this.fail(error);});
 }
 rpc(method,params,{timeoutMs=this.requestTimeoutMs}={}){
  if(this.failure)return Promise.reject(this.failure);
  if(!this.child?.stdin?.writable)return Promise.reject(Error('MCP连接尚未启动或已关闭'));
  const id=++this.sequence;
  return new Promise((resolve,reject)=>{
   const timer=setTimeout(()=>this.fail(Object.assign(Error('MCP响应超时，执行效果未知；停止后续请求，不自动重放'),{code:'MCP_RESPONSE_TIMEOUT'})),timeoutMs);
   this.pending.set(id,{resolve,reject,timer});
   try{this.child.stdin.write(JSON.stringify({jsonrpc:'2.0',id,method,params})+'\n',error=>{if(error)this.fail(error);});}catch(error){this.fail(error);}
  });
 }
 async js(code){
  const r=await this.rpc('tools/call',{name:'js',arguments:{code,timeoutMs:90000,maxChars:120000}});
  const text=r.content?.find(c=>c.type==='text')?.text;if(!text)throw Error('MCP缺少响应');
  let value;try{value=JSON.parse(text);}catch{throw Error('MCP返回非JSON结果，不能确认执行效果');}
  if(value.truncated)throw Object.assign(Error('MCP结果超出输出上限，未保存截断数据；不得重放业务动作'),{code:'MCP_RESULT_TRUNCATED'});
  if(r.isError||!value.ok)throw Object.assign(Error(value.error?.message??'MCP执行失败'),{code:value.error?.code??'MCP_RESPONSE'});
  return value.value;
 }
 async capture(expression){
  const name='__hunterSnapshot'+(this.snapshotSequence=(this.snapshotSequence??0)+1),chunkSize=40000;
  try{
   const first=await this.js(`let ${name}=JSON.stringify(await (${expression})); ({length:${name}?.length??0,chunk:${name}?.slice(0,${chunkSize})??''})`);
   if(!Number.isSafeInteger(first?.length)||first.length<1||first.length>20*1024*1024||typeof first.chunk!=='string')throw Error('页面快照大小无效，未保存');
   let text=first.chunk;
   if(text.length!==Math.min(chunkSize,first.length))throw Error('页面快照首块不完整');
   for(let offset=chunkSize;offset<first.length;offset+=chunkSize){
    const chunk=await this.js(`${name}.slice(${offset},${offset+chunkSize})`);
    if(typeof chunk!=='string'||chunk.length!==Math.min(chunkSize,first.length-offset))throw Error('页面快照分块不完整');
    text+=chunk;
   }
   return JSON.parse(text);
  }finally{if(!this.failure)await this.js(`${name}=null`).catch(()=>{});}
 }
 async verify(){return verifyCompatManifest(await this.js("await browser.chrome.call('runtime.getManifest',[])"));}
 async existingTabs(){return this.js("await browser.user.openTabs({query:'h.liepin.com',limit:100})");}
 async claimExisting(id,expectedUrl){
  this.tab(id); // Validate before constructing the official API call.
  const result=await this.js(`(await browser.user.claimTab(${JSON.stringify({tabId:Number(id),expectedUrl})})).id`);
  if(String(result)!==String(id))throw Error('绑定返回的标签身份不一致');
  return this.tab(id); // A claimed user tab is deliberately not added to ownedTabs.
 }
 tab(id){if(!/^\d+$/.test(String(id))||!Number.isSafeInteger(Number(id)))throw Error('MCP标签ID必须为已观察到的数字');const expr=`(await browser.tabs.get(${JSON.stringify(String(id))}))`;return {
  id:String(id),url:()=>this.js(`${expr}.url()`),
  evaluate:(fn,{arg}={})=>this.capture(`${expr}.evaluate((${fn.toString()}),{arg:${JSON.stringify(arg)??'undefined'}})`),
  act:args=>this.js(`${expr}.act(${JSON.stringify(args)})`),
  activate:async()=>{
   await this.js(`await browser.chrome.call('tabs.update',[${Number(id)},{active:true}])`);
   const state=await this.js(`await browser.chrome.call('tabs.get',[${Number(id)}])`);
   if(state?.id!==Number(id)||state.active!==true)throw Error('搜索标签激活未确认');
   return state;
  },
  close:async()=>{if(!this.ownedTabs.has(String(id)))throw Error('只能关闭本会话创建的标签');const result=await this.js(`${expr}.close()`);this.ownedTabs.delete(String(id));return result;},
  cdp:{send:(method,params)=>this.js(`${expr}.cdp.send(${JSON.stringify(method)},${JSON.stringify(params??{})})`)},
 };}
 async newSearch(){const id=await this.js("(await browser.tabs.new('https://h.liepin.com/search/getConditionItem')).id");this.ownedTabs.add(String(id));return this.tab(id);}
 claimOpenedTab(id){if(!/^\d+$/.test(String(id))||!Number.isSafeInteger(Number(id)))throw Error('新标签ID无效');this.ownedTabs.add(String(id));return this.tab(id);}
 close(){this.fail(Error('MCP会话已关闭，未确认请求不能自动重放'));this.child?.stdin.end();this.child?.kill();}
}
