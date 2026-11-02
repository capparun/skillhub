import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const pointer=new URL('./opencli-entry.json',import.meta.url);
if(!fs.existsSync(pointer))throw new Error('缺少安装入口，请先执行该产品 install.mjs');
const {entry}=JSON.parse(fs.readFileSync(pointer,'utf8'));
if(!entry || !fs.existsSync(entry))throw new Error('产品运行时入口已失效，请重新安装该产品');
const result=spawnSync(process.execPath,[entry,...process.argv.slice(2)],{stdio:'inherit',shell:false});
if(result.error)throw result.error;
process.exitCode=result.status??1;
