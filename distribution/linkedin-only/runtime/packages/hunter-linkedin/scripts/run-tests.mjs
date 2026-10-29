import {readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
const directory=fileURLToPath(new URL('../test/',import.meta.url));
const files=readdirSync(directory).filter(name=>/\.test\.(?:js|mjs)$/.test(name)).sort().map(name=>fileURLToPath(new URL('../test/'+name,import.meta.url)));
if(!files.length)throw Error('No offline tests found');
const run=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(run.error)throw run.error;process.exitCode=run.status??1;
