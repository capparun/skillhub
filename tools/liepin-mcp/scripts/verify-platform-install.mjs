// Same acceptance command on macOS and Windows; no browser or global registration.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';
import {buildPackage} from './build-package.mjs';
import {stageInstall,selectVersion} from './install-package.mjs';
import {verifyPreparedRuntime} from './verify-prepared-runtime.mjs';
import {prepareAdapterRuntime} from './prepare-adapter-runtime.mjs';
const report=path.resolve(process.argv[2]??'adapter-platform-result.json');
const releaseVersion=process.argv[3];
const root=fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(),'猎聘 安装验收-')));
const result={platform:process.platform,node:process.version,root,browserVerified:false,globalConfigurationChanged:false};
const checkpoint=phase=>{result.phase=phase;fs.writeFileSync(report,JSON.stringify(result,null,2));console.log('INSTALL_CHECKPOINT '+phase);};
process.once('exit',code=>{if(!['passed','failed'].includes(result.status)){result.status='failed';result.error='Installation verifier exited before completion (exit '+code+', phase '+result.phase+')';fs.writeFileSync(report,JSON.stringify(result,null,2));}});
checkpoint('starting');
try{
 checkpoint('build-package');
 const candidate=buildPackage(path.join(root,'候选 包'),{delivery:'site-adapter',releaseVersion});
 const candidateVersion=JSON.parse(fs.readFileSync(path.join(candidate.root,'manifest.json'))).version;result.version=candidateVersion;
 checkpoint('stage-install');
 const installed=stageInstall({source:candidate.root,root:path.join(root,'安装 目录'),expected:candidate.sourceFingerprint});
 const selected=selectVersion({root:installed.root,id:installed.fingerprint});
 if(selected.mcpServers||!selected.localCommand)throw Error('Adapter 安装返回了错误服务入口');
 checkpoint('local-conditions');
 const output=spawnSync(selected.localCommand.command,[...selected.localCommand.args,'conditions'],{encoding:'utf8',timeout:20000});
 if(output.error||output.status!==0)throw Error(output.error?.message??output.stderr);
 if(JSON.parse(output.stdout).length!==30)throw Error('筛选字段缺失');
 // Exercise the shipped CLI and all its report imports through the fixed launcher.
 const taskFile=path.join(root,'合成 任务.json'),htmlFile=path.join(root,'可视化 结果.html');
 const invokeLocal=(command,input)=>{
  const response=spawnSync(selected.localCommand.command,[...selected.localCommand.args,command,'-'],{input:JSON.stringify(input),encoding:'utf8',timeout:20000});
  if(response.error||response.status!==0)throw Error(response.error?.message??response.stderr);
  return JSON.parse(response.stdout);
 };
 checkpoint('local-reports');
 invokeLocal('create',{file:taskFile,title:'安装验收合成任务'});
 const exported=invokeLocal('report',{file:taskFile,output:htmlFile,format:'html'});
 const html=fs.readFileSync(htmlFile,'utf8');
 if(exported.view!=='platform'||!html.includes('候选人列表与简历详情')||!html.includes('candidate-query')||!html.includes('candidate-status')||!html.includes('candidate-next'))throw Error('安装后未生成完整平台可视化报告');
 const evaluationFile=path.join(root,'重点 摘要.html');
 const evaluation=invokeLocal('report',{file:taskFile,output:evaluationFile,view:'evaluation',format:'html'});
 if(!evaluation.files||Object.values(evaluation.files).length!==3||Object.values(evaluation.files).some(file=>path.dirname(file)!==root||!fs.statSync(file).isFile()))throw Error('安装版评估报告缺少同目录三文件');
 const evaluationHtml=fs.readFileSync(evaluationFile,'utf8'),rawEvaluation=JSON.parse(fs.readFileSync(evaluation.files.records,'utf8'));
 if(evaluationHtml.indexOf('class="report-snapshot"')<0||evaluationHtml.indexOf('class="report-snapshot"')>evaluationHtml.indexOf('<header>')||evaluationHtml.includes('<details class="audit-appendix"')||rawEvaluation.task.id!==JSON.parse(fs.readFileSync(taskFile)).id)throw Error('安装版评估快照或独立原始记录不一致');
 result.evaluationReport={files:3,statisticsFirst:true,rawSeparated:true};
 checkpoint('prepare-adapter-runtime');
 const prepared=await prepareAdapterRuntime(installed.directory);
 verifyPreparedRuntime(installed.directory);
 const expectedAdapters=['bind','connect','current-detail','detail-batch','detail-review','favorite-list','favorite','favorites','next-page','open-detail','prepare','results','saved-search','search','tabs'].sort();
 if(JSON.stringify([...prepared.adapters].sort())!==JSON.stringify(expectedAdapters))throw Error('Adapter 注册不完整：'+JSON.stringify(prepared.adapters));
 const {buildNativeLauncher}=await import(pathToFileURL(path.join(installed.directory,'tools/liepin-mcp/scripts/build-native-launcher.mjs')));
 const native=buildNativeLauncher(installed.directory,path.join(root,'通信 启动器'));
 // Exercise the shipped first-registration and upgrade/rollback entry on a
 // task-owned manifest only. Never touch the user's real Chrome configuration.
 checkpoint('registration-cycle');
 const setup=await import(pathToFileURL(path.join(installed.directory,'tools/liepin-mcp/scripts/browser-setup.mjs')));
 const testManifest=path.join(root,'合成 Chrome 通信','com.opencli.mcp.json');
 let registryState={exists:false,hasDefault:false,value:null,kind:null,otherValues:[],subKeys:[]};
 const registrationBackend={read:()=>structuredClone(registryState),set:value=>(registryState={exists:true,hasDefault:true,value,kind:'String',otherValues:[],subKeys:[]}),restore:before=>{registryState=structuredClone(before);}};
 const setupDeps=process.platform==='win32'?{registry:registrationBackend}:{};
 const setupInput={directory:installed.directory,launcher:native.launcher,extensionId:'abcdefghijklmnopabcdefghijklmnop',manifest:testManifest};
 const setupPlan=setup.planBrowserSetup(setupInput,setupDeps);
 if(fs.existsSync(testManifest))throw Error('接入预览写入了通信清单');
 const setupReceipt=path.join(root,'首次接入 回滚.json');
 setup.applyBrowserSetup({plan:setupPlan,receipt:setupReceipt},setupDeps);
 if(JSON.parse(fs.readFileSync(testManifest)).path!==native.launcher)throw Error('首次接入未指向包内启动器');
 setup.restoreBrowserSetup(setupReceipt,setupDeps);
 if(fs.existsSync(testManifest))throw Error('首次接入回滚没有移除新建清单');
 const originalHost=Buffer.from(JSON.stringify({name:'com.opencli.mcp',type:'stdio',path:native.launcher,allowed_origins:['chrome-extension://pppppppppppppppppppppppppppppppp/'],extra:'preserve'})+'\r\n');
 fs.writeFileSync(testManifest,originalHost);
 const upgradePlan=setup.planBrowserSetup(setupInput,setupDeps),upgradeReceipt=path.join(root,'升级回滚.json');
 setup.applyBrowserSetup({plan:upgradePlan,receipt:upgradeReceipt},setupDeps);setup.restoreBrowserSetup(upgradeReceipt,setupDeps);
 if(!fs.readFileSync(testManifest).equals(originalHost))throw Error('升级回滚未逐字节恢复原清单');
 result.browserRegistration={manifestFileCycle:'passed-task-owned-path',windowsRegistry:process.platform==='win32'?'contract-only-injected-backend':'not-applicable',realChromeChanged:false};
 const {prepareBrowserAssets}=await import(pathToFileURL(path.join(installed.directory,'tools/liepin-mcp/scripts/prepare-browser.mjs')));
 const {verifyNativeLauncher}=await import(pathToFileURL(path.join(installed.directory,'tools/liepin-mcp/scripts/build-native-launcher.mjs')));
 checkpoint('browser-assets');
 const browserRoot=path.join(root,'稳定 浏览器资产');
 checkpoint('browser-assets-first');
 const assetProbe=spawnSync(process.execPath,['--input-type=module','-e',
  `import fs from 'node:fs';import {prepareBrowserAssets} from ${JSON.stringify(pathToFileURL(path.join(installed.directory,'tools/liepin-mcp/scripts/prepare-browser.mjs')).href)};const assets=prepareBrowserAssets(${JSON.stringify(installed.directory)},${JSON.stringify(browserRoot)},{onProgress:phase=>process.stderr.write('ASSET_CHECKPOINT '+phase+'\\n')});fs.writeFileSync(${JSON.stringify(path.join(root,'asset-probe.json'))},JSON.stringify(assets),{flag:'wx'});`],{encoding:'utf8',timeout:30000});
 console.log(assetProbe.stderr??'');
 if(assetProbe.error||assetProbe.status!==0)throw Error('Browser asset subprocess failed: '+JSON.stringify({status:assetProbe.status,signal:assetProbe.signal,error:assetProbe.error?.message,stderr:assetProbe.stderr,stdout:assetProbe.stdout}));
 const assets=JSON.parse(fs.readFileSync(path.join(root,'asset-probe.json')));
 checkpoint('browser-assets-reuse');
 const reusedAssets=prepareBrowserAssets(installed.directory,browserRoot);
 if(assets.extension!==reusedAssets.extension||assets.launcher!==reusedAssets.launcher||assets.expectedExtensionId!==reusedAssets.expectedExtensionId)throw Error('重复准备创建了不同扩展或宿主');
 const loadedManifest=JSON.parse(fs.readFileSync(path.join(assets.extension,'manifest.json')));
 if(!loadedManifest.key||loadedManifest.name!=='Hunter MCP compatibility preview')throw Error('独立兼容扩展缺少固定公开身份');
 verifyNativeLauncher(path.dirname(assets.launcher));
 checkpoint('browser-launcher-integrity');
 const launcherBytes=fs.readFileSync(assets.launcher);
 try{fs.appendFileSync(assets.launcher,'\nchanged');checkpoint('browser-launcher-integrity-recheck');let rejected=false;try{prepareBrowserAssets(installed.directory,browserRoot);}catch(error){rejected=error.message.includes('启动器文件已变化');}if(!rejected)throw Error('重复准备没有拒绝已变化的启动器');}finally{fs.writeFileSync(assets.launcher,launcherBytes);}
 result.browserAssets={status:'prepared-and-reused',expectedExtensionId:assets.expectedExtensionId,extensionFiles:assets.extensionFiles.length,chromeLoaded:false,globalConfigurationChanged:false};
 const initialize=JSON.stringify({jsonrpc:'2.0',id:1,method:'initialize',params:{protocolVersion:'2024-11-05',capabilities:{},clientInfo:{name:'installer-probe',version:'1'}}})+'\n';
 checkpoint('client-launcher');
 const clientLaunch=spawnSync(assets.mcpServer.command,[...assets.mcpServer.args],{input:initialize,encoding:'utf8',timeout:20000});
 if(clientLaunch.error||clientLaunch.status!==0||!clientLaunch.stdout.includes('opencli-mcp'))throw Error('生成的跨平台客户端配置未能完成协议初始化');
 const launch=()=>process.platform==='win32'
  ?spawnSync(process.env.ComSpec??'cmd.exe',['/d','/s','/c',`""${native.launcher}" stdio"`],{input:initialize,encoding:'utf8',timeout:20000,windowsVerbatimArguments:true})
  :spawnSync(native.launcher,['stdio'],{input:initialize,encoding:'utf8',timeout:20000});
 checkpoint('native-launcher');
 const launchResult=launch();
 if(launchResult.error||launchResult.status!==0)throw Error(launchResult.error?.message??launchResult.stderr);
 const response=launchResult.stdout.trim().split(/\r?\n/).map(line=>JSON.parse(line)).find(item=>item.id===1);
 if(response?.result?.serverInfo?.name!=='opencli-mcp'||response.result.serverInfo.version!=='0.0.30')throw Error('正式启动器返回了错误的MCP运行时');
 // Exercise fail-closed startup against the installed artifact, then restore exactly.
 checkpoint('runtime-integrity');
 const probeFile=path.join(installed.directory,'node_modules/opencli-mcp/adapters/liepin/tabs.js');
 const original=fs.readFileSync(probeFile);
 try{
  fs.appendFileSync(probeFile,'\n// installation integrity probe\n');
  const rejected=launch();
  if(rejected.error||rejected.status!==1||!rejected.stderr.includes('运行时文件已变化')||rejected.stdout.trim())throw Error('启动器没有在文件变更后明确拒绝启动');
 }finally{fs.writeFileSync(probeFile,original);}
 verifyPreparedRuntime(installed.directory);
 // Verify the installed executor, not just descriptor loading or runtime context.
 const upstream=path.join(installed.directory,'node_modules/opencli-mcp');
 checkpoint('installed-executor');
 const {Runtime}=await import(pathToFileURL(path.join(upstream,'dist/src/runtime/runtime.js')));
 const {runAdapter}=await import(pathToFileURL(path.join(upstream,'dist/src/sites/executor.js')));
 const runtime=new Runtime();
 const page={getActivePage:()=> '1'};
 for(const site of ['liepin','other']){
  const probe=await runAdapter({browserAvailable:()=>true,getAdapterPage:async()=>page,toolContext:()=>runtime.toolContext(page,site)},
   {site,name:'installed-context-probe',args:[],result:{kind:'value'},run:async ctx=>({tabs:typeof ctx.tabs?.child,userTabs:typeof ctx.userTabs?.list})},{});
  const expected=site==='liepin'?'function':'undefined';
  if(!probe.ok||probe.value.tabs!==expected||probe.value.userTabs!==expected)throw Error('安装后的正式执行器未正确传递兼容接口');
 }
 const {SiteRegistry}=await import(pathToFileURL(path.join(upstream,'dist/src/sites/loader.js')));
 const registry=new SiteRegistry([{dir:path.join(upstream,'adapters'),kind:'builtin'}]);
 const tabsCommand=await registry.resolve('liepin','tabs');
 const listed=await runAdapter({
  browserAvailable:()=>true,getAdapterPage:async()=>page,
  toolContext:async()=>({tab:page,userTabs:{list:async()=>[{tabId:123,url:'https://h.liepin.com/search/getConditionItem',active:true}],bind:async()=>{throw Error('Read-only tabs must not bind');}}}),
 },tabsCommand,{});
 if(!listed.ok||listed.rows?.length!==1||listed.rows[0].tab_id!=='123')throw Error('实际 tabs Adapter 与官方结果契约不兼容：'+JSON.stringify(listed));

 // Validate restoration's declared value contract through the installed executor.
 // Use a completed scoped receipt: no browser connection or query is dispatched.
 const restoreCore=relative=>import(pathToFileURL(path.join(installed.directory,'distribution/liepin-search/runtime/packages/liepin/lib',relative)));
 const {createTask:restoreCreate,updateTask:restoreUpdate}=await restoreCore('task-store.js');
 const {createSiteScope:restoreScope,bindSiteScope:restoreBind,executeScopedOperation:restoreExecute}=await restoreCore('site-scope.js');
 const {authorizeTask:restoreAuthorize}=await restoreCore('operation-gate.js');
 const {restorationRequest:restoreRequest}=await restoreCore('search-restoration.js');
 const restoreFile=path.join(root,'合成恢复回执.json'),restoreScopeFile=restoreFile+'.scope',restoreNow=new Date().toISOString(),restoreFilters={keyword:'合成',limit:1};
 restoreCreate(restoreFile,{title:'合成恢复契约验收'});restoreScope(restoreScopeFile,{label:'synthetic-only',maxOperations:2,confirmedAt:restoreNow});restoreBind(restoreFile,restoreScopeFile);
 const restoreOriginal={operationId:'round-trial',kind:'search',payload:restoreFilters};
 restoreAuthorize(restoreFile,{allowedKinds:['search','restore-search'],allowedRequests:[restoreOriginal],maxOperations:2,confirmedAt:restoreNow,scope:'synthetic-only'});
 await restoreExecute(restoreFile,restoreOriginal,async()=>({status:'completed',evidence:{roundId:'trial',rows:[]}}));
 restoreUpdate(restoreFile,t=>({...t,rounds:[{id:'trial',phase:'trial',status:'completed',operationId:'round-trial',filters:restoreFilters}]}));
 const {grantOperations:restoreGrant}=await restoreCore('operation-gate.js'),{readTask:restoreRead}=await restoreCore('task-store.js');
 const restoreAllowed=restoreRequest(restoreRead(restoreFile),'trial','123');restoreGrant(restoreFile,{allowedRequests:[restoreAllowed],confirmedAt:restoreNow,scope:'synthetic-only'});
 await restoreExecute(restoreFile,{...restoreAllowed,operationId:'restore-one'},async()=>({status:'completed',evidence:{roundId:'trial',collectionRoundId:'trial-restore-restore-one',recoveryOf:'round-trial',rows:[{source:'liepin',resumeId:'synthetic-restored',summary:'合成恢复记录'}]}}));
 restoreUpdate(restoreFile,t=>{t.rounds[0].restorations=[{status:'completed',operationId:'restore-one',collectionRoundId:'trial-restore-restore-one'}];return t;});
 const restoreCommand=await registry.resolve('liepin','search');
 const restoredReceipt=await runAdapter({browserAvailable:()=>true,getAdapterPage:async()=>page,toolContext:async()=>({tab:{id:'456',url:()=>{throw Error('cached receipt must not read the current page');}}})},restoreCommand,{file:restoreFile,round_id:'trial',tab_id:'123',restore:true,operation_id:'restore-one',reason:'只读合成已完成回执'});
 if(!restoredReceipt.ok||restoredReceipt.value?.snapshot?.status!=='completed'||restoredReceipt.value.snapshot.rows.length!==1||restoredReceipt.rows)throw Error('实际恢复Adapter单值回执契约失败：'+JSON.stringify(restoredReceipt));
 result.restorationContract={officialExecutor:true,cachedReceipt:true,originalTabClosed:true,browserCalls:0};

 checkpoint('customer-install');
 const customerState=path.join(process.platform==='darwin'?root.replace(/^\/private\/var\//,'/var/'):root,'客户 状态'),customerSkills=path.join(root,'客户 Skills');
 const customerRun=spawnSync(process.execPath,[path.join(candidate.root,'install.mjs'),'--product','liepin-search','--version',candidateVersion,'--server','https://example.invalid','--state-dir',customerState,'--skills-dir',customerSkills,'--update-credential','synthetic-test-credential'],{cwd:candidate.root,encoding:'utf8',timeout:180000});
 if(customerRun.error||customerRun.status!==0)throw Error('客户入口安装失败：'+JSON.stringify({error:customerRun.error?.message,status:customerRun.status,signal:customerRun.signal,stderr:customerRun.stderr,stdout:customerRun.stdout.replaceAll('synthetic-test-credential','[redacted]')}));
 if(customerRun.stdout.includes('synthetic-test-credential'))throw Error('客户安装输出暴露更新凭据');
 const customer=JSON.parse(customerRun.stdout);if(customer.status!=='local-installed-browser-setup-required'||customer.browserVerified!==false||customer.businessVerified!==false)throw Error('客户安装冒充浏览器或业务通过');
 if(!fs.existsSync(path.join(customerSkills,'hunter-liepin-mcp/SKILL.md')))throw Error('客户Skill未安装');
 checkpoint('customer-doctor');
 for(const target of [path.join(candidate.root,'doctor.mjs'),path.join(customer.directory,'doctor.mjs')]){
  const check=spawnSync(process.execPath,[target,...(target.startsWith(customer.directory)?['--root',customer.root]:[])],{cwd:root,encoding:'utf8',timeout:20000});
  if(check.status!==0||JSON.parse(check.stdout).localVerified!==true)throw Error('客户doctor入口失败：'+check.stderr);
 }
 result.customerInstall={status:'local-installed-browser-setup-required',fixedState:true,skillInstalled:true,persistentDoctor:true,browserVerified:false,globalConfigurationChanged:false};

 Object.assign(result,{status:'passed',fingerprint:candidate.sourceFingerprint,adapterCount:prepared.adapters.length,checks:['npm-ci','fixed-local-launch','unicode-space-path','installed-platform-report','installed-evaluation-bundle','fifteen-adapter-registry','isolated-runtime-patch','generated-launcher-initialize','installed-first-browser-registration','installed-registration-upgrade-rollback','stable-compatible-extension-assets','generated-client-config-initialize','reject-modified-native-launcher','launcher-rejects-modified-runtime','installed-executor-context','installed-tabs-result-contract','installed-restore-value-contract','other-sites-unchanged','website-compatible-customer-install','customer-skill-registration','persistent-customer-doctor','credential-not-in-output']});
}catch(error){Object.assign(result,{status:'failed',error:error.message});process.exitCode=1;}
finally{fs.writeFileSync(report,JSON.stringify(result,null,2));console.log(JSON.stringify(result));}
