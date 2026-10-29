import {runOpencli} from './run-opencli.mjs';
import {fileURLToPath} from 'node:url';
try {await runOpencli([fileURLToPath(new URL('./packages/gllue/',import.meta.url))]);}
catch(error){console.error(error.message);process.exitCode=1;}
