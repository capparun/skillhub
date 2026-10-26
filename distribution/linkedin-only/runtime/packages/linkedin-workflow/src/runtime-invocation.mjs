import {isAbsolute} from 'node:path';

// A distribution launcher supplies this binding to every child process.
// Explicit executable overrides remain available to development/test callers.
export function runtimeInvocation(executable, environment = process.env) {
  if (executable) return {command: executable, prefix: []};
  const entry = environment.HUNTER_OPENCLI_ENTRY;
  if (entry) {
    if (!isAbsolute(entry)) throw Object.assign(new Error('HUNTER_OPENCLI_ENTRY must be absolute'), {code: 'invalid_runtime_entry'});
    return {command: process.execPath, prefix: [entry]};
  }
  return {command: 'opencli', prefix: []};
}
