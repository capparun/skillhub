import { readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
export const commands = JSON.parse(await readFile(new URL('./commands.json', import.meta.url), 'utf8'));
const fail = (code, message) => Object.assign(new Error(message), { code });

// OpenCLI 2.0.1 serializes CliError code/message/hint only. Keep a small,
// allowlisted diagnostic in the message as well as on the local Error object.
export function runtimeFailure(error = {}) {
  if (!error || typeof error !== 'object' || Array.isArray(error)) error = {};
  const failure = fail(typeof error.code === 'string' ? error.code : 'runtime_failed', typeof error.message === 'string' ? error.message : 'LinkedIn operation failed');
  const token = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value) ? value : undefined;
  const diagnostic = {};
  const stage = token(error.details?.stage) ?? Object.keys(error.timing?.stages ?? {}).filter(k => k !== 'cleanup').map(token).filter(Boolean).at(-1);
  if (stage) diagnostic.stage = stage;
  const phase = token(error.execution?.phase); if (phase) diagnostic.phase = phase;
  if (['closed', 'failed', 'not_needed'].includes(error.execution?.cleanup?.status)) diagnostic.cleanup = error.execution.cleanup.status;
  if (Number.isFinite(error.timing?.total) && error.timing.total >= 0) diagnostic.elapsed_ms = Math.round(error.timing.total);
  const upstream = token(error.details?.upstream_code); if (upstream) diagnostic.upstream_code = upstream;
  if (error.details?.ui_evidence?.status === 'failure_captured') diagnostic.evidence = 'failure_captured';
  if (Object.keys(diagnostic).length) {
    failure.diagnostic = diagnostic;
    failure.message += ' [diagnostic: ' + Object.entries(diagnostic).map(([key,value]) => key + '=' + value).join('; ') + ']';
  }
  return failure;
}

// Keep the existing engines and their account, budget and cleanup gates intact.
// execFile uses an argument vector, never shell interpolation.
export async function runCommand(name, args = {}, execute = exec) {
  const definition = commands.find(item => item.name === name);
  if (!definition) throw fail('unsupported_command', 'Unknown LinkedIn command');
  if (name === 'capabilities' && args.input !== undefined) throw fail('invalid_input', 'capabilities does not accept --input; use salesnav-capabilities for account-bound capability checks');
  let input;
  if (args.input !== undefined) {
    try { input = JSON.parse(await readFile(args.input, 'utf8')); }
    catch { throw fail('invalid_input', 'Cannot read a valid JSON input file'); }
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw fail('invalid_input', 'Input must be a JSON object');
  } else if (!definition.optional) throw fail('invalid_input', '--input is required');
  const script = fileURLToPath(new URL(definition.family === 'linkedin' ? '../linkedin-cli.mjs' : '../cli.mjs', import.meta.url));
  const argv = [script, definition.command];
  if (input !== undefined) argv.push(definition.family === 'linkedin' ? args.input : JSON.stringify(input));
  let result;
  let processFailed = false;
  try { result = await execute(process.execPath, argv, { maxBuffer: 32 * 1024 * 1024 }); }
  catch (error) {
    // A nonzero engine result is still a structured failure, not empty success.
    if (!error.stdout) throw fail('runtime_failed', 'LinkedIn runtime did not return a receipt; inspect task status before retrying');
    processFailed = true;
    result = error;
  }
  let receipt;
  try { receipt = JSON.parse(result.stdout); }
  catch { throw fail('invalid_response', 'LinkedIn runtime returned an invalid receipt'); }
  if (!receipt || typeof receipt !== 'object' || Array.isArray(receipt) || typeof receipt.ok !== 'boolean') throw fail('invalid_response', 'LinkedIn runtime returned an invalid receipt');
  if (receipt.ok !== true) throw runtimeFailure(receipt.error);
  if (processFailed || !Object.hasOwn(receipt, 'data')) throw fail('invalid_response', 'LinkedIn runtime did not finish with a valid success receipt');
  return receipt.data;
}
