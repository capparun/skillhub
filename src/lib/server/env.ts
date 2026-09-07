// 环境变量集中读取。惰性求值:import 本模块不要求任何变量存在,
// 调用时才校验,缺失即抛错(等效于启动即失败,同时兼容测试环境)。

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`缺少必需的环境变量 ${name}`);
  return value;
}

function intOr(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value) return fallback;
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`环境变量 ${name} 必须是正整数,当前值: ${value}`);
  }
  return parsed;
}

export const env = {
  databaseUrl: () => required('DATABASE_URL'),
  sessionSecret: () => required('SESSION_SECRET'),
  packageUrlSecret: () => process.env.PACKAGE_URL_SECRET ?? required('SESSION_SECRET'),
  packageStorageDir: () => process.env.PACKAGE_STORAGE_DIR ?? '/data/packages',
  installTokenTtlMinutes: () => intOr('INSTALL_TOKEN_TTL_MINUTES', 10),
  downloadUrlTtlSeconds: () => intOr('DOWNLOAD_URL_TTL_SECONDS', 300),
  publicAppUrl: () => (process.env.PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/+$/, ''),
  secureCookies: () => (process.env.PUBLIC_APP_URL ?? '').startsWith('https://'),
};
