import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {windowsFreeInstallPrompt} from '../src/lib/prompts';
test('LinkedIn install instructions enforce the bundled Node requirement',()=>{
 const text=windowsFreeInstallPrompt({appUrl:'https://example.com',productName:'LinkedIn',productSlug:'soho-sourcing',version:'2.1.1',sha256:'a'.repeat(64)});
 assert.match(text,/Node.js 22/);
});
test('LinkedIn release archive matches metadata and fixed dependencies',()=>{
 const meta=JSON.parse(fs.readFileSync('public/download/soho-sourcing-v2.1.1.json','utf8'));
 const data=fs.readFileSync('public/download/'+meta.file);
 assert.equal(createHash('sha256').update(data).digest('hex'),meta.sha256);
 assert.equal(data.length,meta.sizeBytes);
 const pkg=JSON.parse(fs.readFileSync('distribution/linkedin-only/runtime/package.json','utf8'));
 assert.equal(pkg.dependencies['@jackwener/opencli'],'2.0.1');
 assert.equal(pkg.dependencies['@cskh/linkedin-salesnav'],'2.1.1');
 const commands=JSON.parse(fs.readFileSync('distribution/linkedin-only/runtime/packages/linkedin-workflow/src/plugin/external-commands.json','utf8'));
 for(const c of commands)assert.ok(fs.existsSync('distribution/linkedin-only/runtime/skills/'+c.skill+'/scripts/'+c.name+'.mjs'),c.name);
});
