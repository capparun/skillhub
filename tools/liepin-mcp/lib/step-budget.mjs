// One browser command that never returns must not consume the whole operation.
// Each awaited step gets its own deadline; a timeout stops waiting, but does not cancel a dispatched action.
// The underlying command is never replayed: a dispatched action may still land.
export class StepTimeoutError extends Error {
 constructor(step, timeoutMs) {
  super(`步骤「${step}」超过 ${timeoutMs}ms 未返回`);
  this.name = 'StepTimeoutError';
  this.code = 'STEP_TIMEOUT';
  this.step = step;
  this.timeoutMs = timeoutMs;
 }
}
export function isStepTimeout(error) { return error?.code === 'STEP_TIMEOUT'; }
/**
 * Race one step against its deadline and record the outcome.
 * Resolves with the step value, or rejects with StepTimeoutError.
 */
export async function withStep(name, run, {timeoutMs, trace, onTimeout}={}) {
 if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw Error('步骤时限无效');
 const started = Date.now();
 const TIMEOUT = Symbol('step-timeout');
 let timer;
 const pending = Promise.resolve().then(run);
 pending.catch(() => {}); // a late rejection after the deadline is not an unhandled failure
 try {
  const value = await Promise.race([pending, new Promise(resolve => { timer = setTimeout(() => resolve(TIMEOUT), timeoutMs); })]);
  if (value === TIMEOUT) {
   trace?.push({step: name, ms: Date.now() - started, outcome: 'timeout'});
   onTimeout?.(timeoutMs, name);
   throw new StepTimeoutError(name, timeoutMs);
  }
  trace?.push({step: name, ms: Date.now() - started, outcome: 'returned'});
  return value;
 } catch (error) {
  if (error instanceof StepTimeoutError) throw error;
  trace?.push({step: name, ms: Date.now() - started, outcome: 'failed', error: error.message});
  throw error;
 } finally {
  clearTimeout(timer);
 }
}
/** Human-readable one-liner for the operation log; no raw stack, no secrets. */
export function describeTrace(trace) {
 return (trace ?? []).map(step => `${step.step} ${step.outcome === 'returned' ? '已返回' : step.outcome === 'timeout' ? '超时' : '失败'} ${step.ms}ms`).join('；');
}
