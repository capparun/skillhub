import { withTransaction } from '@/lib/server/db';
import { requireAdmin } from '@/lib/server/session';
import { audit } from '@/lib/server/audit';
import { HttpError, errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 发布版本:同一商品同时只有一个已发布版本,发布新版本自动下架旧版本。
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const version = await withTransaction(async (client) => {
      const release = await client.query<{
        product_id: string;
        version: string;
        is_published: boolean;
      }>(`SELECT product_id, version, is_published FROM releases WHERE id = $1`, [id]);
      if (!release.rows[0]) throw new HttpError(404, 'not_found', '版本不存在');

      await client.query(
        `UPDATE releases SET is_published = false WHERE product_id = $1 AND is_published`,
        [release.rows[0].product_id],
      );
      await client.query(
        `UPDATE releases SET is_published = true, published_at = now() WHERE id = $1`,
        [id],
      );
      await audit(admin.id, 'release.published', 'release', id, { version: release.rows[0].version }, client);
      return release.rows[0].version;
    });

    return json({ ok: true, version });
  } catch (err) {
    return errorResponse(err);
  }
}
