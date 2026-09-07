"use client";

// 前端 fetch 封装:统一 JSON、错误码映射、同源 cookie。
export class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: number,
  ) {
    super(message);
  }
}

export async function api<T>(
  path: string,
  options: { method?: string; body?: unknown } = {},
): Promise<T> {
  const { method = 'GET', body } = options;
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => null);
  if (!res.ok) {
    throw new ApiError(
      data?.error?.code ?? 'unknown',
      data?.error?.message ?? '请求失败,请稍后再试',
      res.status,
    );
  }
  return data as T;
}

export interface SessionInfo {
  user: { id: string; email: string; displayName: string | null; role: 'admin' | 'customer' };
  entitlements: {
    productSlug: string;
    productName: string;
    status: 'active' | 'revoked';
    expiresAt: string;
    expired: boolean;
  }[];
}
