import { Readable } from 'node:stream';
import { query } from '@/lib/server/db';
import { openPackage, verifyDownloadUrl } from '@/lib/server/packages';
import { HttpError, errorResponse } from '@/lib/server/http';

export const runtime = 'nodejs';

// 签名限时下载。地址由 redeem / updates/authorize 签发,默认 300 秒有效。
export async function GET(request: Request, ctx: { params: Promise<{ key: string[] }> }) {
  try {
    const { key: segments } = await ctx.params;
    const key = segments.join('/');
    const url = new URL(request.url);
    verifyDownloadUrl(key, url.searchParams.get('e'), url.searchParams.get('s'));

    const { stream, size } = openPackage(key);
    const releaseResult = await query<{ id: string; package_sha256: string }>(
      `SELECT id, package_sha256 FROM releases WHERE package_key = $1`,
      [key],
    );
    const release = releaseResult.rows[0];
    if (!release) throw new HttpError(404, 'not_found', '发布包不存在或已移除');
    await query(`UPDATE releases SET downloads_count = downloads_count + 1 WHERE id = $1`, [
      release.id,
    ]);

    const filename = key.split('/').pop() ?? 'package.tar.gz';
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
