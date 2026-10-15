// Run inside the deployed hunterskill service after deploying the reviewed artifact.
// DATABASE_URL and PACKAGE_STORAGE_DIR stay inside the container.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import pg from 'pg';

const release = JSON.parse(fs.readFileSync('/app/public/download/gllue-only-v1.3.0.json', 'utf8'));
const source = path.join('/app/public/download', release.file);
const bytes = fs.readFileSync(source);
const sha = crypto.createHash('sha256').update(bytes).digest('hex');
if (sha !== release.sha256 || bytes.length !== release.sizeBytes) throw new Error('Artifact checksum mismatch');
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
  const { rows: products } = await client.query(
    `INSERT INTO products (slug, name, description, is_public) VALUES ($1, $2, $3, true)
     ON CONFLICT (slug) DO UPDATE SET name = EXCLUDED.name, description = EXCLUDED.description, updated_at = now()
     RETURNING id, is_public`,
    [release.product, 'Gllue 人才库', '谷露人才库查询、LinkedIn 候选人查重、审核报告与逐项授权维护。Windows / macOS / Linux 安装。'],
  );
  if (!products[0].is_public) throw new Error('Existing product is private; refusing to change access');
  const productId = products[0].id;
  const { rows: previous } = await client.query('SELECT id, package_sha256, is_published FROM releases WHERE product_id = $1 AND version = $2 FOR UPDATE', [productId, release.version]);
  if (previous[0] && previous[0].package_sha256 !== sha) throw new Error('Version already exists with different contents');
  if (previous[0]?.is_published) {
    await client.query('ROLLBACK');
    console.log(JSON.stringify({ alreadyPublished: true, ...release }));
  } else {
    const notes = 'Gllue 独立交付包 1.3.0，包含 cskh-gllue 和 15 命令插件。源码 f9df3a5 的 Windows Node 20/22 测试、打包及注册已通过；本站安装要求 Node 22+，PowerShell 安装无需 Bash。本站完整 PowerShell 5.1/7 安装、doctor、中文空格路径及临时目录清理后命令复验通过（Actions 38675148940）。客户租户浏览器连接与首次只读查询需单独确认。';
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
