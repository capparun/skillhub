// 数据库集成测试:兑换原子性、会话过期、发布切换。
// 需要一个空的 Postgres(TEST_DATABASE_URL 指向),测试会自己应用 0001_init.sql。
// 本地: docker run -p 55432:5432 -e POSTGRES_PASSWORD=test postgres:16-alpine
//       TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/postgres npm run test:db
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';
import { hashPassword } from '../src/lib/server/passwords';
import { randomToken } from '../src/lib/server/tokens';

const TEST_DB = process.env.TEST_DATABASE_URL;
const skipOpts = TEST_DB ? {} : { skip: 'TEST_DATABASE_URL 未设置,跳过集成测试' };

process.env.DATABASE_URL = TEST_DB ?? 'postgresql://invalid:5432/none';
process.env.SESSION_SECRET = 'test-secret';
process.env.PUBLIC_APP_URL = 'http://localhost:3000';

const client = new pg.Client({ connectionString: TEST_DB });

let userId: string;
let productId: string;

async function resetSchema() {
  const sql = fs.readFileSync(
    path.resolve(__dirname, '../db/migrations/0001_init.sql'),
    'utf8',
  );
  await client.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await client.query(sql);
}

before(async () => {
  if (!TEST_DB) return;
  await client.connect();
  await resetSchema();
  const u = await client.query(
    `INSERT INTO users (email, password_hash, display_name) VALUES ($1, $2, $3) RETURNING id`,
    ['customer@example.com', hashPassword('pw'), '测试客户'],
  );
  userId = u.rows[0].id;
  const p = await client.query(
    `INSERT INTO products (slug, name, description, is_public) VALUES ('soho-sourcing', '寻访', '付费', false) RETURNING id`,
  );
  productId = p.rows[0].id;
  await client.query(
    `INSERT INTO entitlements (user_id, product_id, expires_at) VALUES ($1, $2, now() + interval '365 days')`,
    [userId, productId],
  );
  await client.query(
    `INSERT INTO releases (product_id, version, package_key, package_sha256, is_published, published_at)
     VALUES ($1, '2.0.0', 'soho-sourcing/2.0.0/pkg.tar.gz', $2, true, now())`,
    [productId, 'a'.repeat(64)],
  );
});

after(async () => {
  if (!TEST_DB) return;
  await client.end();
});

test('并发兑换同一令牌:恰好一笔成功', skipOpts, async () => {
  const { plain, hash } = randomToken('hunter_it');
  await client.query(
    `INSERT INTO install_tokens (user_id, product_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '10 minutes')`,
    [userId, productId, hash],
  );

  const { POST: redeem } = await import(
    '../src/app/api/install-tokens/[token]/redeem/route'
  );
  const req = () => new Request('http://localhost/api', { method: 'POST' });
  const params = Promise.resolve({ token: plain });

  const results = await Promise.all([
    redeem(req(), { params }),
    redeem(req(), { params }),
    redeem(req(), { params }),
  ]);
  const statuses = results.map((r) => r.status).sort();
  assert.deepEqual(statuses, [200, 410, 410]);

  const body = await results.find((r) => r.status === 200)!.json();
  assert.ok(body.downloadUrl.includes('/api/download/soho-sourcing/2.0.0/'));
  assert.ok(body.updateCredential.startsWith('hunter_uc_'));
  assert.equal(body.release.version, '2.0.0');

  // 轮换后的更新凭据可以用来取下载地址
  const { POST: authorize } = await import('../src/app/api/updates/authorize/route');
  const authRes = await authorize(
    new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productSlug: 'soho-sourcing', credential: body.updateCredential }),
    }),
  );
  assert.equal(authRes.status, 200);
});

test('授权被撤销后兑换失败且令牌恢复未用状态', skipOpts, async () => {
  await client.query(
    `UPDATE entitlements SET status = 'revoked' WHERE user_id = $1 AND product_id = $2`,
    [userId, productId],
  );
  const { plain, hash } = randomToken('hunter_it');
  await client.query(
    `INSERT INTO install_tokens (user_id, product_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() + interval '10 minutes')`,
    [userId, productId, hash],
  );
  const { POST: redeem } = await import(
    '../src/app/api/install-tokens/[token]/redeem/route'
  );
  const res = await redeem(new Request('http://localhost/api', { method: 'POST' }), {
    params: Promise.resolve({ token: plain }),
  });
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, 'entitlement_revoked');

  // 事务回滚,令牌仍是 issued,可在授权恢复后重试
  const row = await client.query(`SELECT status FROM install_tokens WHERE token_hash = $1`, [hash]);
  assert.equal(row.rows[0].status, 'issued');

  await client.query(
    `UPDATE entitlements SET status = 'active' WHERE user_id = $1 AND product_id = $2`,
    [userId, productId],
  );
});

test('过期令牌兑换返回 410', skipOpts, async () => {
  const { plain, hash } = randomToken('hunter_it');
  await client.query(
    `INSERT INTO install_tokens (user_id, product_id, token_hash, expires_at)
     VALUES ($1, $2, $3, now() - interval '1 minute')`,
    [userId, productId, hash],
  );
  const { POST: redeem } = await import(
    '../src/app/api/install-tokens/[token]/redeem/route'
  );
  const res = await redeem(new Request('http://localhost/api', { method: 'POST' }), {
    params: Promise.resolve({ token: plain }),
  });
  assert.equal(res.status, 410);
});

test('无效更新凭据被拒绝', skipOpts, async () => {
  const { POST: authorize } = await import('../src/app/api/updates/authorize/route');
  const res = await authorize(
    new Request('http://localhost/api', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productSlug: 'soho-sourcing', credential: 'hunter_uc_garbage' }),
    }),
  );
  assert.equal(res.status, 403);
  const body = await res.json();
  assert.equal(body.error.code, 'credential_invalid');
});
