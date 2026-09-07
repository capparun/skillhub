import { Readable } from 'node:stream';
import { query } from '@/lib/server/db';
import { openPackage } from '@/lib/server/packages';
import { HttpError, errorResponse, getClientIp } from '@/lib/server/http';
import { take } from '@/lib/server/rate-limit';

export const runtime = 'nodejs';

// 免费商品发布包公开下载(仅 is_public 商品;付费包必须走令牌/凭据流程)。
export async function GET(request: Request, ctx: { params: Promise<{ slug: string }> }) {
  try {
    const { slug } = await ctx.params;
    const ip = getClientIp(request);
    if (!take(`dl:${ip}`, 60, 60)) {
      throw new HttpError(429, 'rate_limited', '下载过于频繁,请稍后再试');
    }

    const result = await query<{
      id: string;
      package_key: string;
      package_sha256: string;
    }>(
      `SELECT r.id, r.package_key, r.package_sha256
       FROM products p
       JOIN releases r ON r.product_id = p.id AND r.is_published
       WHERE p.slug = $1 AND p.is_public
       ORDER BY r.published_at DESC NULLS LAST, r.created_at DESC
       LIMIT 1`,
      [slug],
    );
    const release = result.rows[0];
    if (!release) throw new HttpError(404, 'not_found', '该商品暂无可下载的发布版本');

    const { stream, size } = openPackage(release.package_key);
    await query(`UPDATE releases SET downloads_count = downloads_count + 1 WHERE id = $1`, [
      release.id,
    ]);

    const filename = release.package_key.split('/').pop() ?? 'package.tar.gz';
    return new Response(Readable.toWeb(stream) as ReadableStream, {
      headers: {
        'content-type': 'application/gzip',
        'content-length': String(size),
        'content-disposition': `attachment; filename="${filename}"`,
        'x-sha256': release.package_sha256,
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
