#!/usr/bin/env node
import { args, locate, check, capabilities, run, recover, maintenance, output, Failure } from './lifecycle.mjs';
import { update } from './remote.mjs';
try {
    const argv = process.argv.slice(2), command = argv.shift() ?? 'check';
    const sep = argv.indexOf('--');
    const options = args(sep < 0 ? argv : argv.slice(0, sep));
    const loc = locate(options);
    const result = command === 'check' ? check(loc) : command === 'maintenance' ? maintenance(loc) : command === 'capabilities' ? capabilities(loc) : command === 'update' ? await update(options) : command === 'recover' ? recover(options) : command === 'run' ? run(loc, sep < 0 ? [] : argv.slice(sep + 1)) : null;
    if (!result)
        throw new Failure('COMMAND', '支持check/capabilities/update/recover/maintenance/run');
    output(result);
}
catch (e) {
    output({ ok: false, error: { code: e.code ?? 'MANAGE', message: e.message, details: e.details, phase: e.phase }, logPath: e.logPath });
}
