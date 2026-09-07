import { query } from '@/lib/server/db';
import { errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 公开商品列表 + 最新已发布版本,驱动营销页展示。
export async function GET() {
  try {
    const result = await query<{
      slug: string;
      name: string;
      description: string;
      is_public: boolean;
      version: string | null;
      published_at: Date | null;
      release_notes: string | null;
      package_sha256: string | null;
    }>(
      `SELECT p.slug, p.name, p.description, p.is_public,
              r.version, r.published_at, r.release_notes, r.package_sha256
       FROM products p
       LEFT JOIN LATERAL (
         SELECT version, published_at, release_notes, package_sha256
         FROM releases
         WHERE product_id = p.id AND is_published
         ORDER BY published_at DESC NULLS LAST, created_at DESC
         LIMIT 1
       ) r ON true
       ORDER BY p.is_public DESC, p.created_at`,
    );
    return json({
      products: result.rows.map((r) => ({
        slug: r.slug,
        name: r.name,
        description: r.description,
        isPublic: r.is_public,
        latestRelease: r.version
          ? {
              version: r.version,
              publishedAt: r.published_at,
              releaseNotes: r.release_notes,
              sha256: r.package_sha256,
            }
          : null,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}
