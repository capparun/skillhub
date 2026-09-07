import pg from 'pg';
import { env } from './env';

// dev 模式下 Next.js 热更新会重复加载模块,Pool 挂到 globalThis 上避免连接泄漏。
const globalForDb = globalThis as unknown as { __liecPgPool?: pg.Pool };

export function getPool(): pg.Pool {
  if (!globalForDb.__liecPgPool) {
    globalForDb.__liecPgPool = new pg.Pool({
      connectionString: env.databaseUrl(),
      max: 10,
    });
  }
  return globalForDb.__liecPgPool;
}

export async function query<T extends pg.QueryResultRow = pg.QueryResultRow>(
  text: string,
  params?: unknown[],
): Promise<pg.QueryResult<T>> {
  return getPool().query<T>(text, params);
}

export async function withTransaction<T>(
  fn: (client: pg.PoolClient) => Promise<T>,
): Promise<T> {
  const client = await getPool().connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
