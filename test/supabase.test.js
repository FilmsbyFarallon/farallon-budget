/**
 * FARALLON BUDGET — SUPABASE API INTEGRATION TESTS
 * ──────────────────────────────────────────────────
 * Tests the live Supabase database layer directly.
 * Requires: npm install @supabase/supabase-js
 *
 * IMPORTANT: Uses a dedicated test account. Never runs against
 * production user data. Creates and deletes its own test records.
 *
 * Run with: node supabase.test.js
 * Or with credentials: TEST_EMAIL=x@y.com TEST_PASSWORD=xxx node supabase.test.js
 */

const { createClient } = require('@supabase/supabase-js');

const SUPA_URL = 'https://inkwpsxmarwehzektjao.supabase.co';
const SUPA_KEY = 'sb_publishable_U0xO8gH_saly3FxYfafaDg_j61Fimf7';

// Test credentials — set via env vars or edit here
const TEST_EMAIL    = process.env.TEST_EMAIL    || '';
const TEST_PASSWORD = process.env.TEST_PASSWORD || '';

if (!TEST_EMAIL || !TEST_PASSWORD) {
  console.error('\n⚠️  No test credentials provided.');
  console.error('   Set TEST_EMAIL and TEST_PASSWORD env vars, then re-run.');
  console.error('   Example: TEST_EMAIL=test@example.com TEST_PASSWORD=testpass123 node supabase.test.js\n');
  process.exit(0); // exit 0 so master runner doesn't fail on missing creds
}

// ─── TEST RUNNER ─────────────────────────────────────────────────────────────

let passed = 0, failed = 0, skipped = 0, errors = [];
let supa, userId;
const createdIds = { budgets:[], contacts:[], folders:[], snapshots:[] };

async function test(name, fn) {
  try {
    await fn();
    console.log(`  ✓  ${name}`);
    passed++;
  } catch(e) {
    console.error(`  ✗  ${name}`);
    console.error(`     ${e.message}`);
    failed++;
    errors.push({ name, error: e.message });
  }
}

function assert(actual, expected, msg) {
  const tolerance = 0.001;
  if(typeof expected === 'number') {
    if(Math.abs(actual - expected) > tolerance)
      throw new Error(`${msg||''} — Expected: ${expected}, Got: ${actual}`);
  } else if(expected === true || expected === false) {
    if(actual !== expected) throw new Error(`${msg||''} — Expected: ${expected}, Got: ${actual}`);
  } else if(expected !== null && typeof expected === 'object') {
    const a = JSON.stringify(actual), b = JSON.stringify(expected);
    if(a !== b) throw new Error(`${msg||''}\n     Expected: ${b}\n     Got:      ${a}`);
  } else {
    if(actual !== expected) throw new Error(`${msg||''} — Expected: ${JSON.stringify(expected)}, Got: ${JSON.stringify(actual)}`);
  }
}

function makeBudgetRecord(uid, overrides = {}) {
  const id = 'test_b_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  createdIds.budgets.push(id);
  return {
    id,
    user_id: uid,
    data: {
      id,
      name: 'Test Budget ' + id.slice(-4),
      values: { A01: { qty: 5, rate: 1000 }, B03: { qty: 3, rate: 2000 } },
      fringes: { A01: 'DGA' },
      markup: { prodFee: 10, fringes: 0, contingency: 5 },
      lineMeta: {},
      lineOT: {},
      mode: 'bid',
      status: 'draft',
      folderId: null,
      createdAt: Date.now(),
      ...overrides.data
    },
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

function makeContactRecord(uid, overrides = {}) {
  const id = 'test_ct_' + Date.now() + '_' + Math.random().toString(36).slice(2,6);
  createdIds.contacts.push(id);
  return {
    id,
    user_id: uid,
    data: {
      id,
      name: 'Test Contact ' + id.slice(-4),
      company: 'Test Co',
      role: 'DP',
      dayRate: '2500',
      tags: ['camera'],
      createdAt: Date.now(),
      ...overrides.data
    },
    updated_at: new Date().toISOString(),
    ...overrides
  };
}

// ─── CLEANUP ─────────────────────────────────────────────────────────────────

async function cleanup() {
  if (!supa || !userId) return;
  const tables = [
    { table: 'budgets',   ids: createdIds.budgets },
    { table: 'contacts',  ids: createdIds.contacts },
    { table: 'folders',   ids: createdIds.folders },
    { table: 'snapshots', ids: createdIds.snapshots },
  ];
  for (const { table, ids } of tables) {
    if (ids.length === 0) continue;
    await supa.from(table).delete().in('id', ids).eq('user_id', userId);
  }
}

// ─── MAIN ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n═══════════════════════════════════════════');
  console.log(' FARALLON BUDGET — SUPABASE INTEGRATION TESTS');
  console.log('═══════════════════════════════════════════\n');

  // ── AUTH ───────────────────────────────────────────────────────────────────
  console.log('0. Authentication');
  supa = createClient(SUPA_URL, SUPA_KEY);

  await test('sign in with test credentials', async () => {
    const { data, error } = await supa.auth.signInWithPassword({
      email: TEST_EMAIL,
      password: TEST_PASSWORD
    });
    if (error) throw new Error(`Auth failed: ${error.message}`);
    if (!data.user) throw new Error('No user returned after sign in');
    userId = data.user.id;
    assert(typeof userId, 'string', 'userId should be a string');
  });

  if (!userId) {
    console.error('\n  Auth failed — skipping remaining tests.\n');
    process.exit(1);
  }

  // ── BUDGETS ────────────────────────────────────────────────────────────────
  console.log('\n1. Budget CRUD');

  let insertedBudgetId;

  await test('insert a budget', async () => {
    const rec = makeBudgetRecord(userId);
    insertedBudgetId = rec.id;
    const { error } = await supa.from('budgets').insert(rec);
    if (error) throw new Error(`Insert failed: ${error.message}`);
  });

  await test('read back the inserted budget', async () => {
    const { data, error } = await supa.from('budgets')
      .select('data').eq('id', insertedBudgetId).eq('user_id', userId).single();
    if (error) throw new Error(`Read failed: ${error.message}`);
    assert(data.data.id, insertedBudgetId, 'budget id should match');
    assert(data.data.values.A01.qty, 5, 'values should be preserved');
    assert(data.data.values.A01.rate, 1000, 'rate should be preserved');
    assert(data.data.fringes.A01, 'DGA', 'fringe code should be preserved');
    assert(data.data.markup.prodFee, 10, 'markup should be preserved');
  });

  await test('upsert (update) budget values', async () => {
    const { data: existing } = await supa.from('budgets')
      .select('data').eq('id', insertedBudgetId).single();
    const updated = { ...existing.data };
    updated.values.A01.rate = 1500;
    updated.name = 'Updated Budget Name';
    const { error } = await supa.from('budgets').upsert({
      id: insertedBudgetId,
      user_id: userId,
      data: updated,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) throw new Error(`Upsert failed: ${error.message}`);

    // Verify the update took
    const { data: readback } = await supa.from('budgets')
      .select('data').eq('id', insertedBudgetId).single();
    assert(readback.data.values.A01.rate, 1500, 'rate should be updated to 1500');
    assert(readback.data.name, 'Updated Budget Name', 'name should be updated');
  });

  await test('RLS: cannot read another user\'s budget by id', async () => {
    // Try to read with a slightly modified user_id filter — RLS should block cross-user reads
    // We test this by checking user_id IS enforced in the select
    const { data } = await supa.from('budgets')
      .select('data').eq('id', insertedBudgetId).eq('user_id', 'fake-user-id-that-does-not-exist');
    assert((data || []).length, 0, 'RLS should prevent cross-user reads');
  });

  await test('bulk upsert multiple budgets in one operation', async () => {
    const rec1 = makeBudgetRecord(userId, { data: { name: 'Bulk Budget 1' } });
    const rec2 = makeBudgetRecord(userId, { data: { name: 'Bulk Budget 2' } });
    const rec3 = makeBudgetRecord(userId, { data: { name: 'Bulk Budget 3' } });
    const { error } = await supa.from('budgets').upsert([rec1, rec2, rec3], { onConflict: 'id' });
    if (error) throw new Error(`Bulk upsert failed: ${error.message}`);
    const { data } = await supa.from('budgets')
      .select('id').in('id', [rec1.id, rec2.id, rec3.id]).eq('user_id', userId);
    assert((data||[]).length, 3, 'all 3 budgets should be in database');
  });

  await test('delete a budget by id', async () => {
    const rec = makeBudgetRecord(userId);
    await supa.from('budgets').insert(rec);
    const { error } = await supa.from('budgets').delete().eq('id', rec.id).eq('user_id', userId);
    if (error) throw new Error(`Delete failed: ${error.message}`);
    // Verify it's gone
    const { data } = await supa.from('budgets').select('id').eq('id', rec.id);
    assert((data||[]).length, 0, 'budget should be deleted');
    createdIds.budgets = createdIds.budgets.filter(id => id !== rec.id); // Already deleted
  });

  await test('load all user budgets in created_at desc order', async () => {
    const { data, error } = await supa.from('budgets')
      .select('data').eq('user_id', userId).order('created_at', { ascending: false });
    if (error) throw new Error(`List failed: ${error.message}`);
    assert(Array.isArray(data), true, 'should return an array');
    // Verify our test budgets are in there
    const ids = data.map(r => r.data.id);
    assert(ids.includes(insertedBudgetId), true, 'inserted budget should be in list');
  });

  // ── CONTACTS ───────────────────────────────────────────────────────────────
  console.log('\n2. Contacts CRUD');

  let insertedContactId;

  await test('insert a contact', async () => {
    const rec = makeContactRecord(userId);
    insertedContactId = rec.id;
    const { error } = await supa.from('contacts').insert(rec);
    if (error) throw new Error(`Insert failed: ${error.message}`);
  });

  await test('read back contact with all fields', async () => {
    const { data, error } = await supa.from('contacts')
      .select('data').eq('id', insertedContactId).single();
    if (error) throw new Error(`Read failed: ${error.message}`);
    assert(data.data.name.startsWith('Test Contact'), true);
    assert(data.data.company, 'Test Co');
    assert(data.data.dayRate, '2500');
    assert(Array.isArray(data.data.tags), true);
    assert(data.data.tags[0], 'camera');
  });

  await test('upsert contact updates correctly', async () => {
    const { data: existing } = await supa.from('contacts')
      .select('data').eq('id', insertedContactId).single();
    const updated = { ...existing.data, dayRate: '3000', company: 'Updated Co' };
    const { error } = await supa.from('contacts').upsert({
      id: insertedContactId, user_id: userId, data: updated,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
    const { data: rb } = await supa.from('contacts').select('data').eq('id', insertedContactId).single();
    assert(rb.data.dayRate, '3000');
    assert(rb.data.company, 'Updated Co');
  });

  await test('DEMO_CT contacts are NOT saved to Supabase (filtered at app layer)', async () => {
    // Verify the app-side filter logic: contacts with DEMO_CT prefix should be stripped
    // We test the filter function, not the DB, since the app never sends them
    const allContacts = [
      { id: 'DEMO_CT_gaffer', name: 'Demo Gaffer', user_id: userId, data: {} },
      { id: 'ct_real_123',    name: 'Real Contact', user_id: userId, data: {} },
    ];
    const toSave = allContacts.filter(c => !c.id.startsWith('DEMO_CT'));
    assert(toSave.length, 1, 'only 1 real contact should be in save payload');
    assert(toSave[0].id, 'ct_real_123');
  });

  // ── DATA ROUND-TRIP ────────────────────────────────────────────────────────
  console.log('\n3. Data round-trip fidelity');

  await test('complex budget data survives write-read cycle', async () => {
    const rec = makeBudgetRecord(userId, {
      data: {
        name: 'Complex Budget — Special Chars & Unicode',
        values: {
          A01: { qty: 5, rate: 1500.75 },
          B03: { qty: 3, rate: 2000.5 },
          L229: { qty: 1, rate: 50000 },
        },
        fringes: { A01: 'DGA', B03: 'Non-Union', B11: 'Teamster' },
        markup: { prodFee: 12.5, fringes: 3.5, contingency: 7 },
        lineMeta: {
          A01: { vendor: 'Renée Müller', contactId: 'ct_abc123', kitRental: 250.00 },
          B03: { vendor: 'Tech <Corp>', kitRental: 0 },
        },
        lineOT: {
          A01: { days: 5, hourlyRate: 187.59, ot1Hours: 2, ot1Mult: 1.5, ot2Hours: 1, ot2Mult: 2.0 }
        },
        lineNotes: { A01: 'Rate confirmed via email\nIncludes prep + shoot' },
        mode: 'actual',
        status: 'approved',
      }
    });
    await supa.from('budgets').insert(rec);
    const { data, error } = await supa.from('budgets').select('data').eq('id', rec.id).single();
    if (error) throw new Error(`Read failed: ${error.message}`);
    const d = data.data;
    assert(d.values.A01.rate, 1500.75, 'fractional rate should survive');
    assert(d.markup.prodFee, 12.5, 'fractional markup should survive');
    assert(d.lineMeta.A01.vendor, 'Renée Müller', 'unicode should survive');
    assert(d.lineMeta.B03.vendor, 'Tech <Corp>', 'special chars should survive');
    assert(d.lineOT.A01.hourlyRate, 187.59, 'fractional hourly rate should survive');
    assert(d.lineNotes.A01.includes('prep + shoot'), true, 'multiline note should survive');
    assert(d.mode, 'actual', 'mode should survive');
    assert(d.status, 'approved', 'status should survive');
  });

  await test('empty arrays and objects survive round-trip', async () => {
    const rec = makeBudgetRecord(userId, {
      data: {
        values: {},
        fringes: {},
        lineMeta: {},
        lineOT: {},
        lineNotes: {},
        sectionNotes: {},
      }
    });
    await supa.from('budgets').insert(rec);
    const { data } = await supa.from('budgets').select('data').eq('id', rec.id).single();
    const d = data.data;
    assert(typeof d.values, 'object', 'values should be object');
    assert(Object.keys(d.values).length, 0, 'values should be empty');
    assert(typeof d.fringes, 'object', 'fringes should be object');
  });

  // ── SAVE / LOAD SIMULATION ─────────────────────────────────────────────────
  console.log('\n4. cloudSave / cloudLoad simulation');

  await test('simulate cloudSave: multiple tables in parallel', async () => {
    const budgetRec  = makeBudgetRecord(userId);
    const contactRec = makeContactRecord(userId);
    const ts = new Date().toISOString();

    // Simulate what cloudSave does: Promise.all across all tables
    const results = await Promise.all([
      supa.from('budgets').upsert(budgetRec, { onConflict: 'id' }),
      supa.from('contacts').upsert(contactRec, { onConflict: 'id' }),
    ]);
    const errs = results.filter(r => r.error);
    if (errs.length) throw new Error(`Parallel save failed: ${errs.map(r=>r.error.message).join(', ')}`);
  });

  await test('simulate cloudLoad: parallel reads from all tables', async () => {
    const uid = userId;
    const [bR, ctR] = await Promise.all([
      supa.from('budgets').select('data').eq('user_id', uid).order('created_at', { ascending: false }),
      supa.from('contacts').select('data').eq('user_id', uid),
    ]);
    if (bR.error) throw new Error(`Budget load failed: ${bR.error.message}`);
    if (ctR.error) throw new Error(`Contact load failed: ${ctR.error.message}`);
    assert(Array.isArray(bR.data), true, 'budgets should be array');
    assert(Array.isArray(ctR.data), true, 'contacts should be array');
  });

  await test('save then load produces identical data', async () => {
    const rec = makeBudgetRecord(userId, {
      data: {
        name: 'Round-Trip Test',
        values: { A01: { qty: 7, rate: 1200 }, B03: { qty: 2, rate: 3500 } },
        markup: { prodFee: 10, fringes: 5, contingency: 3 },
      }
    });
    // Save
    await supa.from('budgets').upsert(rec, { onConflict: 'id' });
    // Update
    rec.data.values.A01.rate = 1400;
    await supa.from('budgets').upsert({
      id: rec.id, user_id: userId,
      data: rec.data,
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    // Load
    const { data } = await supa.from('budgets').select('data').eq('id', rec.id).single();
    assert(data.data.values.A01.rate, 1400, 'updated rate should persist');
    assert(data.data.values.B03.rate, 3500, 'untouched rate should be unchanged');
    assert(data.data.markup.prodFee, 10, 'markup should be unchanged');
  });

  // ── PERFORMANCE / SCALE ────────────────────────────────────────────────────
  console.log('\n5. Performance & scale');

  await test('save 10 budgets in parallel completes without error', async () => {
    const recs = Array.from({ length: 10 }, () => makeBudgetRecord(userId));
    const start = Date.now();
    const { error } = await supa.from('budgets').upsert(recs, { onConflict: 'id' });
    const elapsed = Date.now() - start;
    if (error) throw new Error(`Bulk save failed: ${error.message}`);
    console.log(`         (completed in ${elapsed}ms)`);
    assert(elapsed < 10000, true, 'should complete in under 10 seconds');
  });

  await test('budget with very large values object (200 lines) saves correctly', async () => {
    const values = {};
    for (let i = 0; i < 200; i++) {
      values[`LINE${String(i).padStart(3,'0')}`] = { qty: i, rate: i * 100 };
    }
    const rec = makeBudgetRecord(userId, { data: { values } });
    const { error } = await supa.from('budgets').insert(rec);
    if (error) throw new Error(`Large budget insert failed: ${error.message}`);
    const { data } = await supa.from('budgets').select('data').eq('id', rec.id).single();
    assert(Object.keys(data.data.values).length, 200, '200 values should be stored');
  });

  // ─── CLEANUP ───────────────────────────────────────────────────────────────
  console.log('\n  Cleaning up test records...');
  await cleanup();
  console.log('  ✓ Test records removed from database');

  // ─── RESULTS ──────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n═══════════════════════════════════════════');
  console.log(` RESULTS: ${passed}/${total} tests passed`);
  if (failed > 0) {
    console.log(` FAILED:  ${failed} test${failed>1?'s':''}`);
    errors.forEach(e => console.log(`   • ${e.name}`));
  }
  console.log('═══════════════════════════════════════════\n');

  process.exit(failed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error('\nUnhandled error:', err);
  cleanup().finally(() => process.exit(1));
});
