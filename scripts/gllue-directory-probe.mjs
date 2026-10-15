import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {replaceDirectory} from '../distribution/gllue-only/directory-distribution.mjs';
for (const name of ['ascii','中文 空格']) for (const linked of [false,true]) {
 const source=fs.mkdtempSync(path.join(os.tmpdir(),'gllue-probe-'));
 const destination=path.join(process.env.RUNNER_TEMP||os.tmpdir(),name+'-'+linked,'runtime');
 fs.mkdirSync(path.join(source,'packages/gllue'),{recursive:true});
 fs.mkdirSync(path.join(source,'node_modules'),{recursive:true});
 fs.writeFileSync(path.join(source,'packages/gllue/package.json'),JSON.stringify({name:'gllue'}));
 fs.writeFileSync(path.join(source,'packages/gllue/marker'),'ok');
 if(linked)fs.symlinkSync(path.join(source,'packages/gllue'),path.join(source,'node_modules/gllue'),process.platform==='win32'?'junction':'dir');
 try {replaceDirectory(source,destination);fs.rmSync(source,{recursive:true,force:true});console.log('PROBE',name,linked,'passed',fs.readFileSync(path.join(destination,linked?'node_modules/gllue/marker':'packages/gllue/marker'),'utf8'));}
 catch(e){console.log('PROBE',name,linked,'FAILED',e.message);process.exitCode=1;}
}
