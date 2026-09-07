#!/usr/bin/env node
// 种子脚本:插入两个首发商品 + 首位管理员。幂等,可重复执行。
// 用法: DATABASE_URL=... ADMIN_EMAIL=... ADMIN_INITIAL_PASSWORD=... node scripts/seed.mjs
import crypto from 'node:crypto';
import pg from 'pg';

const { DATABASE_URL, ADMIN_EMAIL, ADMIN_INITIAL_PASSWORD } = process.env;
if (!DATABASE_URL) {
  console.error('缺少 DATABASE_URL 环境变量');
  process.exit(1);
}

// 与 src/lib/server/passwords.ts 相同的 scrypt 格式(脚本独立,不引用 TS 源码)
function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 32, { N: 16384, r: 8, p: 1 });
  return `scrypt$16384$8$1$${salt.toString('base64')}$${hash.toString('base64')}`;
}

// 现阶段两个技能均免登录公开发放(isPublic 均为 true);付费授权链路(一次性令牌、
// 更新凭据、授权校验)保留在代码中。恢复收费时把 soho-sourcing 的 isPublic 改回 false 即可。
const PRODUCTS = [
  {
    slug: 'hunter-align',
    name: '职位需求对齐',
    description:
      'JD 诊断、关键问题追问、人才画像、搜索方向与寻访任务书。无需登录即可安装和更新。',
    isPublic: true,
  },
  {
    slug: 'soho-sourcing',
    name: 'SOHO 猎头人才寻访工作流',
    description: 'LinkedIn 寻访、候选人匹配排序、候选人初评与寻访报告。',
    isPublic: true,
  },
];

const client = new pg.Client({ connectionString: DATABASE_URL });

async function main() {
  await client.connect();

  for (const p of PRODUCTS) {
    await client.query(
      `INSERT INTO products (slug, name, description, is_public)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (slug) DO UPDATE
         SET name = EXCLUDED.name, description = EXCLUDED.description,
             is_public = EXCLUDED.is_public, updated_at = now()`,
      [p.slug, p.name, p.description, p.isPublic],
    );
    console.log(`商品已就绪: ${p.slug}`);
  }

  const adminCount = await client.query(
    "SELECT count(*)::int AS n FROM users WHERE role = 'admin'",
  );
  if (adminCount.rows[0].n > 0) {
    console.log('已存在管理员账号,跳过管理员创建。');
    return;
  }
  if (!ADMIN_EMAIL || !ADMIN_INITIAL_PASSWORD) {
    console.log('未提供 ADMIN_EMAIL / ADMIN_INITIAL_PASSWORD,跳过管理员创建。');
    return;
  }
  await client.query(
    `INSERT INTO users (email, password_hash, display_name, role)
     VALUES ($1, $2, $3, 'admin')`,
    [ADMIN_EMAIL.toLowerCase(), hashPassword(ADMIN_INITIAL_PASSWORD), '管理员'],
  );
  console.log(`管理员已创建: ${ADMIN_EMAIL.toLowerCase()}(请尽快登录后台修改密码)`);
}

main()
  .catch((err) => {
    console.error('种子数据失败:', err.message);
    process.exitCode = 1;
  })
  .finally(() => client.end());
