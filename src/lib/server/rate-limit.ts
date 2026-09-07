// 内存固定窗口限流(单实例 MVP;多实例时需换成 Postgres/Redis 计数)。
const buckets = new Map<string, { count: number; resetAt: number }>();
let lastSweep = Date.now();

// 在 windowSec 秒内允许 limit 次;返回 true 表示放行。
export function take(key: string, limit: number, windowSec: number): boolean {
  const now = Date.now();
  if (now - lastSweep > 60_000) {
    for (const [k, v] of buckets) {
      if (v.resetAt <= now) buckets.delete(k);
    }
    lastSweep = now;
  }
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }
  bucket.count += 1;
  return bucket.count <= limit;
}
