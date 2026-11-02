// Candidate archive for the existing distribution-site contract. Never publishes.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {verifyPackage} from './install-package.mjs';
export function buildDistributionArchive({source,expected,output}){
 const {root,manifest}=verifyPackage(source,expected);
 if(manifest.delivery!=='site-adapter'||manifest.product!=='hunter-liepin-mcp')throw Error('只接受猎聘Site Adapter包');
 const preview=/^\d+\.\d+\.\d+-[0-9A-Za-z.-]+$/.test(manifest.version)&&manifest.releaseStatus==='development-candidate-not-approved';
 const release=/^0\.3\.(0|[1-9]\d{0,5})$/.test(manifest.version)&&manifest.releaseStatus==='release-candidate-not-approved';
 if(!preview&&!release)throw Error('只接受明确标记未批准的预发布或正式版本候选');
 const pkg=JSON.parse(fs.readFileSync(path.join(root,'package.json'))),lock=JSON.parse(fs.readFileSync(path.join(root,'package-lock.json')));
 if(pkg.version!==manifest.version||lock.version!==manifest.version||lock.packages?.['']?.version!==manifest.version)throw Error('归档版本与受哈希校验的包版本不一致');
 for(const required of ['install.mjs','doctor.mjs'])if(!manifest.files.some(item=>item.path===required))throw Error('缺少网站安装入口');
 const target=path.resolve(output),publicRoot=fileURLToPath(new URL('../../../public/',import.meta.url));
 fs.mkdirSync(target,{recursive:true});const actual=fs.realpathSync(target),publicActual=fs.existsSync(publicRoot)?fs.realpathSync(publicRoot):path.join(fs.realpathSync(path.dirname(publicRoot)),path.basename(publicRoot));
 if(actual===publicActual||actual.startsWith(publicActual+path.sep))throw Error('未批准候选不能写入公开目录');
 const filename=`liepin-search-v${manifest.version}.tar.gz`,metadataName=`liepin-search-v${manifest.version}.json`;
 for(const name of [filename,metadataName])if(fs.existsSync(path.join(target,name)))throw Error('归档已存在，不覆盖');
 const stage=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-distribution-archive-'));
 try{
  const packageName=`liepin-search-v${manifest.version}`,packageRoot=path.join(stage,packageName);fs.mkdirSync(packageRoot);
  // Copy only declared, hash-verified files: never runtime receipts or private extras.
  for(const item of manifest.files){const destination=path.join(packageRoot,item.path);fs.mkdirSync(path.dirname(destination),{recursive:true});fs.copyFileSync(path.join(root,item.path),destination,fs.constants.COPYFILE_EXCL);}
  fs.copyFileSync(path.join(root,'manifest.json'),path.join(packageRoot,'manifest.json'),fs.constants.COPYFILE_EXCL);
  verifyPackage(packageRoot,expected);
  const archive=path.join(stage,filename);execFileSync('tar',['-czf',archive,'-C',stage,packageName],{env:{...process.env,COPYFILE_DISABLE:'1'}});
  const bytes=fs.readFileSync(archive),release={product:'liepin-search',version:manifest.version,file:filename,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length,sourceFingerprint:expected,transport:'opencli-mcp-site-adapter',channel:preview?'development-candidate':'release-candidate',approved:false,published:false};
  fs.copyFileSync(archive,path.join(target,filename),fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(path.join(target,metadataName),JSON.stringify(release,null,2)+'\n',{flag:'wx',mode:0o600});return release;
 }finally{fs.rmSync(stage,{recursive:true,force:true});}
}
if(process.argv[1]&&fs.realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
 if(process.argv.length!==5)throw Error('用法：node build-distribution-archive.mjs <候选目录> <源码指纹> <私有输出目录>');
 console.log(JSON.stringify(buildDistributionArchive({source:process.argv[2],expected:process.argv[3],output:process.argv[4]})));
}
