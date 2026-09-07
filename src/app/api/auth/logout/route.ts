import { destroySession } from '@/lib/server/session';
import { errorResponse } from '@/lib/server/http';

export const runtime = 'nodejs';

export async function POST() {
  try {
    await destroySession();
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
}
