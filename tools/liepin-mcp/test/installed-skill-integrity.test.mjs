import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import os from 'node:os';import path from 'node:path';
import {verifyInstalledSkills} from '../scripts/customer-install.mjs';import {buildPackage} from '../scripts/build-package.mjs';
test('doctor verifies shipped Skill and reference bytes instead of entry existence',t=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'liepin-skill-integrity-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const pkg=buildPackage(path.join(root,'package'),{delivery:'site-adapter'}),source=path.join(pkg.root,'tools/liepin-mcp/skill/hunter-liepin-mcp'),destination=path.join(root,'installed-skill');fs.cpSync(source,destination,{recursive:true});
 const record={directory:pkg.root,skillTargets:[{destination}]};assert.ok(verifyInstalledSkills(record).filesPerTarget>1);
 for(const relative of ['SKILL.md','references/workflow.md']){
  const file=path.join(destination,relative),original=fs.readFileSync(file);fs.appendFileSync(file,'\nmodified\n');assert.throws(()=>verifyInstalledSkills(record),/已变化/);fs.writeFileSync(file,original);
 }
 assert.equal(verifyInstalledSkills(record).targets,1);
 const target=path.join(destination,'SKILL.md');fs.unlinkSync(target);assert.throws(()=>verifyInstalledSkills(record));
});
