import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
const source = path.resolve('distribution/gllue-only');
const d = JSON.parse(fs.readFileSync(path.join(source,'distribution.json'),'utf8'));
for(const skill of d.skills) for(const file of skill.files) {
  const actual=crypto.createHash('sha256').update(fs.readFileSync(path.join(source,'skills',skill.id,file.path))).digest('hex');
  if(actual!==file.sha256) throw Error(`Skill hash mismatch: ${skill.id}/${file.path}`);
}
const previewIndex=process.argv.indexOf('--preview-out');
const preview=previewIndex>=0;
if(preview && (!process.argv[previewIndex+1] || process.argv[previewIndex+1].startsWith('--')))throw new Error('--preview-out needs an output directory');
if(!preview && d.channel==='local-candidate')throw new Error('Local candidate must use --preview-out');
const output=preview?path.resolve(process.argv[previewIndex+1]):path.resolve('public/download');
fs.mkdirSync(output,{recursive:true});
if(preview){const actual=fs.realpathSync(output),served=fs.realpathSync('public');if(actual===served || actual.startsWith(served+path.sep))throw new Error('Preview output must not be publicly served');}
const stage=fs.mkdtempSync(path.join(os.tmpdir(),'gllue-release-'));
try {
  const folder=`gllue-only-v${d.version}`;
  fs.cpSync(source,path.join(stage,folder),{recursive:true,filter:entry=>!['node_modules','.DS_Store'].includes(path.basename(entry))});
  const file=`${folder}.tar.gz`;
  const archive=path.join(stage,file);
  execFileSync('tar',['-czf',archive,'-C',stage,folder],{env:{...process.env,COPYFILE_DISABLE:'1'}});
  const bytes=fs.readFileSync(archive);
  const release={product:d.product,version:d.version,file,sha256:crypto.createHash('sha256').update(bytes).digest('hex'),sizeBytes:bytes.length};
  fs.copyFileSync(archive,path.join(output,file),fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(path.join(output,`gllue-only-v${d.version}.json`),JSON.stringify(release,null,2)+'\n',{flag:'wx'});
  console.log(JSON.stringify(release));
} finally { fs.rmSync(stage,{recursive:true,force:true}); }
