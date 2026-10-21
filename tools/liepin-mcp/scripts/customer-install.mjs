import fs from 'node:fs';import path from 'node:path';import{spawnSync}from 'node:child_process';import crypto from 'node:crypto';import{verifyNativeLauncher}from './build-native-launcher.mjs';
import{stageInstall,selectVersion,verifyPackage,npmCommand}from './install-package.mjs';import{prepareAdapterRuntime}from './prepare-adapter-runtime.mjs';import{prepareBrowserAssets}from './prepare-browser.mjs';import{verifyPreparedRuntime}from './verify-prepared-runtime.mjs';
import{resolveInstallTargets}from '../../../distribution/liepin-search/target-distribution.mjs';import{replaceDirectory}from '../../../distribution/liepin-search/directory-distribution.mjs';
const options=new Set(['--product','--version','--server','--update-credential','--npm-registry','--state-dir','--skills-dir','--agent','--project-dir','--root']);
export function parseCustomerArguments(argv){const args={};for(let i=0;i<argv.length;i++){const key=argv[i];if(key==='--offline'){if(args[key])throw Error('重复参数');args[key]=true;continue;}if(!options.has(key)||Object.hasOwn(args,key)||!argv[i+1]||argv[i+1].startsWith('--'))throw Error('未知、重复或缺值的安装参数：'+key);args[key]=argv[++i];}if(args['--product']&&args['--product']!=='liepin-search')throw Error('此包只安装liepin-search');if(args['--server']){const server=new URL(args['--server']);if(server.protocol!=='https:'||server.username||server.password)throw Error('服务地址须为无内嵌凭据的HTTPS地址');}if(args['--npm-registry']){const url=new URL(args['--npm-registry']);if(url.protocol!=='https:'||url.username||url.password)throw Error('npm registry须为无内嵌凭据的HTTPS地址');}return args;}
function readJson(file){const stat=fs.lstatSync(file);if(!stat.isFile()||stat.isSymbolicLink())throw Error('安装记录须为普通文件');return JSON.parse(fs.readFileSync(file));}
function writeJson(file,value){if(fs.existsSync(file)&&fs.lstatSync(file).isSymbolicLink())throw Error('拒绝覆盖链接');const temp=file+'.new';fs.writeFileSync(temp,JSON.stringify(value,null,2)+'\n',{flag:'wx',mode:0o600});try{fs.renameSync(temp,file);}finally{if(fs.existsSync(temp))fs.unlinkSync(temp);}}
export async function installCustomer(argv,{packageDirectory,env=process.env,stage=stageInstall,prepare=prepareAdapterRuntime,assets=prepareBrowserAssets,select=selectVersion,resolveTargets=resolveInstallTargets}={}){
 const args=parseCustomerArguments(argv),manifest=readJson(path.join(packageDirectory,'manifest.json'));verifyPackage(packageDirectory,manifest.sourceFingerprint);
 if(manifest.delivery!=='site-adapter'||args['--version']&&args['--version']!==manifest.version)throw Error('包交付类型或版本与请求不一致');if(Number(process.versions.node.split('.')[0])<22)throw Error('需要Node.js22或更高版本');
 const targets=resolveTargets(argv,env);if(targets.skillRoots.length!==1)throw Error('检测到多个助手目录；请先用--skills-dir或HUNTER_SKILLS_DIR明确本次目标，不自动安装到多个助手');let root=path.resolve(args['--root']??path.join(targets.stateRoot,'packages','liepin-mcp')),owner=path.join(root,'customer-install-root.json');
 if(fs.existsSync(root)&&fs.lstatSync(root).isSymbolicLink())throw Error('安装根不能是链接');
 if(fs.existsSync(root)&&fs.readdirSync(root).length&&!fs.existsSync(owner))throw Error('目录不是此安装器管理的根；请指定新的root');
 fs.mkdirSync(root,{recursive:true,mode:0o700});root=fs.realpathSync(root);owner=path.join(root,'customer-install-root.json');if(fs.existsSync(owner)){if(readJson(owner).product!=='hunter-liepin-mcp')throw Error('安装根属于其他产品');}else writeJson(owner,{product:'hunter-liepin-mcp',schemaVersion:1});
 const registry=args['--npm-registry']??'https://registry.npmjs.org',fingerprint=manifest.sourceFingerprint,directory=path.join(root,'versions',fingerprint);
 if(fs.existsSync(directory)){if(readJson(path.join(directory,'install-receipt.json')).status!=='ready')throw Error('已有失败版本，先核对，不覆盖');verifyPreparedRuntime(directory);}
 else{stage({source:packageDirectory,root,expected:fingerprint},{installDependencies:dir=>{const npm=npmCommand();const result=spawnSync(npm.command,[...npm.prefix,'ci','--ignore-scripts','--registry='+registry,'--cache='+path.join(root,'npm-cache'),...(args['--offline']?['--offline']:[])],{cwd:dir,encoding:'utf8',timeout:120000});if(result.error||result.status!==0)throw Error('包内依赖安装未完成：'+(result.error?.message??'请检查npm配置和缓存'));}});await prepare(directory);}
 const browser=assets(directory,path.join(root,'browser')),assetFile=path.join(root,'browser-assets-'+fingerprint+'.json');writeJson(assetFile,browser);
 const skillSource=path.join(directory,'tools/liepin-mcp/skill/hunter-liepin-mcp'),skillBackups=[];
 // Validate all destinations before writing any Skill directory.
 for(const base of targets.skillRoots){const destination=path.join(base,'hunter-liepin-mcp');for(const check of [base,destination])if(fs.existsSync(check)&&fs.lstatSync(check).isSymbolicLink())throw Error('Skill目录不能是链接');if(fs.existsSync(destination)&&!/^name:\s*hunter-liepin-mcp\s*$/m.test(fs.readFileSync(path.join(destination,'SKILL.md'),'utf8')))throw Error('同名目录不是本产品Skill，不覆盖');}
 for(const base of targets.skillRoots){const destination=path.join(base,'hunter-liepin-mcp');skillBackups.push({destination,backup:replaceDirectory(skillSource,destination)});}
 const selected=select({root,id:fingerprint}),receipt=path.join(root,'customer-installation.json');
 const result={schemaVersion:1,product:'liepin-search',delivery:'site-adapter',version:manifest.version,fingerprint,status:'local-installed-browser-setup-required',root,directory,localCommand:selected.localCommand,assetsFile:assetFile,extensionDirectory:browser.extension,expectedExtensionId:browser.expectedExtensionId,mcpServer:browser.mcpServer,skillTargets:skillBackups,installedAt:new Date().toISOString(),npmRegistry:registry,serverUrl:args['--server']??null,browserVerified:false,businessVerified:false,nextSteps:['在Chrome加载持久兼容扩展并核对实际ID','用browser-setup plan/apply明确接入并保留回滚收据','在Agent配置返回的Node MCP命令并确认Skill可发现','核对连接后完成首次业务任务；安装本身不证明可用']};
 if(args['--update-credential']){const credentialFile=path.join(root,'update-credential.json');writeJson(credentialFile,{credential:args['--update-credential'],server:args['--server']??null});result.updateCredentialFile=credentialFile;}
 writeJson(receipt,result);writeJson(path.join(packageDirectory,'.hunter-install-location.json'),{receipt});return{...result,receipt};
}
export function verifyInstalledSkills(record){
 const prefix='tools/liepin-mcp/skill/hunter-liepin-mcp/';
 const manifest=readJson(path.join(record.directory,'manifest.json'));
 const files=manifest.files.filter(entry=>entry.path.startsWith(prefix));
 if(!files.some(entry=>entry.path===prefix+'SKILL.md'))throw Error('安装清单缺少Skill入口');
 for(const item of record.skillTargets){
  if(fs.lstatSync(item.destination).isSymbolicLink())throw Error('Skill安装目录不能是链接');
  for(const entry of files){
   const relative=entry.path.slice(prefix.length),file=path.join(item.destination,relative);
   const stat=fs.lstatSync(file);
   if(!stat.isFile()||stat.isSymbolicLink()||!fs.realpathSync(file).startsWith(fs.realpathSync(item.destination)+path.sep))throw Error('Skill安装文件类型或路径已变化');
   const data=fs.readFileSync(file);
   if(data.length!==entry.bytes||crypto.createHash('sha256').update(data).digest('hex')!==entry.sha256)throw Error('Skill安装文件已变化：'+relative);
  }
 }
 return {targets:record.skillTargets.length,filesPerTarget:files.length};
}
export function customerDoctor({packageDirectory,root}={}){
 const receipt=root?path.join(path.resolve(root),'customer-installation.json'):readJson(path.join(packageDirectory,'.hunter-install-location.json')).receipt;
 const record=readJson(receipt);if(record.delivery!=='site-adapter'||record.product!=='liepin-search')throw Error('不是猎聘Adapter安装回执');const verified=verifyPreparedRuntime(record.directory);
 const assets=readJson(record.assetsFile);if(assets.sourceFingerprint!==record.fingerprint||assets.directory!==record.directory)throw Error('浏览器资产回执不匹配');verifyNativeLauncher(path.dirname(assets.launcher));
 for(const entry of assets.extensionFiles){const file=path.join(assets.extension,entry.path);if(!fs.lstatSync(file).isFile()||fs.lstatSync(file).isSymbolicLink()||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==entry.sha256)throw Error('兼容扩展文件已变化');}
 if(verified.sourceFingerprint!==record.fingerprint)throw Error('安装回执与文件不匹配');verifyInstalledSkills(record);
 return{status:'local-installed-browser-setup-required',localVerified:true,browserVerified:false,businessVerified:false,version:record.version,fingerprint:record.fingerprint,receipt,extensionDirectory:record.extensionDirectory,mcpServer:record.mcpServer,note:'本地文件检查通过；请继续扩展加载、通信接入、客户端发现及首次任务验证。'};
}
