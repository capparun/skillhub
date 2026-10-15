import test from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
const module=new URL('../lib/connection.js',import.meta.url).href;
test('experimental transport is explicit and still requires its capability marker',()=>{
 const code=`const m=await import(${JSON.stringify(module)}); console.log(JSON.stringify({session:m.LIEPIN_SESSION,plain:m.matchesConnection({}),experimental:m.matchesConnection({connectionMode:'hunter-mainframe-v1'})}));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,HUNTER_LIEPIN_CONNECTION:'experimental'}});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{session:'liepin-compat-mainframe',plain:false,experimental:true});
});
test('invalid transport choice fails before connecting a browser',()=>{
 const result=spawnSync(process.execPath,['--input-type=module','-e',`await import(${JSON.stringify(module)});`],{encoding:'utf8',env:{...process.env,HUNTER_LIEPIN_CONNECTION:'invalid'}});
 assert.notEqual(result.status,0);assert.match(result.stderr,/must be official, official-managed or experimental/);
});
test('managed search retains only its own lease; borrowed detail cleanup still releases',()=>{
 const factory=new URL('../lib/page-connection.js',import.meta.url).href;
 const code=`const m=await import(${JSON.stringify(module)});const {createLiepinPage}=await import(${JSON.stringify(factory)});let releases=0;const createPage=()=>({closeWindow:async()=>{releases++;}});const parent=await createLiepinPage({session:m.LIEPIN_MANAGED_SESSION,createPage});await parent.closeWindow();const retained=releases===0;const read=await createLiepinPage({createPage});await read.closeWindow();const child=await createLiepinPage({session:m.LIEPIN_DETAIL_SESSION,createPage});await child.closeWindow();console.log(JSON.stringify({retained,releases,session:m.LIEPIN_SESSION,mode:m.LIEPIN_MANAGED,connection:m.LIEPIN_CONNECTION}));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,HUNTER_LIEPIN_CONNECTION:'official-managed'}});
 assert.equal(result.status,0,result.stderr);assert.deepEqual(JSON.parse(result.stdout),{retained:true,releases:2,session:'liepin-official-search-read',mode:true,connection:'official'});
});

test('owned plugin search requests the official persistent adapter lifecycle and explicit disconnect can release it',()=>{
 const factory=new URL('../lib/page-connection.js',import.meta.url).href;
 const code=`const m=await import(${JSON.stringify(module)});const {createLiepinPage}=await import(${JSON.stringify(factory)});const calls=[];let releases=0;const createPage=(...args)=>{calls.push(args);return {closeWindow:async()=>{releases++;}}};await createLiepinPage({session:m.LIEPIN_MANAGED_SESSION,createPage});await createLiepinPage({createPage});const cleanup=await createLiepinPage({session:m.LIEPIN_MANAGED_SESSION,createPage,retain:false});await cleanup.closeWindow();console.log(JSON.stringify({routes:calls.map(a=>({surface:a[4],lifecycle:a[5]})),releases}));`;
 const result=spawnSync(process.execPath,['--input-type=module','-e',code],{encoding:'utf8',env:{...process.env,HUNTER_LIEPIN_CONNECTION:'official-managed'}});
 assert.equal(result.status,0,result.stderr);
 assert.deepEqual(JSON.parse(result.stdout),{routes:[{surface:'adapter',lifecycle:'persistent'},{surface:'browser',lifecycle:'persistent'},{surface:'adapter',lifecycle:'persistent'}],releases:1});
});
