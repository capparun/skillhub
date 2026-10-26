import {fileURLToPath} from 'node:url';
import {runOpencli} from './run-opencli.js';
process.env.HUNTER_OPENCLI_ENTRY=fileURLToPath(import.meta.url);
process.env.HUNTER_SKILLS_ROOT=fileURLToPath(new URL('./skills/',import.meta.url));
await runOpencli(['./packages/hunter-linkedin/','./packages/linkedin-workflow/'].map(p=>fileURLToPath(new URL(p,import.meta.url))));
