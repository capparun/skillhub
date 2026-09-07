import { getSessionUser } from '@/lib/server/session';
import { query } from '@/lib/server/db';
import { errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 当前登录用户 + 授权摘要。匿名返回 401,前端据此切换登录态(匿名是正常状态)。
export async function GET() {
  try {
    const user = await getSessionUser();
    if (!user) {
      return json({ error: { code: 'unauthorized', message: '未登录' } }, 401);
    }
    const result = await query<{
      slug: string;
      name: string;
      status: 'active' | 'revoked';
      expires_at: Date;
    }>(
      `SELECT p.slug, p.name, e.status, e.expires_at
       FROM entitlements e JOIN products p ON p.id = e.product_id
       WHERE e.user_id = $1
       ORDER BY e.created_at`,
      [user.id],
    );
    return json({
      user,
      entitlements: result.rows.map((r) => ({
        productSlug: r.slug,
        productName: r.name,
        status: r.status,
        expiresAt: r.expires_at,
        expired: r.expires_at.getTime() <= Date.now(),
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
