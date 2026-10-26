const fail = code => { throw Object.assign(new Error(code), { code }); };
// This is a local OpenCLI-call budget, not a LinkedIn quota or balance.
export function executionTransport(transport, requestBudget, { cleanup: closeResource, clock = () => performance.now() } = {}) {
  const bounded = requestBudget !== undefined;
  if (bounded && (!Number.isInteger(requestBudget) || requestBudget < 1 || requestBudget > 500)) fail('invalid_input');
  const usage = { unit: 'opencli_calls', budget_source: bounded ? 'explicit_input' : 'not_provided', limit: bounded ? requestBudget : null, used: 0, remaining: bounded ? requestBudget : null, phase: 'not_started', last_outcome: 'not_started' };
  const started = clock();
  let stage = 'account_check', stageStarted = started;
  const timing = { unit: 'milliseconds', stages: {}, methods: {} };
  function markStage(next) { const now = clock(); timing.stages[stage] = (timing.stages[stage] ?? 0) + now - stageStarted; stage = next; stageStarted = now; }
  function timings() { const now = clock(); return { ...timing, total: now - started, stages: { ...timing.stages, [stage]: (timing.stages[stage] ?? 0) + now - stageStarted } }; }
  let cleanupReserved = false;
  let cleanupDone = false;
  const wrapped = Object.fromEntries(Object.entries(transport).map(([name, fn]) => [name, async (...args) => {
    usage.phase = name;
    if (name === 'open' && closeResource && !cleanupReserved) {
      // Never create a tab if the budget cannot also close that owned tab.
      if (bounded && usage.remaining < 2) { usage.last_outcome = 'not_dispatched_budget_exhausted'; fail('budget_exhausted'); }
      if (bounded) usage.remaining--;
      usage.reserved_for_cleanup = 1;
      cleanupReserved = true;
    }
    if (bounded && !usage.remaining) { usage.last_outcome = 'not_dispatched_budget_exhausted'; fail('budget_exhausted'); }
    usage.used++; if (bounded) usage.remaining--;
    usage.last_outcome = 'attempting';
    const callStarted = clock();
    try { const result = await fn(...args); usage.last_outcome = 'confirmed_return'; return result; }
    catch (error) { usage.last_outcome = 'unconfirmed'; throw error; }
    finally { const item = timing.methods[name] ??= { calls: 0, elapsed: 0 }; item.calls++; item.elapsed += clock() - callStarted; }
  }]));
  async function cleanup() {
    if (cleanupDone || !closeResource) return;
    cleanupDone = true;
    markStage('cleanup');
    const result = await closeResource();
    usage.cleanup = result;
    if (cleanupReserved) {
      usage.reserved_for_cleanup = 0;
      if (result.status === 'not_needed') { if (bounded) usage.remaining++; }
      else usage.used++;
    }
  }
  return { transport: wrapped, usage, cleanup, markStage, timings };
}
