import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {sessionBinding,requestFingerprint,writeSearchCursor,readSearchCursor} from '../lib/ordinary-search-cursor.js';
test('cursor is private, checksummed, bound to current session/query and expires',t=>{
 const directory=fs.mkdtempSync(path.join(os.tmpdir(),'ordinary-search-cursor-'));t.after(()=>fs.rmSync(directory,{recursive:true,force:true}));
 const binding=sessionBinding([{name:'li_at',value:'synthetic-test-cookie'}]),requestKey=requestFingerprint({keyword:'engineer',location:'Singapore'});
 const file=writeSearchCursor({directory,binding,requestKey,progress:{page:2,results:[]},now:100});
 const options={binding,requestKey,now:101};assert.equal(readSearchCursor(file,options).page,2);if(process.platform!=='win32')assert.equal(fs.statSync(file).mode&0o077,0);
 assert.ok(!fs.readFileSync(file,'utf8').includes('synthetic-test-cookie'));
 assert.throws(()=>readSearchCursor(file,{...options,binding:'other'}),{code:'search_cursor_account_mismatch'});
 assert.throws(()=>readSearchCursor(file,{...options,requestKey:'other'}),{code:'search_cursor_query_mismatch'});
 assert.throws(()=>readSearchCursor(file,{...options,now:1800101}),{code:'search_cursor_expired'});
 const data=JSON.parse(fs.readFileSync(file));data.data.progress.page=4;fs.writeFileSync(file,JSON.stringify(data));assert.throws(()=>readSearchCursor(file,options),{code:'invalid_search_cursor'});
});
test('missing authentication and relative cursor paths fail before collection',()=>{
 assert.throws(()=>sessionBinding([]),{code:'not_logged_in'});
 assert.throws(()=>readSearchCursor('relative.json',{}),{code:'invalid_search_cursor'});
 assert.equal(requestFingerprint({a:1,b:2}),requestFingerprint({b:2,a:1}));
});
