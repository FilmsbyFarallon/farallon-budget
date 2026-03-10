#!/usr/bin/env node
/**
 * FARALLON BUDGET — MASTER TEST RUNNER
 * ────────────────────────────────────────
 * Runs all test suites and generates a summary report.
 *
 * Usage:
 *   node run-tests.js                      # run all tests
 *   node run-tests.js --math               # math unit tests only
 *   node run-tests.js --integrity          # data integrity only
 *   node run-tests.js --simulate           # simulation only
 *   node run-tests.js --simulate=2000      # simulation with N iterations
 *   node run-tests.js --supabase           # live DB tests (requires credentials)
 *
 * Supabase credentials (for --supabase):
 *   TEST_EMAIL=you@example.com TEST_PASSWORD=yourpass node run-tests.js --supabase
 */

const { execSync } = require('child_process');
const path = require('path');

const args = process.argv.slice(2);
const runAll     = args.length === 0;
const runMath    = runAll || args.some(a => a === '--math');
const runInteg   = runAll || args.some(a => a === '--integrity');
const runSim     = runAll || args.some(a => a.startsWith('--simulate'));
const runSupa    = args.some(a => a === '--supabase'); // never in --all by default
const simArg     = args.find(a => a.startsWith('--simulate='));
const simIter    = simArg ? simArg.split('=')[1] : '100';

const SUITE_FILE = {
  math:      'math.test.js',
  integrity: 'integrity.test.js',
  simulate:  'simulate.js',
  supabase:  'supabase.test.js',
};

const results = [];
const startAll = Date.now();

function run(name, file, env = {}) {
  const start = Date.now();
  const envStr = Object.entries({ ...process.env, ...env }).map(([k,v]) => `${k}=${v}`).join(' ');
  try {
    const output = execSync(`node ${path.join(__dirname, file)}`, {
      env: { ...process.env, ...env },
      encoding: 'utf8',
      stdio: ['pipe', 'pipe', 'pipe']
    });
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const passLine = (output.match(/RESULTS?:.*?(\d+)\/(\d+)/) || output.match(/(\d+)\/(\d+) passed/));
    const passed = passLine ? parseInt(passLine[1]) : '?';
    const total  = passLine ? parseInt(passLine[2]) : '?';
    console.log(`  ✓  ${name.padEnd(30)} ${String(passed).padStart(3)}/${total} passed  (${elapsed}s)`);
    results.push({ name, status: 'pass', passed, total, elapsed });
    return output;
  } catch(e) {
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const out = e.stdout || '';
    const passLine = out.match(/RESULTS?:.*?(\d+)\/(\d+)/) || out.match(/(\d+)\/(\d+) passed/);
    const passed = passLine ? parseInt(passLine[1]) : 0;
    const total  = passLine ? parseInt(passLine[2]) : '?';
    console.log(`  ✗  ${name.padEnd(30)} ${String(passed).padStart(3)}/${total} passed  (${elapsed}s)  ← FAILURES`);
    results.push({ name, status: 'fail', passed, total, elapsed, stderr: e.stderr?.slice(0,200) });
    if (out) {
      // Print only the failure lines from the output
      const lines = out.split('\n').filter(l => l.includes('✗') || l.includes('FAILED') || l.includes('Expected'));
      lines.slice(0, 15).forEach(l => console.log(`       ${l.trim()}`));
    }
    return out;
  }
}

// ─── HEADER ──────────────────────────────────────────────────────────────────

console.log('\n╔═══════════════════════════════════════════════════╗');
console.log('║       FARALLON BUDGET — TEST SUITE RUNNER         ║');
console.log('╚═══════════════════════════════════════════════════╝');
console.log(`  ${new Date().toLocaleString()}\n`);

// ─── RUN SUITES ───────────────────────────────────────────────────────────────

if (runMath) {
  console.log('── Math Unit Tests ────────────────────────────────');
  run('Math calculations', SUITE_FILE.math);
}

if (runInteg) {
  console.log('\n── Data Integrity Tests ───────────────────────────');
  run('Data integrity', SUITE_FILE.integrity);
}

if (runSim) {
  console.log(`\n── Simulation (${simIter} iterations) ${'─'.repeat(Math.max(0, 26 - simIter.length))}`);
  run(`Simulation (${simIter} iterations)`, SUITE_FILE.simulate, { ITERATIONS: simIter });
}

if (runSupa) {
  console.log('\n── Supabase Integration Tests ─────────────────────');
  if (!process.env.TEST_EMAIL || !process.env.TEST_PASSWORD) {
    console.log('  ⚠  Skipped — set TEST_EMAIL and TEST_PASSWORD env vars');
    results.push({ name: 'Supabase integration', status: 'skip' });
  } else {
    run('Supabase integration', SUITE_FILE.supabase);
  }
}

// ─── SUMMARY ─────────────────────────────────────────────────────────────────

const totalElapsed = ((Date.now() - startAll) / 1000).toFixed(1);
const allPassed = results.filter(r => r.status !== 'skip').every(r => r.status === 'pass');
const totalTests = results.reduce((s, r) => s + (typeof r.total === 'number' ? r.total : 0), 0);
const totalPass  = results.reduce((s, r) => s + (typeof r.passed === 'number' ? r.passed : 0), 0);

console.log('\n╔═══════════════════════════════════════════════════╗');
console.log('║  SUMMARY                                          ║');
console.log('╠═══════════════════════════════════════════════════╣');

results.forEach(r => {
  if (r.status === 'skip') {
    console.log(`║  ⊘  ${r.name.padEnd(45)} ║`);
  } else {
    const icon  = r.status === 'pass' ? '✓' : '✗';
    const label = `${r.passed}/${r.total}`;
    const line  = `${icon}  ${r.name} — ${label} passed`.padEnd(49);
    console.log(`║  ${line} ║`);
  }
});

console.log('╠═══════════════════════════════════════════════════╣');
const status = allPassed ? '✓  ALL TESTS PASSED' : '✗  SOME TESTS FAILED';
const summary = `   ${status} (${totalPass}/${totalTests})  [${totalElapsed}s]`;
console.log(`║${summary.padEnd(51)}║`);
console.log('╚═══════════════════════════════════════════════════╝\n');

process.exit(allPassed ? 0 : 1);
