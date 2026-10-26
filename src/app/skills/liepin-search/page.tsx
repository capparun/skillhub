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
  let appUrl = env.publicAppUrl();
  let previewSource = false;
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
  // Development previews may use public metadata; production always uses its own database.
  if (!release && process.env.NODE_ENV === 'development') {
    try {
      const origin = 'https://hunterskill.zeabur.app';
      const response = await fetch(`${origin}/api/releases/latest?product=liepin-search`, {
        cache: 'no-store', signal: AbortSignal.timeout(8000),
      });
      if (!response.ok) throw new Error('Public release unavailable');
      const body = await response.json();
      const data = body.data ?? body;
      if (data.product?.slug !== 'liepin-search' || data.product?.isPublic !== true ||
          typeof data.version !== 'string' || !/^\d+\.\d+\.\d+(?:-[\w.-]+)?$/.test(data.version) ||
          typeof data.sha256 !== 'string' || !/^[a-f0-9]{64}$/i.test(data.sha256)) {
        throw new Error('Invalid public release metadata');
      }
      release = { version: data.version, sha256: data.sha256 };
      releaseState = 'ready';
      appUrl = origin;
      previewSource = true;
    } catch {
      releaseState = 'error';
    }
  }
  return <>{previewSource && <p style={{maxWidth:1040,margin:'12px auto',padding:'0 32px',fontSize:14,color:'#536b64'}}>本地设计预览 · 版本与安装链接来自线上公开分发站；本页尚未上线。</p>}<LiepinInstallGuide release={release} releaseState={releaseState} appUrl={appUrl} /></>;
}
