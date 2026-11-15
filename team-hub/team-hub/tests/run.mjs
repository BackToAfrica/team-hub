// Runs every UI suite in ./suites against the mock backend. Exits 1 if any suite logs an error.
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const only = process.argv.slice(2);
const suites = fs.readdirSync(path.join(HERE, 'suites')).filter(f => f.endsWith('.json') && (!only.length || only.some(o => f.startsWith(o))))
  .sort((a, b) => parseInt(a.slice(1)) - parseInt(b.slice(1)) || a.localeCompare(b));
let failed = 0;
for (const s of suites) {
  const r = spawnSync(process.execPath, [path.join(HERE, 'drive.mjs'), path.join(HERE, 'suites', s)], { encoding: 'utf8', timeout: 240000 });
  const out = (r.stdout || '') + (r.stderr || '');
  const line = out.split('\n').find(l => l.startsWith('ERRORS:'));
  const ok = r.status === 0 && line === 'ERRORS: none';
  if (!ok) failed++;
  console.log((ok ? 'PASS ' : 'FAIL ') + s + (ok ? '' : '\n' + out.split('\n').filter(l => /^(ERRORS|EXC|CONSOLE)/.test(l) || !line).slice(0, 12).join('\n')));
}
console.log(`\n${suites.length - failed}/${suites.length} suites passed`);
process.exit(failed ? 1 : 0);
