import {existsSync, readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {join, resolve} from 'node:path';

// Only accept this product's known installed layout, never an arbitrary ancestor.
export function bindDistribution(sourceDirectory, environment = process.env) {
  const root=resolve(sourceDirectory,'../../..');
  const metadata=join(root,'package.json');
  if (!existsSync(metadata)) return false;
  const pkg=JSON.parse(readFileSync(metadata,'utf8'));
  if (pkg.name!=='linkedin-only-hunter-runtime') return false;
  const entry=join(root,'opencli.mjs');
  if (!existsSync(entry)) throw new Error('Installed LinkedIn runtime is incomplete; reinstall the product');
  if (environment.HUNTER_OPENCLI_ENTRY && resolve(environment.HUNTER_OPENCLI_ENTRY)!==resolve(entry)) {
    throw Object.assign(new Error('Installed runtime entry conflicts with HUNTER_OPENCLI_ENTRY; remove the override and use the installed Skill entry.'), {code:'runtime_entry_mismatch'});
  }
  environment.HUNTER_OPENCLI_ENTRY = entry;
  environment.HUNTER_SKILLS_ROOT ??= join(root,'skills');
  return true;
}
bindDistribution(fileURLToPath(new URL('.',import.meta.url)));
