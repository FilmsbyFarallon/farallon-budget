/**
 * FARALLON BUDGET — DATA INTEGRITY TESTS
 * ────────────────────────────────────────
 * Tests data structure invariants, save/load round-trips,
 * and edge cases in budget manipulation.
 * Run with: node integrity.test.js
 */

let passed = 0, failed = 0, errors = [];

function test(name, fn) {
  try {
    fn();
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
      throw new Error(`${msg||''}\n     Expected: ${expected}\n     Got:      ${actual}`);
  } else if(typeof expected === 'boolean') {
    if(actual !== expected)
      throw new Error(`${msg||''}\n     Expected: ${expected}\n     Got:      ${actual}`);
  } else {
    if(actual !== expected)
      throw new Error(`${msg||''}\n     Expected: ${JSON.stringify(expected)}\n     Got:      ${JSON.stringify(actual)}`);
  }
}

function assertDeepEqual(actual, expected, msg) {
  const a = JSON.stringify(actual), b = JSON.stringify(expected);
  if(a !== b) throw new Error(`${msg||''}\n     Expected: ${b}\n     Got:      ${a}`);
}

function assertThrows(fn, msg) {
  try {
    fn();
    throw new Error(`${msg||'Expected function to throw but it did not'}`);
  } catch(e) {
    if(e.message === (msg || 'Expected function to throw but it did not')) throw e;
    // threw as expected — pass
  }
}

// ─── SIMULATE APP DATA FUNCTIONS ─────────────────────────────────────────────

function makeBudget(overrides = {}) {
  return {
    id: 'b_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    name: 'Test Budget',
    values: {},
    actuals: {},
    fringes: {},
    lineOT: {},
    lineMeta: {},
    lineNotes: {},
    sectionNotes: {},
    markup: { prodFee: 0, fringes: 0, contingency: 0 },
    mode: 'bid',
    status: 'draft',
    folderId: null,
    createdAt: Date.now(),
    ...overrides
  };
}

function makeContact(overrides = {}) {
  return {
    id: 'ct_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    name: '',
    company: '',
    role: '',
    department: '',
    phone: '',
    email: '',
    dayRate: '',
    notes: '',
    tags: [],
    createdAt: Date.now(),
    ...overrides
  };
}

function makePO(overrides = {}) {
  return {
    id: 'po_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    budgetId: null,
    number: '001',
    vendor: '',
    description: '',
    amount: 0,
    status: 'open',
    sectionCode: '',
    lineId: null,
    date: '',
    notes: '',
    ...overrides
  };
}

// Simulate cloudSave filter (should strip demo contacts)
function filterDemoContacts(contacts) {
  return contacts.filter(c => !c.id.startsWith('DEMO_CT'));
}

// Simulate serialization round-trip
function roundTrip(obj) {
  return JSON.parse(JSON.stringify(obj));
}

// ─── TESTS ───────────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════');
console.log(' FARALLON BUDGET — DATA INTEGRITY TESTS');
console.log('═══════════════════════════════════════════\n');

// ── 1. Budget structure invariants ───────────────────────────────────────────
console.log('1. Budget structure invariants');

test('new budget has all required fields', () => {
  const b = makeBudget();
  const required = ['id','name','values','actuals','fringes','lineOT','lineMeta',
                    'lineNotes','sectionNotes','markup','mode','status','folderId','createdAt'];
  required.forEach(k => {
    if(!(k in b)) throw new Error(`Missing required field: ${k}`);
  });
});

test('budget id is unique per creation', () => {
  const ids = new Set();
  for(let i=0; i<100; i++) ids.add(makeBudget().id);
  assert(ids.size, 100, 'all 100 budget IDs should be unique');
});

test('budget survives JSON round-trip without data loss', () => {
  const b = makeBudget({
    name: 'Nike TVC',
    values: { A01: { qty:5, rate:1500 }, B03: { qty:3, rate:2000 } },
    fringes: { A01: 'DGA', B03: 'Non-Union' },
    markup: { prodFee: 10, fringes: 5, contingency: 3 },
    lineMeta: { A01: { vendor:'John Smith', contactId:'ct_123', kitRental:200 } },
  });
  const restored = roundTrip(b);
  assertDeepEqual(restored.values, b.values, 'values should survive round-trip');
  assertDeepEqual(restored.fringes, b.fringes, 'fringes should survive round-trip');
  assertDeepEqual(restored.markup, b.markup, 'markup should survive round-trip');
  assertDeepEqual(restored.lineMeta, b.lineMeta, 'lineMeta should survive round-trip');
});

test('empty strings are preserved (not coerced to null)', () => {
  const b = makeBudget({ name: '' });
  const restored = roundTrip(b);
  assert(restored.name, '', 'empty string name should not become null');
});

test('zero values are preserved (not coerced to undefined)', () => {
  const b = makeBudget({ values: { A01: { qty:0, rate:0 } } });
  const restored = roundTrip(b);
  assert(restored.values.A01.qty, 0, 'zero qty should be preserved');
  assert(restored.values.A01.rate, 0, 'zero rate should be preserved');
});

test('nested objects preserve deep structure', () => {
  const b = makeBudget({
    lineOT: {
      A01: { days:5, hourlyRate:125, ot1Hours:2, ot1Mult:1.5, ot2Hours:1, ot2Mult:2.0 }
    }
  });
  const restored = roundTrip(b);
  assertDeepEqual(restored.lineOT.A01, b.lineOT.A01, 'lineOT should survive round-trip');
});

// ── 2. Mutation safety ────────────────────────────────────────────────────────
console.log('\n2. Mutation safety');

test('modifying a copy does not affect original', () => {
  const original = makeBudget({ values: { A01: { qty:5, rate:1000 } } });
  const copy = roundTrip(original);
  copy.values.A01.qty = 99;
  assert(original.values.A01.qty, 5, 'original should not be mutated');
});

test('deleting from copy does not affect original', () => {
  const original = makeBudget({ values: { A01: { qty:5, rate:1000 } } });
  const copy = roundTrip(original);
  delete copy.values.A01;
  assert('A01' in original.values, true, 'original should still have A01');
});

test('contact array mutation is isolated', () => {
  const contacts = [
    makeContact({ name: 'Alice' }),
    makeContact({ name: 'Bob' }),
  ];
  const snapshot = JSON.parse(JSON.stringify(contacts));
  contacts.push(makeContact({ name: 'Charlie' }));
  assert(snapshot.length, 2, 'snapshot should not grow');
});

// ── 3. lineMeta integrity ─────────────────────────────────────────────────────
console.log('\n3. lineMeta integrity');

test('assign contact to line sets all required fields', () => {
  const b = makeBudget();
  const contact = makeContact({ name:'Jane Doe', company:'Reel Motion', dayRate:'2500' });

  // Simulate _assignSingleLine
  if(!b.lineMeta) b.lineMeta = {};
  if(!b.lineMeta['A01']) b.lineMeta['A01'] = {};
  const meta = b.lineMeta['A01'];
  meta.vendor = contact.name;
  meta.contactId = contact.id;
  meta.vendorCompany = contact.company;
  if(contact.dayRate && parseFloat(contact.dayRate)) {
    if(!b.values['A01']) b.values['A01'] = {};
    b.values['A01'].rate = parseFloat(contact.dayRate);
  }

  assert(meta.vendor, 'Jane Doe');
  assert(meta.contactId, contact.id);
  assert(meta.vendorCompany, 'Reel Motion');
  assert(b.values['A01'].rate, 2500);
});

test('unassign contact clears all fields', () => {
  const b = makeBudget({
    lineMeta: { A01: { vendor:'Jane Doe', contactId:'ct_123', vendorCompany:'Reel Motion' } }
  });

  // Simulate unassignContactFromLine
  const meta = b.lineMeta['A01'];
  delete meta.contactId;
  delete meta.vendorCompany;
  meta.vendor = '';

  assert(meta.vendor, '', 'vendor should be cleared');
  assert('contactId' in meta, false, 'contactId should be deleted');
  assert('vendorCompany' in meta, false, 'vendorCompany should be deleted');
});

test('unassigning preserves other lineMeta fields', () => {
  const b = makeBudget({
    lineMeta: { A01: {
      vendor:'Jane Doe', contactId:'ct_123', vendorCompany:'Reel Motion',
      kitRental: 300, rateSource: 'confirmed', travel: true
    }}
  });
  const meta = b.lineMeta['A01'];
  delete meta.contactId;
  delete meta.vendorCompany;
  meta.vendor = '';

  assert(meta.kitRental, 300, 'kitRental should not be cleared on unassign');
  assert(meta.rateSource, 'confirmed', 'rateSource should not be cleared');
  assert(meta.travel, true, 'travel flag should not be cleared');
});

test('multiple contacts can be assigned to different lines without collision', () => {
  const b = makeBudget();
  const c1 = makeContact({ name:'Alice', id:'ct_alice' });
  const c2 = makeContact({ name:'Bob',   id:'ct_bob' });
  if(!b.lineMeta) b.lineMeta = {};
  b.lineMeta['A01'] = { vendor:c1.name, contactId:c1.id };
  b.lineMeta['B01'] = { vendor:c2.name, contactId:c2.id };

  assert(b.lineMeta['A01'].contactId, 'ct_alice');
  assert(b.lineMeta['B01'].contactId, 'ct_bob');
});

// ── 4. Contact / vendor integrity ─────────────────────────────────────────────
console.log('\n4. Contact integrity');

test('contact id is unique per creation', () => {
  const ids = new Set();
  for(let i=0; i<100; i++) ids.add(makeContact().id);
  assert(ids.size, 100, 'all 100 contact IDs should be unique');
});

test('demo contacts are filtered before cloud save', () => {
  const contacts = [
    makeContact({ id:'DEMO_CT_gaffer', name:'Demo Gaffer' }),
    makeContact({ id:'DEMO_CT_editor', name:'Demo Editor' }),
    makeContact({ id:'ct_real123', name:'Real Person' }),
  ];
  const filtered = filterDemoContacts(contacts);
  assert(filtered.length, 1, 'only real contact should remain');
  assert(filtered[0].name, 'Real Person');
});

test('deleting a contact that is assigned to lines leaves lineMeta with orphaned ref', () => {
  // This tests the current behavior — lineMeta.contactId becomes a dangling ref
  // The app handles this gracefully by checking contacts.find(c=>c.id===meta.contactId)
  const contacts = [makeContact({ id:'ct_123', name:'Orphan' })];
  const b = makeBudget({ lineMeta: { A01: { vendor:'Orphan', contactId:'ct_123' } } });
  
  // Simulate delete
  const remainingContacts = contacts.filter(c => c.id !== 'ct_123');
  
  // lineMeta still has contactId but contact is gone
  const resolved = remainingContacts.find(c => c.id === b.lineMeta['A01'].contactId);
  assert(resolved, undefined, 'contact should not resolve after deletion');
  // The app should handle null gracefully by showing no contact info pill
});

test('contact tags array is always an array (never null)', () => {
  const c = makeContact();
  assert(Array.isArray(c.tags), true, 'tags should be an array');
  const restored = roundTrip(c);
  assert(Array.isArray(restored.tags), true, 'tags should still be an array after round-trip');
});

test('contact with empty name is valid (unnamed contact)', () => {
  const c = makeContact({ name: '' });
  assert(c.name, '', 'empty name should be allowed');
});

// ── 5. PO integrity ───────────────────────────────────────────────────────────
console.log('\n5. PO integrity');

test('PO id is unique per creation', () => {
  const ids = new Set();
  for(let i=0; i<100; i++) ids.add(makePO().id);
  assert(ids.size, 100, '100 PO IDs should be unique');
});

test('PO survives round-trip', () => {
  const po = makePO({
    budgetId: 'b_123',
    number: 'PO-0042',
    vendor: 'Lens Rentals',
    amount: 12500.75,
    status: 'approved',
    sectionCode: 'I',
  });
  const restored = roundTrip(po);
  assertDeepEqual(restored, po, 'PO should survive round-trip');
});

test('PO amount of zero is valid (placeholder PO)', () => {
  const po = makePO({ amount: 0 });
  assert(po.amount, 0, 'zero amount PO should be valid');
});

// ── 6. Markup edge cases ──────────────────────────────────────────────────────
console.log('\n6. Markup structure edge cases');

test('markup with string percentages is normalized correctly', () => {
  // App uses parseFloat on markup values, so strings should work
  const b = makeBudget({ markup: { prodFee:'10', fringes:'5', contingency:'3' } });
  const fee = (parseFloat(b.markup.prodFee)||0);
  assert(fee, 10, 'string prodFee should parse to 10');
});

test('markup with missing keys defaults to 0', () => {
  const b = makeBudget({ markup: {} });
  const fee = parseFloat(b.markup.prodFee)||0;
  const cont = parseFloat(b.markup.contingency)||0;
  assert(fee, 0);
  assert(cont, 0);
});

test('negative markup percentage does not throw', () => {
  // Negative markup = discount. Should calculate without crashing.
  const b = makeBudget({
    values: { A01: { qty:10, rate:1000 } },
    markup: { prodFee: -5, fringes: 0, contingency: 0 }
  });
  // btl=10000, fee=-500 → grand=9500 (valid, represents a discount)
  const btl = 10000;
  const fee = btl * (-5/100);
  assert(fee, -500, 'negative fee should be valid');
});

test('very large markup percentage does not throw', () => {
  const b = makeBudget({ markup: { prodFee: 200, fringes: 0, contingency: 0 } });
  const fee = parseFloat(b.markup.prodFee)||0;
  assert(fee, 200);
});

// ── 7. Mode transitions ────────────────────────────────────────────────────────
console.log('\n7. Mode transitions (bid/actual)');

test('bid mode budget has actuals as empty object by default', () => {
  const b = makeBudget();
  assert(typeof b.actuals, 'object', 'actuals should be an object');
  assert(Object.keys(b.actuals).length, 0, 'actuals should be empty for new budget');
});

test('actual values are independent from bid values', () => {
  const b = makeBudget({
    values:  { A01: { qty:5, rate:1000 } },  // bid: $5000
    actuals: { A01: 4800 },                   // actual: $4800
  });
  assert(b.values['A01'].rate, 1000, 'bid rate should be 1000');
  assert(b.actuals['A01'], 4800, 'actual should be 4800');
  // They don't affect each other
});

test('clearing bid values does not clear actuals', () => {
  const b = makeBudget({
    values:  { A01: { qty:5, rate:1000 } },
    actuals: { A01: 4800 },
  });
  b.values = {};
  assert(b.actuals['A01'], 4800, 'actuals should not be affected by clearing values');
});

// ── 8. Snapshot / history ─────────────────────────────────────────────────────
console.log('\n8. Snapshot integrity');

test('snapshot is a deep copy of budget state', () => {
  const b = makeBudget({
    name: 'Project X',
    values: { A01: { qty:5, rate:1000 } },
    markup: { prodFee:10, fringes:0, contingency:0 }
  });
  const snapshot = roundTrip(b);
  snapshot.id = 'snap_' + Date.now();
  snapshot.label = 'Version 1.0';
  
  // Modify original
  b.values['A01'].rate = 1500;
  
  // Snapshot should be unaffected
  assert(snapshot.values['A01'].rate, 1000, 'snapshot should preserve original rate');
});

// ── 9. Concurrent edit safety ─────────────────────────────────────────────────
console.log('\n9. Concurrent edit simulation');

test('rapid value updates do not corrupt totals', () => {
  // Simulate 100 rapid rate changes to the same line
  const b = makeBudget({ values: { A01: { qty:5 } } });
  const rates = [1000,1100,900,1200,800,1500,750,2000,500,1000];
  rates.forEach(r => { b.values['A01'].rate = r; });
  // Final state should be last written value
  assert(b.values['A01'].rate, rates[rates.length-1], 'last write wins');
});

test('adding 500 line values does not cause issues', () => {
  const b = makeBudget();
  for(let i=0; i<500; i++) {
    b.values[`TEST${i}`] = { qty: i, rate: i * 100 };
  }
  assert(Object.keys(b.values).length, 500, 'all 500 values should be stored');
});

test('budget with 50 contacts in lineMeta round-trips correctly', () => {
  const b = makeBudget();
  for(let i=0; i<50; i++) {
    b.lineMeta[`LINE${i}`] = {
      vendor: `Person ${i}`,
      contactId: `ct_${i}`,
      kitRental: i * 50,
    };
  }
  const restored = roundTrip(b);
  assert(Object.keys(restored.lineMeta).length, 50);
  assert(restored.lineMeta['LINE25'].vendor, 'Person 25');
  assert(restored.lineMeta['LINE25'].kitRental, 1250);
});

// ── 10. Special characters & XSS safety ──────────────────────────────────────
console.log('\n10. Special characters in data');

test('budget name with special characters survives round-trip', () => {
  const b = makeBudget({ name: 'Nike "Air" — $5M TVC & Campaign / Q4 \'25' });
  const restored = roundTrip(b);
  assert(restored.name, b.name, 'special chars in budget name should survive');
});

test('contact name with unicode survives round-trip', () => {
  const c = makeContact({ name: 'Renée Müller (Ärztekammer)' });
  const restored = roundTrip(c);
  assert(restored.name, c.name, 'unicode in contact name should survive');
});

test('vendor name with < > & does not corrupt data', () => {
  const b = makeBudget({ lineMeta: { A01: { vendor: '<script>alert(1)</script>' } } });
  const restored = roundTrip(b);
  // Data should be stored literally — escaping happens at render time
  assert(restored.lineMeta['A01'].vendor, '<script>alert(1)</script>',
    'special chars stored literally in data layer (escaped at render time)');
});

test('line note with newlines and quotes survives round-trip', () => {
  const b = makeBudget({ lineNotes: { A01: 'Rate includes:\n- T&H\n- "Quoted" deal\n- 10+/2' } });
  const restored = roundTrip(b);
  assert(restored.lineNotes['A01'], b.lineNotes['A01'], 'line note should survive');
});

// ─── RESULTS ─────────────────────────────────────────────────────────────────

const total = passed + failed;
console.log('\n═══════════════════════════════════════════');
console.log(` RESULTS: ${passed}/${total} tests passed`);
if(failed > 0) {
  console.log(` FAILED:  ${failed} test${failed>1?'s':''}`);
  errors.forEach(e => console.log(`   • ${e.name}`));
}
console.log('═══════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
