import { query } from '@/lib/server/db';
import { requireAdmin } from '@/lib/server/session';
import { audit } from '@/lib/server/audit';
import { HttpError, errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 撤回发布(回滚路径;撤回后该商品暂无正式版本,可重新发布旧版)
export async function POST(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;

    const result = await query<{ version: string }>(
      `UPDATE releases SET is_published = false WHERE id = $1 AND is_published RETURNING version`,
      [id],
    );
    if (!result.rows[0]) throw new HttpError(404, 'not_found', '版本不存在或未处于发布状态');

    await audit(admin.id, 'release.unpublished', 'release', id, { version: result.rows[0].version });
    return json({ ok: true });
  } catch (err) {
    return errorResponse(err);
  }
}
