// 统一 HTTP 错误格式: { error: { code, message } },message 面向用户的中文。
// 用原生 Response(而非 NextResponse)以便在 node --test 中直接引用。
export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json; charset=utf-8' },
  });
}

export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) {
    return json({ error: { code: err.code, message: err.message } }, err.status);
  }
  console.error('未处理的服务器错误:', err);
  return json({ error: { code: 'internal_error', message: '服务器内部错误,请稍后重试' } }, 500);
}

export function getClientIp(request: Request): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return request.headers.get('x-real-ip') ?? 'unknown';
}
