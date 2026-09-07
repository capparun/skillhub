import { query } from '@/lib/server/db';
import { requireAdmin } from '@/lib/server/session';
import { errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 一次性令牌列表:只暴露状态与时间,永不返回令牌内容。
export async function GET() {
  try {
    await requireAdmin();
    const result = await query<{
      id: string;
      status: 'issued' | 'redeemed' | 'expired' | 'revoked';
      expires_at: Date;
      redeemed_at: Date | null;
      created_at: Date;
      email: string;
      product_slug: string;
    }>(
      `SELECT t.id, t.status, t.expires_at, t.redeemed_at, t.created_at,
              u.email, p.slug AS product_slug
       FROM install_tokens t
       JOIN users u ON u.id = t.user_id
       JOIN products p ON p.id = t.product_id
       ORDER BY t.created_at DESC
       LIMIT 200`,
    );
    const now = Date.now();
    return json({
      tokens: result.rows.map((r) => ({
        id: r.id,
        userEmail: r.email,
        productSlug: r.product_slug,
        // issued 但已过有效期的,按 expired 展示
        status:
          r.status === 'issued' && r.expires_at.getTime() <= now ? 'expired' : r.status,
        expiresAt: r.expires_at,
        redeemedAt: r.redeemed_at,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
