// Run inside the deployed hunterskill service after deploying the reviewed artifact.
// DATABASE_URL and PACKAGE_STORAGE_DIR stay inside the container.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';
import {validateExpectedRelease, lockExpectedLinkedinRelease} from './lib/linkedin-release-guard.mjs';

const args=process.argv.slice(2);
const option=name=>{const index=args.indexOf(name);return index<0?null:args[index+1];};
const version=option('--version');
if(!/^\d+\.\d+\.\d+$/.test(version??''))throw new Error('Specify a formal version: --version X.Y.Z; preview publication is prohibited');
const artifactDir=path.resolve(option('--artifact-dir')??'/app/public/download');
const release = JSON.parse(fs.readFileSync(path.join(artifactDir,`soho-sourcing-v${version}.json`), 'utf8'));
if(release.product!=='soho-sourcing'||release.version!==version||release.file!==`soho-sourcing-v${version}.tar.gz`
 || !/^[a-f0-9]{64}$/.test(release.sha256??'') || !Number.isSafeInteger(release.sizeBytes)||release.sizeBytes<1)
 throw new Error('Invalid release identity or manifest');
const source = path.join(artifactDir, release.file);
const bytes = fs.readFileSync(source);
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
if (sha !== release.sha256 || bytes.length !== release.sizeBytes) throw new Error('Artifact checksum mismatch');
if(args.includes('--check-only')){
 console.log(JSON.stringify({checked:true,published:false,...release}));
 process.exit(0);
}
const expectedId=option('--expected-current-release-id');
const expectedSha=option('--expected-current-sha256');
validateExpectedRelease(expectedId, expectedSha);
const notesFile=option('--notes-file');
const notes=notesFile?fs.readFileSync(path.resolve(notesFile),'utf8').trim():version==='0.1.1'
 ?'安装诊断修复：子进程启动失败标为未验证，不误报未安装；业务插件版本保持 0.1.0。':null;
if(!notes || notes.length>20000)throw new Error('Provide reviewed release notes: --notes-file <file>');
if (!process.env.PACKAGE_STORAGE_DIR || !process.env.DATABASE_URL) throw new Error('Missing release environment');
const key = `${release.product}/${release.version}/${release.file}`;
const destination = path.join(process.env.PACKAGE_STORAGE_DIR, key);
fs.mkdirSync(path.dirname(destination), { recursive: true });
if (fs.existsSync(destination)) {
  if (crypto.createHash('sha256').update(fs.readFileSync(destination)).digest('hex') !== sha) throw new Error('Existing release file differs; choose a new version');
} else {
  fs.copyFileSync(source, destination, fs.constants.COPYFILE_EXCL);
}
const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
await client.connect();
try {
  await client.query('BEGIN');
  const { rows: admins } = await client.query("SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY created_at LIMIT 1");
  if (!admins[0]) throw new Error('No active admin to record publication');
  const productId = await lockExpectedLinkedinRelease(client, expectedId, expectedSha);
  const { rows: previous } = await client.query('SELECT id, package_sha256, is_published FROM releases WHERE product_id = $1 AND version = $2 FOR UPDATE', [productId, release.version]);
  if (previous[0] && previous[0].package_sha256 !== sha) throw new Error('Version already exists with different contents');
  if (previous[0]?.is_published) {
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ alreadyPublished: true, ...release }));
  } else {
    const { rows } = previous[0] ? { rows: previous } : await client.query(
      `INSERT INTO releases (product_id, version, package_key, package_sha256, package_size_bytes, release_notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`, [productId, release.version, key, sha, bytes.length, notes, admins[0].id],
    );
    await client.query('UPDATE releases SET is_published = false WHERE product_id = $1 AND is_published', [productId]);
    await client.query('UPDATE releases SET is_published = true, published_at = now() WHERE id = $1', [rows[0].id]);
    await client.query(`INSERT INTO admin_audit_log (actor_user_id, action, target_type, target_id, metadata) VALUES ($1, 'release.published', 'release', $2, $3)`, [admins[0].id, rows[0].id, JSON.stringify({ productSlug: release.product, version: release.version, sha256: sha, method: 'authorized-zeabur-cli' })]);
    await client.query('COMMIT');
    console.log(JSON.stringify({ published: true, ...release }));
  }
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  await client.end();
}
