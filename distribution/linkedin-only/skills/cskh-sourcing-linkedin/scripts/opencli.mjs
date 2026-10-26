import fs from 'node:fs';
import {spawnSync} from 'node:child_process';
const receipt=new URL('./opencli-entry.json',import.meta.url);
if(!fs.existsSync(receipt))throw Error('Install LinkedIn before running this skill');
const {entry}=JSON.parse(fs.readFileSync(receipt,'utf8'));
if(typeof entry!=='string'||!fs.existsSync(entry))throw Error('Installed runtime missing; reinstall LinkedIn');
const r=spawnSync(process.execPath,[entry,...process.argv.slice(2)],{stdio:'inherit',shell:false});
if(r.error)throw r.error;
process.exitCode=r.status??1;
