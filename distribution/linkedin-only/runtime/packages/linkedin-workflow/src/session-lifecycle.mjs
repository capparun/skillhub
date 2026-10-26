import { randomUUID } from 'node:crypto';

// The CLI owns this session. Caller-provided/internal operation session names
// never create extra tabs, and a user-bound tab is never adopted for cleanup.
export function managedSessionTransport(base, profile) {
  const context = { profile, session: `salesnav-command-${randomUUID()}` };
  const navigation = { open_calls: 0, homepage_visits: 0, owned_sessions: 0 };
  let opened = false;
  let cleaned = false;
  const transport = Object.fromEntries(Object.entries(base).filter(([name]) => name !== 'close').map(([name, fn]) => [name, async (...args) => {
    const mapped = args.map(arg => {
      if (!arg || typeof arg !== 'object' || !('session' in arg) || !('profile' in arg)) return arg;
      if (arg.profile !== profile) throw Object.assign(new Error('identity_mismatch'), { code: 'identity_mismatch' });
      return context;
    });
    if (name === 'open') {
      opened = true; // Even an uncertain open needs cleanup.
      navigation.open_calls++;
      navigation.owned_sessions = 1;
      if (args[0] === 'https://www.linkedin.com/feed/' || args[0] === 'https://www.linkedin.com/sales/') navigation.homepage_visits++;
    }
    return fn(...mapped);
  }]));
  async function cleanup() {
    if (!opened || cleaned) return { status: 'not_needed', session: context.session };
    cleaned = true;
    try {
      await base.close(context);
      return { status: 'closed', session: context.session };
    } catch {
      return { status: 'failed', session: context.session, reason: 'owned_session_cleanup_failed' };
    }
  }
  return { transport, cleanup, navigation };
}
