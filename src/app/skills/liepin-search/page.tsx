import type { Metadata } from 'next';
import { connection } from 'next/server';
import { query } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { LiepinInstallGuide } from './guide';

export const metadata: Metadata = {
  title: '猎聘搜索 · 独立安装与使用引导｜猎策',
  description: '在猎聘猎头端准备筛选、搜索候选人、读取结果和管理搜索方案。独立安装，支持本地 Agent。',
};

export default async function Page() {
  await connection();
  let release: { version: string; sha256: string } | null = null;
  let releaseState: 'ready' | 'error' = 'ready';
  try {
    const { rows } = await query<{ version: string; sha256: string }>(
      `SELECT r.version, r.package_sha256 AS sha256 FROM products p
       JOIN releases r ON r.product_id = p.id AND r.is_published
       WHERE p.slug = 'liepin-search' AND p.is_public
       ORDER BY r.published_at DESC NULLS LAST, r.created_at DESC LIMIT 1`,
    );
    release = rows[0] ?? null;
  } catch {
    releaseState = 'error';
  }
  return <LiepinInstallGuide release={release} releaseState={releaseState} appUrl={env.publicAppUrl()} />;
}
