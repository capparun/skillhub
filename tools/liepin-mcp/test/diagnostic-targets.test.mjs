import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {diagnosticTargets,observedDiagnosticTargets} from '../scripts/diagnostic-targets.mjs';
const rows=['a','b','b','c'].map(resumeId=>({resumeId}));
test('read-only target one selects one even though no favorites are added',()=>{
 assert.deepEqual(diagnosticTargets(rows,{remaining:1}).map(r=>r.resumeId),['a']);
 assert.deepEqual(diagnosticTargets(rows,{remaining:0}),[]);
});
test('continuation excludes completed identities and duplicates without dropping unread people',()=>{
 const done=new Set(['a']);assert.deepEqual(diagnosticTargets(rows,{remaining:2,done}).map(r=>r.resumeId),['b','c']);
 assert.deepEqual([...done],['a']);
});
test('diagnostic CLI refuses writes before reading installation or accessing browser',()=>{
 const result=spawnSync(process.execPath,[new URL('../scripts/source-click.mjs',import.meta.url).pathname,'--dry-run','false'],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/仅用于只读验收/);
});
test('diagnostic CLI does not invent keyword or authorization from a previous customer',()=>{
 const result=spawnSync(process.execPath,[new URL('../scripts/source-click.mjs',import.meta.url).pathname],{encoding:'utf8'});
 assert.notEqual(result.status,0);assert.match(result.stderr,/真实 --authorization/);
});

test('linked list records use canonical computed observation IDs, not absent raw IDs',()=>{
 const observation={stage:'list',roundId:'trial',hash:'saved-hash',data:{page:1,cardSelector:'.card',detailTarget:'.name',summary:'synthetic'}};
 const task={candidates:[{key:'liepin:sample',source:'liepin',observations:[observation]}],unlinkedObservations:[]};
 const [target]=observedDiagnosticTargets(task,1);
 assert.match(target.id,/^[a-f0-9]{64}$/);assert.equal(target.hash,'saved-hash');assert.equal(target.resumeId,'sample');
 assert.deepEqual(observedDiagnosticTargets(task,2),[]);
});
