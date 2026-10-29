#!/usr/bin/env node
// Keep installed runtime Skill copies generated from distribution/linkedin-only/skills.
// Usage: node scripts/sync-linkedin-skills.mjs [--check]
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'distribution/linkedin-only/skills');
const pluginSkills = ['cskh-linkedin', 'cskh-linkedin-salesnav', 'cskh-sourcing-linkedin'];
// The plugin bundle ships runtime-required files only; development artifacts stay in the source tree.
const pluginExcludes = new Set([
  'cskh-sourcing-linkedin/darwin-assessment.md',
  'cskh-sourcing-linkedin/darwin-results.tsv',
  'cskh-sourcing-linkedin/package.json',
  'cskh-sourcing-linkedin/references/shortlist-contract.md',
  'cskh-sourcing-linkedin/scripts/discover-linkedin-xray.mjs',
  'cskh-sourcing-linkedin/scripts/enrich-linkedin-profiles.mjs',
  'cskh-sourcing-linkedin/scripts/opencli-output.mjs',
  'cskh-sourcing-linkedin/test-prompts.json',
]);
const targets = [
  {directory: path.join(root, 'distribution/linkedin-only/runtime/skills'), skills: null},
  {directory: path.join(root, 'distribution/linkedin-only/runtime/packages/linkedin-workflow/skills'), skills: pluginSkills},
];
const check = process.argv.includes('--check');

if (!fs.existsSync(source)) throw new Error(`Missing Skill source directory: ${source}`);

const listFiles = directory => fs.readdirSync(directory, {withFileTypes: true})
  .flatMap(entry => entry.isDirectory()
    ? listFiles(path.join(directory, entry.name)).map(name => `${entry.name}/${name}`)
    : [entry.name]);

const skillDirectories = directory => fs.existsSync(directory)
  ? fs.readdirSync(directory, {withFileTypes: true}).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()
  : [];

const sameBytes = (left, right) => fs.readFileSync(left).equals(fs.readFileSync(right));

let drift = 0;
for (const target of targets) {
  const wanted = target.skills ?? skillDirectories(source);
  const excluded = target.skills ? pluginExcludes : new Set();
  const expected = new Map();
  for (const skill of wanted) for (const name of listFiles(path.join(source, skill))) {
    const relative = `${skill}/${name}`;
    if (excluded.has(relative)) continue;
    expected.set(relative, path.join(source, skill, name));
  }
  const actual = new Map();
  for (const skill of skillDirectories(target.directory)) for (const name of listFiles(path.join(target.directory, skill))) actual.set(`${skill}/${name}`, path.join(target.directory, skill, name));

  const missing = [...expected.keys()].filter(name => !actual.has(name));
  const extra = [...actual.keys()].filter(name => !expected.has(name));
  const changed = [...expected.keys()].filter(name => actual.has(name) && !sameBytes(expected.get(name), actual.get(name)));
  const label = path.relative(root, target.directory);

  if (check) {
    if (!missing.length && !extra.length && !changed.length) continue;
    drift += missing.length + extra.length + changed.length;
    console.error(`Skill mirror drift in ${label}: missing=${missing.length} extra=${extra.length} changed=${changed.length}`);
    for (const name of [...missing, ...extra, ...changed].slice(0, 10)) console.error(`  ${name}`);
    continue;
  }

  for (const skill of skillDirectories(target.directory)) {
    if (!wanted.includes(skill)) fs.rmSync(path.join(target.directory, skill), {recursive: true, force: true});
  }
  for (const name of extra) if (fs.existsSync(actual.get(name))) fs.rmSync(actual.get(name));
  fs.mkdirSync(target.directory, {recursive: true});
  for (const [relative, file] of expected) {
    const destination = path.join(target.directory, relative);
    fs.mkdirSync(path.dirname(destination), {recursive: true});
    const current = actual.get(relative);
    if (!current || !sameBytes(file, current)) fs.copyFileSync(file, destination);
    fs.chmodSync(destination, fs.statSync(file).mode);
  }
  console.log(`Skill mirror ${label}: ${expected.size} files`);
}

if (check && drift) {
  console.error('Skill mirrors are stale; run node scripts/sync-linkedin-skills.mjs');
  process.exit(1);
}
