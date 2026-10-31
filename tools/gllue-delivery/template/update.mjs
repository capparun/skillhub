#!/usr/bin/env node
import { args, output } from './lifecycle.mjs';
import { update } from './remote.mjs';
try {
    output(await update(args(process.argv.slice(2))));
}
catch (e) {
    output({ ok: false, error: { code: e.code ?? 'UPDATE', message: e.message, details: e.details, phase: e.phase }, logPath: e.logPath, currentInstallation: 'not_modified' });
}
