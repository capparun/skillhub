import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const script=fileURLToPath(new URL('../../scripts/sync-linkedin-skills.mjs',import.meta.url));
test('installed Skill mirrors match the single source',()=>{
 const run=spawnSync(process.execPath,[script,'--check'],{encoding:'utf8',timeout:10000});
 assert.equal(run.status,0,run.stderr||run.stdout);
});
