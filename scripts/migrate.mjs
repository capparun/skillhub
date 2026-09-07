#!/usr/bin/env node
// 数据库迁移脚本:按序执行 db/migrations/*.sql,记录在 schema_migrations 表。
// 用法: DATABASE_URL=postgres://... node scripts/migrate.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const migrationsDir = path.join(root, 'db', 'migrations');

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('缺少 DATABASE_URL 环境变量');
  process.exit(1);
}

const client = new pg.Client({ connectionString: databaseUrl });

async function main() {
  await client.connect();
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )
  `);

  const applied = new Set(
    (await client.query('SELECT name FROM schema_migrations')).rows.map((r) => r.name),
  );

  const files = fs
    .readdirSync(migrationsDir)
    .filter((f) => f.endsWith('.sql'))
    .sort();

  let count = 0;
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, file), 'utf8');
    console.log(`执行迁移 ${file} ...`);
    await client.query('BEGIN');
    try {
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    }
    count += 1;
  }

  console.log(count > 0 ? `完成,共执行 ${count} 个迁移。` : '没有待执行的迁移。');
}

main()
  .catch((err) => {
    console.error('迁移失败:', err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
