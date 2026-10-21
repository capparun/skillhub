import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getRegistry } from '@jackwener/opencli/registry';
import { filters } from '../lib/filters.js';

const root = path.dirname(fileURLToPath(new URL('../package.json', import.meta.url)));

const filterKeys = Object.keys(filters);
// filterKeys = keyword, match, title, company, city, expectedCity, experience, education,
//   schoolTier, fullTime, industry, position, expectedIndustry, expectedPosition,
//   activity, language, jobChanges, school, major, jobStatus, resumeLanguage,
//   salaryMin, salaryMax, expectedSalaryMin, expectedSalaryMax, ageMin, ageMax,
//   gender, overseas, management  (30 keys)

// Public CLI contract. Any added, removed, or renamed parameter must update this
// snapshot and receive a behavioral test in the command-specific test file.
const expected = {
  'apply-saved-search': ['name', 'limit','file','page','operationId'],
  'conditions': [],
  'connect': [],
  'disconnect': ['page','file'],
  'cleanup': ['file','page'],
  'restore-search': ['file','roundId','page','operationId','reason'],
  'favorites': ['file','page','operationId','limit'],
  'detail-batch': ['file','id','intervalMs'],
  'favorite': ['action','resumeId','page','file','operationId','group'],
  'open-detail': ['file','observationId','page','operationId'],
  'delete-saved-search': ['name','file','page','operationId'],
  'diagnose': ['probe', 'probeValue'],
  'detail': ['resumeId','page','file','operationId','expand'],
  'task': ['mode','file','input','source','roundId','stage'],
  'prepare': [...filterKeys,'recoverBlank','file','page','operationId'],
  'recover-prepare': ['file','page','previousOperationId','input','executorStopped'],
  'results': ['file','page','operationId','limit'],
  'save-search': ['name','current', ...filterKeys,'file','page','operationId'],
  'saved-searches': ['file','page','operationId'],
  'search': ['file','roundId','page'],
};

const required = new Set(['save-search.file','save-search.page','save-search.operationId','saved-searches.file','saved-searches.page','saved-searches.operationId','apply-saved-search.file','apply-saved-search.page','apply-saved-search.operationId','delete-saved-search.file','delete-saved-search.page','delete-saved-search.operationId','prepare.file','prepare.page','prepare.operationId','favorites.file','favorites.page','favorites.operationId','detail-batch.file','detail-batch.id','favorite.action','favorite.resumeId','favorite.page','favorite.file','favorite.operationId','results.file','results.page','results.operationId','open-detail.file','open-detail.observationId','open-detail.page','open-detail.operationId','search.file','search.roundId','search.page','task.mode','task.file','detail.resumeId','detail.page','detail.file','detail.operationId', 'save-search.name', 'apply-saved-search.name', 'delete-saved-search.name']);
const positional = new Set(['favorite.action',
  'task.mode',
  'detail.resumeId',
  'prepare.keyword',
  'save-search.name',
  'apply-saved-search.name',
  'delete-saved-search.name',
]);
for(const key of ['recover-prepare.file','recover-prepare.page','recover-prepare.previousOperationId','recover-prepare.input','recover-prepare.executorStopped','cleanup.file','cleanup.page','disconnect.page','restore-search.file','restore-search.roundId','restore-search.page','restore-search.operationId','restore-search.reason'])required.add(key);

test('liepin command contract: all public commands registered with correct args', async () => {
  // Discover all registered commands by scanning root .js files for site declarations.
  const discovered = [];
  for (const file of fs.readdirSync(root).filter(file => file.endsWith('.js'))) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    if (!/site:\s*'liepin'/.test(source)) continue;
    const name = source.match(/\bname:\s*'([^']+)'/)?.[1];
    assert.ok(name, `${file} must register a command name`);
    discovered.push(name);
  }
  discovered.sort();
  const expectedNames = Object.keys(expected).sort();
  assert.deepEqual(discovered, expectedNames, 'discovered commands must match expected contract keys');

  // Import all commands to trigger real OpenCLI registry registration.
  for (const command of Object.keys(expected)) {
    await import(new URL(`../${command}.js`, import.meta.url));
  }

  for (const [commandName, argNames] of Object.entries(expected)) {
    const command = getRegistry().get(`liepin/${commandName}`);
    assert.ok(command, `${commandName} must be registered in the real OpenCLI registry`);
    if (['save-search','saved-searches','apply-saved-search','delete-saved-search','prepare','favorites','detail-batch','task','detail','search','results','connect','disconnect','restore-search','open-detail','favorite'].includes(commandName)) assert.equal(command.browser,false,'task/detail validate before opening any browser connection');
    if (command.browser === true) assert.throws(()=>command.validateArgs({}),/浏览器连接前停止/,'unreviewed browser entries must fail closed before pre-navigation');
    assert.deepEqual(command.args.map(arg => arg.name), argNames, `${commandName} real args must match the contract`);
    for (const arg of command.args) {
      const key = `${commandName}.${arg.name}`;
      assert.ok(['string', 'int', 'boolean'].includes(arg.type), `${key} has a supported parser type`);
      // liepin uses `help:` not `description:`
      assert.ok(arg.help?.trim(), `${key} exposes help text`);
      assert.equal(Boolean(arg.required), required.has(key), `${key} required flag is intentional`);
      assert.equal(Boolean(arg.positional), positional.has(key), `${key} positional flag is intentional`);
      // liepin convention: optional args may omit default — only verify required/positional flags
    }
  }
});

test('liepin filter keys are stable (30 filter definitions)', () => {
  assert.equal(filterKeys.length, 30, 'filters.js must export exactly 30 filter definitions');
});
