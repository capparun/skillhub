import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const base=new URL('../../distribution/linkedin-only/',import.meta.url);
test('all shipped LinkedIn skill copies share the same discoverability contract',()=>{
 const roots=['skills/','runtime/skills/','runtime/packages/linkedin-workflow/skills/'];
 const guides=roots.map(root=>fs.readFileSync(new URL(root+'cskh-linkedin/references/capability-use.md',base),'utf8'));
 assert.equal(new Set(guides).size,1);
 for(const root of roots){const skill=fs.readFileSync(new URL(root+'cskh-linkedin/SKILL.md',base),'utf8');assert.ok(skill.includes('references/capability-use.md'));assert.ok(!skill.includes('必须使用的任务记录流程'));}
 // Every copy of a shipped skill must carry the same guidance; a stale mirror silently contradicts the installed one.
 const shared=fs.readdirSync(new URL('skills/',base)).filter(id=>roots.every(root=>fs.existsSync(new URL(root+id+'/SKILL.md',base))));
 assert.ok(shared.length>=3);
 for(const id of shared){
  const copies=roots.map(root=>fs.readFileSync(new URL(root+id+'/SKILL.md',base),'utf8'));
  assert.equal(new Set(copies).size,1,`${id} SKILL.md differs between shipped copies`);
 }
});
test('runtime skill mirror carries no unreferenced pagination note',()=>{
 const runtime=new URL('runtime/skills/cskh-linkedin/',base);
 assert.ok(!fs.existsSync(new URL('references/ordinary-pagination.md',runtime)));
});
