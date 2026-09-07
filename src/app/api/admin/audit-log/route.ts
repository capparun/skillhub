import { query } from '@/lib/server/db';
import { requireAdmin } from '@/lib/server/session';
import { errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

const PAGE_SIZE = 50;

// 审计日志分页查看(最新在前)
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const page = Math.max(
      1,
      Number.parseInt(new URL(request.url).searchParams.get('page') ?? '1', 10) || 1,
    );
    const result = await query<{
      id: string;
      action: string;
      target_type: string;
      target_id: string;
      metadata: Record<string, unknown>;
      created_at: Date;
      actor_email: string;
    }>(
      `SELECT a.id, a.action, a.target_type, a.target_id, a.metadata, a.created_at,
              u.email AS actor_email
       FROM admin_audit_log a JOIN users u ON u.id = a.actor_user_id
       ORDER BY a.created_at DESC
       LIMIT $1 OFFSET $2`,
      [PAGE_SIZE + 1, (page - 1) * PAGE_SIZE],
    );
    const hasMore = result.rows.length > PAGE_SIZE;
    const rows = hasMore ? result.rows.slice(0, PAGE_SIZE) : result.rows;
    return json({
      entries: rows.map((r) => ({
        id: r.id,
        actorEmail: r.actor_email,
        action: r.action,
        targetType: r.target_type,
        targetId: r.target_id,
        metadata: r.metadata,
        createdAt: r.created_at,
      })),
      page,
      hasMore,
    });
  } catch (err) {
    return errorResponse(err);
  }
}
