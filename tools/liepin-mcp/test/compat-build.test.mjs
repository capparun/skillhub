import test from 'node:test';
import assert from 'node:assert/strict';
import {verifyCompatManifest,COMPAT_NAME,COMPAT_VERSION_NAME} from '../lib/compat-build.mjs';
import {BrowserClient} from '../lib/client.mjs';
const manifest={name:COMPAT_NAME,version:'0.0.22',version_name:COMPAT_VERSION_NAME,background:{service_worker:'background.js',type:'module'}};
test('runtime build declaration identifies only the pinned compatibility build',()=>{
 assert.equal(verifyCompatManifest(manifest).verification,'declared-build-metadata');
 for(const changed of [{name:'opencli-mcp Runtime diagnostic'},{version_name:undefined},{version_name:'other'},{background:{service_worker:'other.js',type:'module'}}])assert.throws(()=>verifyCompatManifest({...manifest,...changed}),/构建标识/);
});
test('client verification reads manifest only and rejects stale diagnostic builds',async()=>{
 const client=new BrowserClient();let calls=0;
 client.js=async code=>{calls++;assert.match(code,/runtime.getManifest/);return {...manifest,version_name:undefined};};
 await assert.rejects(client.verify(),/构建标识/);assert.equal(calls,1);
 client.js=async()=>manifest;assert.equal((await client.verify()).build,COMPAT_VERSION_NAME);
});
test('the compatible extension has one fixed public loader identity across build paths',async()=>{
 const {COMPAT_PUBLIC_KEY,COMPAT_EXTENSION_ID}=await import('../lib/compat-build.mjs');const {createHash,createPublicKey}=await import('node:crypto');
 const der=Buffer.from(COMPAT_PUBLIC_KEY,'base64');assert.equal(createPublicKey({key:der,format:'der',type:'spki'}).asymmetricKeyType,'rsa');
 const id=[...createHash('sha256').update(der).digest().subarray(0,16)].map(byte=>'abcdefghijklmnop'[byte>>4]+'abcdefghijklmnop'[byte&15]).join('');
 assert.equal(COMPAT_EXTENSION_ID,'ebhhcfiikojppnmkimkhcajpieelbglb');assert.equal(id,COMPAT_EXTENSION_ID);
});
