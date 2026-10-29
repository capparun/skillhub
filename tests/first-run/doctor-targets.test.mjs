import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,mkdir,writeFile,rm,symlink} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {resolveDoctorTargets} from '../../distribution/linkedin-only/target-distribution.mjs';
test('persisted doctor uses installation receipt rather than current Agent environment',async()=>{
 const root=await mkdtemp(join(tmpdir(),'doctor-target-'));
 const script=join(root,'packages','soho-sourcing','doctor.mjs');
 try{
  await mkdir(join(root,'installations'));
  const receipt=join(root,'installations','soho-sourcing.json');
  const record={product:'soho-sourcing',agent:'workbuddy',skillTargets:[join(root,'original-skills')],stateTarget:root};
  assert.throws(()=>resolveDoctorTargets(script,'soho-sourcing'),{code:'installation_receipt_unavailable'});
  await writeFile(receipt,JSON.stringify(record));
  const targets=resolveDoctorTargets(script,'soho-sourcing',[],{CODEX_HOME:'/unrelated',HUNTER_SKILLS_DIR:'/wrong'});
  assert.deepEqual(targets.skillRoots,record.skillTargets);assert.equal(targets.stateRoot,root);
  assert.equal(targets.detectedAgent,'workbuddy');
  assert.deepEqual(resolveDoctorTargets(script,'soho-sourcing',['--skills-dir',join(root,'explicit')],{}).skillRoots,[join(root,'explicit')]);
  for(const mutation of [{product:'other'},{stateTarget:join(root,'other')},{skillTargets:['relative']}]){
   await writeFile(receipt,JSON.stringify({...record,...mutation}));
   assert.throws(()=>resolveDoctorTargets(script,'soho-sourcing'),{code:'installation_receipt_mismatch'});
  }
 }finally{await rm(root,{recursive:true,force:true});}
});
test('receipt comparison follows symlinks instead of literal paths',async()=>{
 const base=await mkdtemp(join(tmpdir(),'doctor-symlink-'));
 const real=join(base,'state');
 const link=join(base,'linked-state');
 try{
  await mkdir(join(real,'packages','soho-sourcing'),{recursive:true});
  await mkdir(join(real,'installations'));
  await symlink(real,link,'dir');
  const record={product:'soho-sourcing',agent:'auto',skillTargets:[join(real,'skills')],stateTarget:link};
  await writeFile(join(real,'installations','soho-sourcing.json'),JSON.stringify(record));
  // Node reports the canonical path for module URLs; the receipt keeps the user's symlinked path.
  const targets=resolveDoctorTargets(join(real,'packages','soho-sourcing','doctor.mjs'),'soho-sourcing');
  assert.equal(targets.stateRoot,real);
 }finally{await rm(base,{recursive:true,force:true});}
});
