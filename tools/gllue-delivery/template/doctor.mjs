#!/usr/bin/env node
import { args, locate, check, output } from './lifecycle.mjs';
try {
    output(check(locate(args(process.argv.slice(2)))));
}
catch (e) {
    output({ ok: false, error: { code: e.code ?? 'CHECK', message: e.message, details: e.details } });
}
