/**
 * FARALLON BUDGET — MATH UNIT TESTS
 * ─────────────────────────────────
 * Tests every calculation function in isolation.
 * Run with: node math.test.js
 *
 * These tests extract the exact same logic used in index.html so we can
 * verify it without needing a browser. If any test fails it means the
 * app has a real math bug — not a test setup problem.
 */

// ─── REPLICATE APP CONSTANTS ─────────────────────────────────────────────────

// SAG rate per SAG-AFTRA Commercials Contract 2025-2026
const SAG_FRINGE_RATE = 23.5;
const FRINGE_RATES = {
  '': 0,
  'DGA': 46,
  'SAG': SAG_FRINGE_RATE,
  'Teamster': 49,
  'Union': 46,
  'Non-Union': 24,
};

// Minimal section definitions needed for fringe/group calculations
// Using a representative subset: ATL crew, Prep crew, Shoot crew, Post
const SECTIONS = [
  { code:'L', name:"Director's Fees", group:'atl',        atl:true,  isCrew:false,
    lines:[
      {id:'L227', name:'Director Prep',   unit:'days'},
      {id:'L228', name:'Director Travel', unit:'days'},
      {id:'L229', name:'Director Shoot',  unit:'days'},
      {id:'L230', name:'Director Post',   unit:'days'},
      {id:'L231', name:'Fringes',         unit:'flat'},
    ]
  },
  { code:'A', name:'Prep Crew', group:'production', atl:false, isCrew:true,
    lines:[
      {id:'A01', name:'Line Producer',    unit:'days'},
      {id:'A03', name:'DP',               unit:'days'},
      {id:'A11', name:'Gaffer',           unit:'days'},
    ]
  },
  { code:'B', name:'Shoot Crew', group:'production', atl:false, isCrew:true,
    lines:[
      {id:'B01', name:'Line Producer',    unit:'days'},
      {id:'B03', name:'DP',               unit:'days'},
      {id:'B11', name:'Gaffer',           unit:'days'},
    ]
  },
  { code:'C', name:'Prep & Wrap Expenses', group:'production', atl:false, isCrew:false,
    lines:[
      {id:'C01', name:'Casting Director', unit:'days'},
      {id:'C02', name:'Office',           unit:'flat'},
    ]
  },
  { code:'O', name:'Editorial', group:'post', atl:false, isCrew:false,
    lines:[
      {id:'O01', name:'Editor',           unit:'days'},
      {id:'O02', name:'Assistant Editor', unit:'days'},
    ]
  },
];

// ─── REPLICATE APP CALCULATION FUNCTIONS ─────────────────────────────────────

// Global prefs — defaults match the app's initial state
let prefs = { otMult1: 1.5, otMult2: 2.0 };

function lineOTTotal(item, b) {
  const ot = (b.lineOT||{})[item.id];
  if(!ot || !ot.hourlyRate) return 0;
  const days   = parseFloat(ot.days)||0;
  const hrRate = parseFloat(ot.hourlyRate)||0;
  const ot1H   = parseFloat(ot.ot1Hours)||0;
  const ot1M   = parseFloat(ot.ot1Mult) || (prefs.otMult1 ?? 1.5);
  const ot2H   = parseFloat(ot.ot2Hours)||0;
  const ot2M   = parseFloat(ot.ot2Mult) || (prefs.otMult2 ?? 2.0);
  const perDay = ot1H*hrRate*ot1M + ot2H*hrRate*ot2M;
  return days * perDay;
}

function lineTotal(item, b) {
  const v = b.values[item.id]||{};
  const rate = parseFloat(v.rate)||0;
  const meta = (b.lineMeta||{})[item.id]||{};
  const kitRental = parseFloat(meta.kitRental)||0;
  if(item.unit==='flat') return rate;
  const qty = parseFloat(v.qty)||0;
  return qty * rate + qty * kitRental + lineOTTotal(item, b);
}

function lineFringeAmt(item, b) {
  const sec = SECTIONS.find(s=>s.lines.find(l=>l.id===item.id));
  if(!sec?.isCrew) return 0;
  const code = b.fringes[item.id]||'';
  const pct = FRINGE_RATES[code]||0;
  return lineTotal(item,b)*(pct/100);
}

function sectionTotal(sec, b) { return sec.lines.reduce((s,l)=>s+lineTotal(l,b),0); }
function sectionFringeTotal(sec, b) { return sec.isCrew ? sec.lines.reduce((s,l)=>s+lineFringeAmt(l,b),0) : 0; }

function groupSubtotal(groupKey, b) {
  return SECTIONS.filter(s=>s.group===groupKey).reduce((s,sec)=>s+sectionTotal(sec,b)+sectionFringeTotal(sec,b),0);
}
function btlSubtotal(b) { return groupSubtotal('production',b)+groupSubtotal('post',b); }
function allSubtotal(b) { return btlSubtotal(b)+groupSubtotal('atl',b); }

function grandTotal(b) {
  const btl = btlSubtotal(b);
  const atl = groupSubtotal('atl',b);
  const fee = btl * ((parseFloat(b.markup.prodFee)||0)/100);
  const fringesAdj = btl * ((parseFloat(b.markup.fringes)||0)/100);
  const cont = (btl+fee) * ((parseFloat(b.markup.contingency)||0)/100);
  return atl + btl + fee + fringesAdj + cont;
}

// ─── TEST RUNNER ──────────────────────────────────────────────────────────────

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
  // Use tolerance for floating point comparisons
  const tolerance = 0.001;
  if(typeof expected === 'number') {
    if(Math.abs(actual - expected) > tolerance) {
      throw new Error(`${msg || ''}\n     Expected: ${expected}\n     Got:      ${actual}`);
    }
  } else {
    if(actual !== expected) {
      throw new Error(`${msg || ''}\n     Expected: ${expected}\n     Got:      ${actual}`);
    }
  }
}

function makeBudget(overrides = {}) {
  return {
    id: 'test-' + Math.random(),
    name: 'Test Budget',
    values: {},
    actuals: {},
    fringes: {},
    lineOT: {},
    lineMeta: {},
    markup: { prodFee: 0, fringes: 0, contingency: 0 },
    ...overrides
  };
}

// ─── TEST SUITES ──────────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════');
console.log(' FARALLON BUDGET — MATH UNIT TESTS');
console.log('═══════════════════════════════════════════\n');

// ── 1. lineTotal: basic ─────────────────────────────────────────────────────
console.log('1. lineTotal — Basic calculations');

test('zero values return zero', () => {
  const b = makeBudget();
  const line = { id:'A01', unit:'days' };
  assert(lineTotal(line, b), 0);
});

test('qty × rate = correct total', () => {
  const b = makeBudget({ values: { A01: { qty: 3, rate: 1500 } } });
  assert(lineTotal({ id:'A01', unit:'days' }, b), 4500);
});

test('flat unit ignores qty', () => {
  const b = makeBudget({ values: { C02: { qty: 5, rate: 2000 } } });
  assert(lineTotal({ id:'C02', unit:'flat' }, b), 2000, 'flat should only be rate value');
});

test('flat unit with zero qty still returns rate', () => {
  const b = makeBudget({ values: { C02: { rate: 750 } } });
  assert(lineTotal({ id:'C02', unit:'flat' }, b), 750);
});

test('missing values default to 0', () => {
  const b = makeBudget({ values: { A01: { qty: 5 } } }); // rate missing
  assert(lineTotal({ id:'A01', unit:'days' }, b), 0);
});

test('string numbers are parsed correctly', () => {
  const b = makeBudget({ values: { A01: { qty: '5', rate: '1200.50' } } });
  assert(lineTotal({ id:'A01', unit:'days' }, b), 6002.5);
});

test('kit rental adds to line total per qty', () => {
  const b = makeBudget({
    values:   { A01: { qty: 3, rate: 1500 } },
    lineMeta: { A01: { kitRental: 200 } }
  });
  // expected: 3*1500 + 3*200 = 4500 + 600 = 5100
  assert(lineTotal({ id:'A01', unit:'days' }, b), 5100);
});

test('kit rental does not affect flat lines', () => {
  const b = makeBudget({
    values:   { C02: { rate: 2000 } },
    lineMeta: { C02: { kitRental: 500 } }  // kit shouldn't matter for flat
  });
  assert(lineTotal({ id:'C02', unit:'flat' }, b), 2000);
});

// ── 2. lineOTTotal ───────────────────────────────────────────────────────────
console.log('\n2. lineOTTotal — Overtime calculations');

test('no OT data returns 0', () => {
  const b = makeBudget();
  assert(lineOTTotal({ id:'A01' }, b), 0);
});

test('OT with no hourlyRate returns 0', () => {
  const b = makeBudget({ lineOT: { A01: { days:3, ot1Hours:2 } } });
  assert(lineOTTotal({ id:'A01' }, b), 0, 'missing hourlyRate should be 0');
});

test('time-and-a-half OT calculation', () => {
  // 2 days × (2 hours × $100/hr × 1.5) = 2 × 300 = 600
  const b = makeBudget({ lineOT: { A01: { days:2, hourlyRate:100, ot1Hours:2, ot1Mult:1.5, ot2Hours:0 } } });
  assert(lineOTTotal({ id:'A01' }, b), 600);
});

test('double-time OT calculation', () => {
  // 3 days × (2 hours × $80/hr × 2.0) = 3 × 320 = 960
  const b = makeBudget({ lineOT: { A01: { days:3, hourlyRate:80, ot1Hours:0, ot2Hours:2, ot2Mult:2.0 } } });
  assert(lineOTTotal({ id:'A01' }, b), 960);
});

test('combined OT tiers: T&H + DT', () => {
  // 1 day × (2h × $100 × 1.5) + (1h × $100 × 2.0) = 300 + 200 = 500
  const b = makeBudget({ lineOT: { B03: { days:1, hourlyRate:100, ot1Hours:2, ot1Mult:1.5, ot2Hours:1, ot2Mult:2.0 } } });
  assert(lineOTTotal({ id:'B03' }, b), 500);
});

test('OT falls back to prefs.otMult1 when mult not specified', () => {
  prefs.otMult1 = 1.5;
  prefs.otMult2 = 2.0;
  const b = makeBudget({ lineOT: { A01: { days:1, hourlyRate:100, ot1Hours:2 } } });
  // 1 × 2 × 100 × 1.5 = 300
  assert(lineOTTotal({ id:'A01' }, b), 300, 'should fall back to prefs.otMult1=1.5');
});

test('OT adds to lineTotal correctly', () => {
  const b = makeBudget({
    values: { A01: { qty: 5, rate: 1000 } },
    lineOT: { A01: { days:5, hourlyRate:125, ot1Hours:2, ot1Mult:1.5, ot2Hours:0 } }
  });
  // base: 5*1000=5000, OT: 5*(2*125*1.5)=1875, total=6875
  assert(lineTotal({ id:'A01', unit:'days' }, b), 6875);
});

// ── 3. lineFringeAmt ─────────────────────────────────────────────────────────
console.log('\n3. lineFringeAmt — Fringe calculations');

test('no fringe code returns 0', () => {
  const b = makeBudget({ values: { A01: { qty:5, rate:1000 } }, fringes: {} });
  assert(lineFringeAmt({ id:'A01', unit:'days' }, b), 0);
});

test('non-crew section returns 0 fringe', () => {
  const b = makeBudget({ values: { O01: { qty:5, rate:1000 } }, fringes: { O01: 'Non-Union' } });
  // O section is NOT isCrew, so fringe = 0
  assert(lineFringeAmt({ id:'O01', unit:'days' }, b), 0, 'editorial is not crew');
});

test('DGA fringe: 46% of line total', () => {
  const b = makeBudget({ values: { A01: { qty:5, rate:1000 } }, fringes: { A01: 'DGA' } });
  // 5*1000=5000, 5000*0.46=2300
  assert(lineFringeAmt({ id:'A01', unit:'days' }, b), 2300);
});

test('SAG fringe: 23.5% of line total (SAG-AFTRA Commercials Contract 2025-2026)', () => {
  const b = makeBudget({ values: { B01: { qty:3, rate:2000 } }, fringes: { B01: 'SAG' } });
  // 3*2000=6000, 6000*0.235=1410
  assert(lineFringeAmt({ id:'B01', unit:'days' }, b), 1410);
});

test('Teamster fringe: 49% of line total', () => {
  const b = makeBudget({ values: { A11: { qty:2, rate:800 } }, fringes: { A11: 'Teamster' } });
  // 2*800=1600, 1600*0.49=784
  assert(lineFringeAmt({ id:'A11', unit:'days' }, b), 784);
});

test('Non-Union fringe: 24% of line total', () => {
  const b = makeBudget({ values: { A03: { qty:4, rate:1500 } }, fringes: { A03: 'Non-Union' } });
  // 4*1500=6000, 6000*0.24=1440
  assert(lineFringeAmt({ id:'A03', unit:'days' }, b), 1440);
});

test('fringe includes OT in base', () => {
  const b = makeBudget({
    values: { A01: { qty:1, rate:1000 } },
    fringes: { A01: 'DGA' },
    lineOT: { A01: { days:1, hourlyRate:125, ot1Hours:2, ot1Mult:1.5 } }
  });
  // lineTotal = 1000 + 375(OT) = 1375, fringe = 1375*0.46 = 632.5
  assert(lineFringeAmt({ id:'A01', unit:'days' }, b), 632.5);
});

test('fringe includes kit rental in base', () => {
  const b = makeBudget({
    values:   { A03: { qty:2, rate:1000 } },
    fringes:  { A03: 'DGA' },
    lineMeta: { A03: { kitRental: 200 } }
  });
  // lineTotal = 2*1000 + 2*200 = 2400, fringe = 2400*0.46 = 1104
  assert(lineFringeAmt({ id:'A03', unit:'days' }, b), 1104);
});

// ── 4. sectionTotal & sectionFringeTotal ─────────────────────────────────────
console.log('\n4. sectionTotal / sectionFringeTotal');

test('empty section totals to 0', () => {
  const b = makeBudget();
  const sec = SECTIONS.find(s=>s.code==='A');
  assert(sectionTotal(sec, b), 0);
});

test('section sums all line totals', () => {
  const b = makeBudget({ values: {
    A01: { qty:5, rate:1000 },  // 5000
    A03: { qty:3, rate:2000 },  // 6000
    A11: { qty:2, rate:800  },  // 1600
  }});
  const sec = SECTIONS.find(s=>s.code==='A');
  assert(sectionTotal(sec, b), 12600);
});

test('non-crew section returns 0 fringe total', () => {
  const b = makeBudget({ values: { O01: { qty:10, rate:500 } }, fringes: { O01:'DGA' } });
  const sec = SECTIONS.find(s=>s.code==='O');
  assert(sectionFringeTotal(sec, b), 0, 'editorial is not crew');
});

test('crew section sums all line fringes', () => {
  const b = makeBudget({
    values: { A01: { qty:5, rate:1000 }, A03: { qty:3, rate:2000 } },
    fringes: { A01:'DGA', A03:'Non-Union' }
  });
  // A01: 5000*0.46=2300, A03: 6000*0.24=1440
  const sec = SECTIONS.find(s=>s.code==='A');
  assert(sectionFringeTotal(sec, b), 3740);
});

// ── 5. grandTotal — Full rollup ───────────────────────────────────────────────
console.log('\n5. grandTotal — Full budget rollup');

test('empty budget grandTotal is 0', () => {
  const b = makeBudget();
  assert(grandTotal(b), 0);
});

test('ATL costs not included in BTL for fee/contingency calculations', () => {
  const b = makeBudget({
    values: { L229: { qty:1, rate: 50000 } },  // ATL: Director Shoot — days unit, qty:1
    markup: { prodFee: 10, fringes: 0, contingency: 0 }
  });
  // ATL should not have production fee applied
  // atl=50000, btl=0, fee=0*0.10=0 → grand=50000
  const result = grandTotal(b);
  assert(result, 50000, 'ATL should not attract production fee');
});

test('production fee applies to BTL only', () => {
  const b = makeBudget({
    values: {
      A01: { qty: 5, rate: 1000 }, // BTL: 5000
      L229: { qty:1, rate: 10000 }, // ATL: 10000
    },
    markup: { prodFee: 10, fringes: 0, contingency: 0 }
  });
  // btl=5000, fee=500, atl=10000 → grand=15500
  assert(grandTotal(b), 15500);
});

test('contingency applies to BTL+fee, not ATL', () => {
  const b = makeBudget({
    values: { A01: { qty: 10, rate: 1000 } }, // BTL: 10000
    markup: { prodFee: 10, fringes: 0, contingency: 10 }
  });
  // btl=10000, fee=1000, cont=(10000+1000)*0.10=1100 → grand=12100
  assert(grandTotal(b), 12100);
});

test('markup fringe adjustment applies to BTL only', () => {
  const b = makeBudget({
    values: { A01: { qty: 10, rate: 1000 } }, // BTL: 10000
    markup: { prodFee: 0, fringes: 5, contingency: 0 }
  });
  // btl=10000, fringesAdj=500, grand=10500
  assert(grandTotal(b), 10500);
});

test('full markup stack: fee + fringes + contingency', () => {
  const b = makeBudget({
    values: { A01: { qty: 10, rate: 1000 } }, // BTL: 10000
    markup: { prodFee: 10, fringes: 5, contingency: 10 }
  });
  // btl=10000, fee=1000, fringesAdj=500, cont=(10000+1000)*0.10=1100 → grand=12600
  assert(grandTotal(b), 12600);
});

test('line-level fringes do NOT double-count with markup fringes', () => {
  // Line fringes and markup fringes are separate — they should both be present but distinct
  const b = makeBudget({
    values: { A01: { qty: 10, rate: 1000 } }, // base: 10000
    fringes: { A01: 'Non-Union' },  // line fringe: 2400 (adds to lineTotal via sectionFringeTotal)
    markup: { prodFee: 0, fringes: 0, contingency: 0 }
  });
  // sectionFringeTotal adds to groupSubtotal, so btl includes 10000+2400=12400
  const btl = btlSubtotal(b);
  assert(btl, 12400, 'btl should include line-level fringe');
});

// ── 6. Edge cases & precision ─────────────────────────────────────────────────
console.log('\n6. Edge cases & floating point precision');

test('large numbers: $1M budget calculates correctly', () => {
  const b = makeBudget({
    values: { A01: { qty: 100, rate: 10000 } }, // 1,000,000
    markup: { prodFee: 10, fringes: 0, contingency: 5 }
  });
  // btl=1000000, fee=100000, cont=(1000000+100000)*0.05=55000 → 1155000
  assert(grandTotal(b), 1155000);
});

test('fractional rates: $1500.75/day × 3 days', () => {
  const b = makeBudget({ values: { A03: { qty: 3, rate: 1500.75 } } });
  assert(lineTotal({ id:'A03', unit:'days' }, b), 4502.25);
});

test('fractional qty: 1.5 days × $2000/day', () => {
  const b = makeBudget({ values: { A01: { qty: 1.5, rate: 2000 } } });
  assert(lineTotal({ id:'A01', unit:'days' }, b), 3000);
});

test('string zero values do not produce NaN', () => {
  const b = makeBudget({ values: { A01: { qty:'0', rate:'0' } } });
  const result = lineTotal({ id:'A01', unit:'days' }, b);
  assert(isNaN(result), false, 'should not produce NaN');
  assert(result, 0);
});

test('null/undefined values do not produce NaN or throw', () => {
  const b = makeBudget({ values: { A01: { qty:null, rate:undefined } } });
  const result = lineTotal({ id:'A01', unit:'days' }, b);
  assert(isNaN(result), false);
  assert(result, 0);
});

test('fringe percentage precision: 46% × $12345 within tolerance', () => {
  const b = makeBudget({ values: { A01: { qty:1, rate:12345 } }, fringes: { A01:'DGA' } });
  // 12345 * 0.46 = 5678.7
  assert(lineFringeAmt({ id:'A01', unit:'days' }, b), 5678.7);
});

test('contingency on zero BTL is zero', () => {
  const b = makeBudget({ markup: { prodFee: 15, fringes: 10, contingency: 20 } });
  assert(grandTotal(b), 0, 'zero values × any markup = 0');
});

test('100% fringe rate would double the cost', () => {
  // Test the math structure: if fringe were 100%, cost doubles
  const b = makeBudget({ values: { A01: { qty:5, rate:1000 } }, fringes: { A01:'DGA' } });
  const base = sectionTotal(SECTIONS.find(s=>s.code==='A'), b);
  const fringe = sectionFringeTotal(SECTIONS.find(s=>s.code==='A'), b);
  // DGA is 46%, so fringe = base * 0.46
  assert(fringe / base, 0.46, 'fringe/base ratio should equal fringe rate');
});

// ── 7. OT edge cases ──────────────────────────────────────────────────────────
console.log('\n7. OT edge cases');

test('OT with zero days = zero', () => {
  const b = makeBudget({ lineOT: { A01: { days:0, hourlyRate:100, ot1Hours:3, ot1Mult:1.5 } } });
  assert(lineOTTotal({ id:'A01' }, b), 0);
});

test('OT with zero hours = zero', () => {
  const b = makeBudget({ lineOT: { A01: { days:5, hourlyRate:100, ot1Hours:0, ot2Hours:0 } } });
  assert(lineOTTotal({ id:'A01' }, b), 0);
});

test('OT multiplier of 1.0 = straight time', () => {
  const b = makeBudget({ lineOT: { A01: { days:1, hourlyRate:100, ot1Hours:4, ot1Mult:1.0 } } });
  // 1 × 4 × 100 × 1.0 = 400
  assert(lineOTTotal({ id:'A01' }, b), 400);
});

test('multiple crew OT accumulates correctly in section total', () => {
  const b = makeBudget({
    values: {
      A01: { qty:5, rate:1000 },  // 5000
      A03: { qty:5, rate:2000 },  // 10000
    },
    lineOT: {
      A01: { days:5, hourlyRate:125, ot1Hours:2, ot1Mult:1.5 },  // 5*(2*125*1.5)=1875
      A03: { days:5, hourlyRate:250, ot1Hours:2, ot1Mult:1.5 },  // 5*(2*250*1.5)=3750
    }
  });
  const sec = SECTIONS.find(s=>s.code==='A');
  // (5000+1875) + (10000+3750) + A11(0) = 20625
  assert(sectionTotal(sec, b), 20625);
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
