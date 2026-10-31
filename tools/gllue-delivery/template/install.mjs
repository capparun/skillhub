#!/usr/bin/env node
import { args, PACKAGE, install, locate, output } from './lifecycle.mjs';
import { acquire } from './remote.mjs';
try {
    const o = args(process.argv.slice(2));
    let source = PACKAGE, downloadLog;
    if (o.from) {
        const result = await acquire(o.from, o.sha256, locate(o).stateRoot);
        source = result.source;
        downloadLog = result.logPath;
    }
    output({ ...await install(source, o), downloadLog });
}
catch (e) {
    output({ ok: false, error: { code: e.code ?? 'INSTALL', message: e.message, details: e.details, phase: e.phase }, logPath: e.logPath, currentInstallation: 'not_modified' });
}
