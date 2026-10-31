import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
// Enumerate explicitly: Windows shells do not expand the POSIX test/*.mjs glob.
const directory=fileURLToPath(new URL('../test/',import.meta.url));
const files=fs.readdirSync(directory).filter(name=>name.endsWith('.test.mjs')).sort().map(name=>path.join(directory,name));
if(!files.length)throw Error('未发现 MCP 测试文件');
const result=spawnSync(process.execPath,['--test',...files],{stdio:'inherit'});
if(result.error)throw result.error;
process.exitCode=result.status??1;
