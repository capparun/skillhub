import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {runProcess, normalize} from '../../distribution/linkedin-only/runtime/packages/linkedin-workflow/src/linkedin/gateway.mjs';
const host=process.env.OPENCLI_CONTRACT_HOST;
const request={provider:'linkedin',operation:'person.search'};
test('pinned OpenCLI real JSON renderer to gateway, without browser', {skip:!host},async()=>{
 const metadata=JSON.parse(fs.readFileSync(path.join(host,'package.json'),'utf8'));
 assert.equal(metadata.version,'2.0.1');
 const output=pathToFileURL(path.join(host,'dist/src/output.js')).href;
 const code=`import {render} from ${JSON.stringify(output)};render({candidates:[{name:'Synthetic Person',profileUrl:'https://www.linkedin.com/in/synthetic/'}]}, {fmt:'json'});`;
 const raw=await runProcess({executable:process.execPath,args:['--input-type=module','-e',code]});
 assert.equal(raw.ok,true);
 assert.equal(normalize(request,raw).data.results.length,1);
});
test('unwrapped output is not silently accepted as successful execution',async()=>{
 const raw=await runProcess({executable:process.execPath,args:['-e','console.log(JSON.stringify({candidates:[]}))']});
 assert.throws(()=>normalize(request,raw),{code:'invalid_response'});
});
