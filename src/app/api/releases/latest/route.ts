import { query } from '@/lib/server/db';
import { env } from '@/lib/server/env';
import { HttpError, errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 公开最新版本元数据;客户端 24h 静默检查轮询此接口(不携带任何业务数据)。
// 免费商品附带公开下载地址,付费商品不含下载地址(需走更新凭据)。
export async function GET(request: Request) {
  try {
    const slug = new URL(request.url).searchParams.get('product') ?? '';
    if (!slug) throw new HttpError(400, 'validation_error', '缺少 product 参数');

    const result = await query<{
      is_public: boolean;
      name: string;
      version: string | null;
      published_at: Date | null;
      release_notes: string | null;
      package_sha256: string | null;
    }>(
      `SELECT p.is_public, p.name,
              r.version, r.published_at, r.release_notes, r.package_sha256
       FROM products p
       LEFT JOIN LATERAL (
         SELECT version, published_at, release_notes, package_sha256
         FROM releases
         WHERE product_id = p.id AND is_published
         ORDER BY published_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) r ON true
       WHERE p.slug = $1`,
      [slug],
    );
    const row = result.rows[0];
    if (!row) throw new HttpError(404, 'not_found', '商品不存在');
    if (!row.version) throw new HttpError(404, 'no_release', '该商品暂无发布版本');

    return json({
      product: { slug, name: row.name, isPublic: row.is_public },
      version: row.version,
      publishedAt: row.published_at,
      releaseNotes: row.release_notes,
      sha256: row.package_sha256,
      downloadUrl: row.is_public
        ? `${env.publicAppUrl()}/api/products/${slug}/download`
        : undefined,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
