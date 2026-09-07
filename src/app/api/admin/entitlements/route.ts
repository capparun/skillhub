import { query } from '@/lib/server/db';
import { requireAdmin } from '@/lib/server/session';
import { audit } from '@/lib/server/audit';
import { HttpError, errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 授权列表(可按用户/商品过滤)
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const url = new URL(request.url);
    const userId = url.searchParams.get('userId');
    const productSlug = url.searchParams.get('productSlug');

    const result = await query<{
      id: string;
      status: 'active' | 'revoked';
      expires_at: Date;
      note: string;
      email: string;
      product_slug: string;
      created_at: Date;
    }>(
      `SELECT e.id, e.status, e.expires_at, e.note, e.created_at,
              u.email, p.slug AS product_slug
       FROM entitlements e
       JOIN users u ON u.id = e.user_id
       JOIN products p ON p.id = e.product_id
       WHERE ($1::uuid IS NULL OR e.user_id = $1)
         AND ($2::text IS NULL OR p.slug = $2)
       ORDER BY e.created_at DESC`,
      [userId || null, productSlug || null],
    );
    return json({
      entitlements: result.rows.map((r) => ({
        id: r.id,
        userEmail: r.email,
        productSlug: r.product_slug,
        status: r.status,
        expiresAt: r.expires_at,
        expired: r.expires_at.getTime() <= Date.now(),
        note: r.note,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// 开通或调整授权(同一用户同一商品 upsert;被撤销的授权可由此恢复)
export async function POST(request: Request) {
  try {
    const admin = await requireAdmin();
    const body = await request.json().catch(() => null);
    const userId = typeof body?.userId === 'string' ? body.userId : '';
    const productSlug = typeof body?.productSlug === 'string' ? body.productSlug : '';
    const expiresAt = typeof body?.expiresAt === 'string' ? new Date(body.expiresAt) : null;
    const note = typeof body?.note === 'string' ? body.note : '';

    if (!userId || !productSlug) {
      throw new HttpError(400, 'validation_error', '缺少 userId 或 productSlug');
    }
    if (!expiresAt || Number.isNaN(expiresAt.getTime())) {
      throw new HttpError(400, 'validation_error', '请提供有效的到期时间');
    }

    const product = await query<{ id: string }>(`SELECT id FROM products WHERE slug = $1`, [
      productSlug,
    ]);
    if (!product.rows[0]) throw new HttpError(404, 'not_found', '商品不存在');
    const user = await query<{ id: string }>(`SELECT id FROM users WHERE id = $1`, [userId]);
    if (!user.rows[0]) throw new HttpError(404, 'not_found', '用户不存在');

    const result = await query<{ id: string }>(
      `INSERT INTO entitlements (user_id, product_id, status, expires_at, note, granted_by)
       VALUES ($1, $2, 'active', $3, $4, $5)
       ON CONFLICT (user_id, product_id) DO UPDATE
         SET status = 'active', expires_at = EXCLUDED.expires_at,
             note = EXCLUDED.note, granted_by = EXCLUDED.granted_by, updated_at = now()
       RETURNING id`,
      [userId, product.rows[0].id, expiresAt.toISOString(), note, admin.id],
    );
    await audit(admin.id, 'entitlement.granted', 'entitlement', result.rows[0].id, {
      userId,
      productSlug,
      expiresAt: expiresAt.toISOString(),
    });
    return json({ ok: true, id: result.rows[0].id }, 201);
  } catch (err) {
    return errorResponse(err);
  }
}
