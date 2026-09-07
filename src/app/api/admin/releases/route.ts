import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { query } from '@/lib/server/db';
import { requireAdmin } from '@/lib/server/session';
import { savePackage } from '@/lib/server/packages';
import { audit } from '@/lib/server/audit';
import { HttpError, errorResponse, json } from '@/lib/server/http';

export const runtime = 'nodejs';

// 版本列表(可按商品过滤)
export async function GET(request: Request) {
  try {
    await requireAdmin();
    const productSlug = new URL(request.url).searchParams.get('productSlug');
    const result = await query<{
      id: string;
      version: string;
      package_sha256: string;
      package_size_bytes: number;
      downloads_count: number;
      release_notes: string;
      is_published: boolean;
      published_at: Date | null;
      created_at: Date;
      product_slug: string;
    }>(
      `SELECT r.id, r.version, r.package_sha256, r.package_size_bytes, r.downloads_count,
              r.release_notes, r.is_published, r.published_at, r.created_at,
              p.slug AS product_slug
       FROM releases r JOIN products p ON p.id = r.product_id
       WHERE ($1::text IS NULL OR p.slug = $1)
       ORDER BY r.created_at DESC`,
      [productSlug || null],
    );
    return json({
      releases: result.rows.map((r) => ({
        id: r.id,
        productSlug: r.product_slug,
        version: r.version,
        sha256: r.package_sha256,
        sizeBytes: Number(r.package_size_bytes),
        downloadsCount: r.downloads_count,
        releaseNotes: r.release_notes,
        isPublished: r.is_published,
        publishedAt: r.published_at,
        createdAt: r.created_at,
      })),
    });
  } catch (err) {
    return errorResponse(err);
  }
}

// 上传新版本(multipart: productSlug, version, file, releaseNotes)。上传后为未发布状态。
export async function POST(request: Request) {
  let tempPath: string | null = null;
  try {
    const admin = await requireAdmin();
    const form = await request.formData();
    const productSlug = String(form.get('productSlug') ?? '');
    const version = String(form.get('version') ?? '');
    const releaseNotes = String(form.get('releaseNotes') ?? '');
    const file = form.get('file');

    if (!productSlug || !/^\d+\.\d+\.\d+$/.test(version)) {
      throw new HttpError(400, 'validation_error', '缺少商品或版本号格式不正确(应为 x.y.z)');
    }
    if (!(file instanceof File) || file.size === 0) {
      throw new HttpError(400, 'validation_error', '请选择要上传的发布包(.tar.gz)');
    }
    const filename = file.name || 'package.tar.gz';
    if (!filename.endsWith('.tar.gz')) {
      throw new HttpError(400, 'validation_error', '发布包必须是 .tar.gz 文件');
    }

    const product = await query<{ id: string }>(`SELECT id FROM products WHERE slug = $1`, [
      productSlug,
    ]);
    if (!product.rows[0]) throw new HttpError(404, 'not_found', '商品不存在');

    tempPath = path.join(os.tmpdir(), `liec-upload-${crypto.randomUUID()}.tar.gz`);
    fs.writeFileSync(tempPath, Buffer.from(await file.arrayBuffer()));
    const saved = await savePackage(tempPath, productSlug, version, filename);
    tempPath = null; // savePackage 已移动到正式位置

    const result = await query<{ id: string }>(
      `INSERT INTO releases
         (product_id, version, package_key, package_sha256, package_size_bytes, release_notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id`,
      [product.rows[0].id, version, saved.key, saved.sha256, saved.size, releaseNotes, admin.id],
    );
    await audit(admin.id, 'release.uploaded', 'release', result.rows[0].id, {
      productSlug,
      version,
      sha256: saved.sha256,
    });

    return json(
      { id: result.rows[0].id, version, sha256: saved.sha256, sizeBytes: saved.size },
      201,
    );
  } catch (err) {
    // Postgres 唯一约束冲突 → 版本已存在
    if (typeof err === 'object' && err !== null && (err as { code?: string }).code === '23505') {
      return errorResponse(new HttpError(409, 'version_exists', '该版本号已存在'));
    }
    return errorResponse(err);
  } finally {
    if (tempPath && fs.existsSync(tempPath)) fs.unlinkSync(tempPath);
  }
}
