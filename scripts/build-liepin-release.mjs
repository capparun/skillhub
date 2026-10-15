import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'distribution/liepin-search');
const args=process.argv.slice(2);
const previewIndex=args.indexOf('--preview-out');
const preview=previewIndex>=0;
if(preview && (!args[previewIndex+1] || args[previewIndex+1].startsWith('--')))throw new Error('--preview-out needs an output directory');
const distribution=JSON.parse(fs.readFileSync(path.join(source, 'distribution.json'), 'utf8'));
const version = distribution.version+(preview?'-preview':'');
const filename = `liepin-search-v${version}.tar.gz`;
const output = preview?path.resolve(args[previewIndex+1]):path.join(root, 'public/download');
if(preview){
 fs.mkdirSync(output,{recursive:true});
 const actual=fs.realpathSync(output),publicRoot=fs.realpathSync(path.join(root,'public'));
 if(actual===publicRoot || actual.startsWith(publicRoot+path.sep))throw new Error('Preview output must not be publicly served');
}
const extensionIndex=args.indexOf('--extension');
if(extensionIndex>=0 && !preview)throw new Error('Unaccepted companion extension may only be included in a preview');
const extension=extensionIndex>=0?args[extensionIndex+1]:null;
if(extensionIndex>=0 && (!extension || extension.startsWith('--')))throw new Error('--extension needs a directory');
if (fs.existsSync(path.join(output, filename)) || fs.existsSync(path.join(output, `liepin-search-v${version}.json`))) {
  throw new Error(`版本 ${version} 的发布文件已存在，不覆盖。新开发须完成验收后使用新版本号。`);
}
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'liepin-release-'));
const packageDir = path.join(stage, `liepin-search-v${version}`);
try {
  fs.cpSync(source, packageDir, {
    recursive: true,
    filter: entry => !['node_modules', '.DS_Store'].includes(path.basename(entry)),
  });
  if(preview){
    const metadata={...distribution,version,channel:'preview',acceptance:'pending'};
    if(extension){
      const background=fs.readFileSync(path.join(extension,'dist/background.js'),'utf8');
      const policy=fs.readFileSync(path.join(root,'tools/liepin-connection-diagnostic/runtime-policy.js'),'utf8');
      if(!background.startsWith(policy+'\n'))throw new Error('Companion extension does not match current reviewed policy source');
      fs.cpSync(extension,path.join(packageDir,'browser-extension'),{recursive:true});
      metadata.browserExtension={path:'browser-extension',automaticInstallation:false,backgroundSha256:crypto.createHash('sha256').update(background).digest('hex')};
    }
    fs.writeFileSync(path.join(packageDir,'distribution.json'),JSON.stringify(metadata,null,2)+'\n');
    fs.writeFileSync(path.join(packageDir,'PREVIEW.md'),'# 猎聘开发验收包\n\n此包未发布、未完成真实全量验收，不能标记为正式可用。\n\ninstall.mjs 安装插件与 Skill；默认使用官方 OpenCLI 扩展。\n\n'+(extension?'此包额外含 browser-extension 实验副本，不会自动加载，也不是默认安装依赖。加载前须确认本地修改版扩展的权限，实验副本与官方扩展不得同时启用。\n\n':'此包不含实验浏览器扩展。\n\n')+'包外 JSON 的 SHA-256 校验对象是整个 tar.gz 安装包，不是 install.mjs 或 install.ps1。\n');
  }
  fs.mkdirSync(output, { recursive: true });
  const archive = path.join(stage, filename);
  execFileSync('tar', ['-czf', archive, '-C', stage, path.basename(packageDir)], {
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  });
  const bytes = fs.readFileSync(archive);
  const release = { product: 'liepin-search', version, file: filename, sha256: crypto.createHash('sha256').update(bytes).digest('hex'), sizeBytes: bytes.length };
  fs.copyFileSync(archive, path.join(output, filename), fs.constants.COPYFILE_EXCL);
  fs.writeFileSync(path.join(output, `liepin-search-v${version}.json`), JSON.stringify(release, null, 2) + '\n', {flag:'wx'});
  console.log(JSON.stringify(release));
} finally {
  fs.rmSync(stage, { recursive: true, force: true });
}
