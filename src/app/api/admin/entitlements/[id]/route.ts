import { query } from '@/lib/server/db';
import { requireAdmin } from '@/lib/server/session';
import { audit } from '@/lib/server/audit';
import { HttpError, errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 撤销授权或调整到期时间
export async function PATCH(request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const admin = await requireAdmin();
    const { id } = await ctx.params;
    const body = await request.json().catch(() => null);

    const existing = await query<{ status: string }>(
      `SELECT status FROM entitlements WHERE id = $1`,
      [id],
    );
    if (!existing.rows[0]) throw new HttpError(404, 'not_found', '授权不存在');

    if (body?.status === 'revoked') {
      await query(
        `UPDATE entitlements SET status = 'revoked', updated_at = now() WHERE id = $1`,
        [id],
      );
      await audit(admin.id, 'entitlement.revoked', 'entitlement', id, {});
      return json({ ok: true });
    }

    if (typeof body?.expiresAt === 'string') {
      const expiresAt = new Date(body.expiresAt);
      if (Number.isNaN(expiresAt.getTime())) {
        throw new HttpError(400, 'validation_error', '请提供有效的到期时间');
      }
      await query(
        `UPDATE entitlements SET expires_at = $1, updated_at = now() WHERE id = $2`,
        [expiresAt.toISOString(), id],
      );
      await audit(admin.id, 'entitlement.updated', 'entitlement', id, {
        expiresAt: expiresAt.toISOString(),
      });
      return json({ ok: true });
    }

    throw new HttpError(400, 'validation_error', '没有可执行的变更');
  } catch (err) {
    return errorResponse(err);
  }
}
