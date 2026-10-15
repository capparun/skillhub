import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import {validateExpectedRelease, lockExpectedLiepinRelease} from './lib/liepin-release-guard.mjs';
const args=process.argv.slice(2);
const option=name=>{const i=args.indexOf(name);return i<0?null:args[i+1];};
const expectedId=option('--expected-current-release-id'),expectedSha=option('--expected-current-sha256');
const restoreId=option('--restore-release-id'),restoreSha=option('--restore-sha256');
validateExpectedRelease(expectedId,expectedSha);
validateExpectedRelease(restoreId,restoreSha);
if(restoreId===expectedId)throw new Error('Restore and current release must differ');
if(!process.env.DATABASE_URL||!process.env.PACKAGE_STORAGE_DIR)throw new Error('Missing release environment');
const client=new pg.Client({connectionString:process.env.DATABASE_URL});
await client.connect();
try{
 await client.query('BEGIN');
 const productId=await lockExpectedLiepinRelease(client,expectedId,expectedSha);
 const {rows}=await client.query('SELECT id, version, package_key, package_sha256 FROM releases WHERE id = $1 AND product_id = $2 FOR UPDATE',[restoreId,productId]);
 const target=rows[0];
 if(!target||target.package_sha256!==restoreSha)throw new Error('Rollback identity mismatch');
 if(!/^liepin-search\/\d+\.\d+\.\d+\/[a-z0-9.-]+\.tar\.gz$/.test(target.package_key))throw new Error('Invalid rollback package key');
 const sha=crypto.createHash('sha256').update(fs.readFileSync(path.join(process.env.PACKAGE_STORAGE_DIR,target.package_key))).digest('hex');
 if(sha!==restoreSha)throw new Error('Rollback package checksum mismatch');
 if(args.includes('--check-only')){
  await client.query('ROLLBACK');console.log(JSON.stringify({checked:true,restored:false,version:target.version}));
 }else{
  const {rows:admins}=await client.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1");
  if(!admins[0])throw new Error('No active admin to record rollback');
  await client.query('UPDATE releases SET is_published = false WHERE id = $1',[expectedId]);
  await client.query('UPDATE releases SET is_published = true, published_at = now() WHERE id = $1',[restoreId]);
  await client.query("INSERT INTO admin_audit_log (actor_user_id, action, target_type, target_id, metadata) VALUES ($1, 'release.rollback', 'release', $2, $3)",[admins[0].id,restoreId,JSON.stringify({productSlug:'liepin-search',fromReleaseId:expectedId,version:target.version,sha256:sha,method:'authorized-zeabur-cli'})]);
  await client.query('COMMIT');console.log(JSON.stringify({restored:true,version:target.version,releaseId:restoreId}));
 }
}catch(error){await client.query('ROLLBACK');throw error;}finally{await client.end();}
