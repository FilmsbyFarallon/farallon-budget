/**
 * FARALLON BUDGET — USER BEHAVIOR SIMULATION
 * ────────────────────────────────────────────
 * Simulates realistic line producer workflows at scale.
 * Generates budgets, mutates them, verifies totals at every step.
 * Does NOT require a browser — tests the data and math layer directly.
 *
 * Run with: node simulate.js
 * Run more iterations: ITERATIONS=500 node simulate.js
 */

const ITERATIONS = parseInt(process.env.ITERATIONS || '100');

// ─── REPLICATE APP CONSTANTS ─────────────────────────────────────────────────

// SAG rate per SAG-AFTRA Commercials Contract 2025-2026
const SAG_FRINGE_RATE = 23.5;
const FRINGE_RATES = { '':0, 'DGA':46, 'SAG':SAG_FRINGE_RATE, 'Teamster':49, 'Union':46, 'Non-Union':24 };
const FRINGE_KEYS  = Object.keys(FRINGE_RATES);

const SECTIONS = [
  { code:'L', group:'atl',        atl:true,  isCrew:false,
    lines:[{id:'L227',unit:'days'},{id:'L228',unit:'days'},{id:'L229',unit:'days'},{id:'L230',unit:'days'},{id:'L231',unit:'flat'}] },
  { code:'A', group:'production', atl:false, isCrew:true,
    lines:[{id:'A01',unit:'days'},{id:'A03',unit:'days'},{id:'A11',unit:'days'},{id:'A16',unit:'days'},{id:'A24',unit:'days'}] },
  { code:'B', group:'production', atl:false, isCrew:true,
    lines:[{id:'B01',unit:'days'},{id:'B03',unit:'days'},{id:'B11',unit:'days'},{id:'B16',unit:'days'},{id:'B24',unit:'days'}] },
  { code:'C', group:'production', atl:false, isCrew:false,
    lines:[{id:'C01',unit:'days'},{id:'C02',unit:'flat'},{id:'C03',unit:'flat'}] },
  { code:'I', group:'production', atl:false, isCrew:false,
    lines:[{id:'I01',unit:'flat'},{id:'I02',unit:'flat'},{id:'I03',unit:'flat'}] },
  { code:'O', group:'post',       atl:false, isCrew:false,
    lines:[{id:'O01',unit:'days'},{id:'O02',unit:'days'}] },
  { code:'P', group:'post',       atl:false, isCrew:false,
    lines:[{id:'P01',unit:'flat'},{id:'P02',unit:'flat'}] },
];

const ALL_LINES = SECTIONS.flatMap(s => s.lines.map(l => ({ ...l, sec: s })));
const CREW_LINES = ALL_LINES.filter(l => l.sec.isCrew);

let prefs = { otMult1: 1.5, otMult2: 2.0 };

// ─── CALCULATION FUNCTIONS (exact copy from app) ──────────────────────────────

function lineOTTotal(item, b) {
  const ot = (b.lineOT||{})[item.id];
  if(!ot || !ot.hourlyRate) return 0;
  const days=parseFloat(ot.days)||0, hrRate=parseFloat(ot.hourlyRate)||0;
  const ot1H=parseFloat(ot.ot1Hours)||0, ot1M=parseFloat(ot.ot1Mult)||(prefs.otMult1??1.5);
  const ot2H=parseFloat(ot.ot2Hours)||0, ot2M=parseFloat(ot.ot2Mult)||(prefs.otMult2??2.0);
  return days * (ot1H*hrRate*ot1M + ot2H*hrRate*ot2M);
}

function lineTotal(item, b) {
  const v=b.values[item.id]||{}, rate=parseFloat(v.rate)||0;
  const kit=parseFloat(((b.lineMeta||{})[item.id]||{}).kitRental)||0;
  if(item.unit==='flat') return rate;
  const qty=parseFloat(v.qty)||0;
  return qty*rate + qty*kit + lineOTTotal(item,b);
}

function lineFringeAmt(item, b) {
  const sec = SECTIONS.find(s=>s.lines.find(l=>l.id===item.id));
  if(!sec?.isCrew) return 0;
  const code=b.fringes[item.id]||'', pct=FRINGE_RATES[code]||0;
  return lineTotal(item,b)*(pct/100);
}

function sectionTotal(sec, b) { return sec.lines.reduce((s,l)=>s+lineTotal(l,b),0); }
function sectionFringeTotal(sec, b) { return sec.isCrew ? sec.lines.reduce((s,l)=>s+lineFringeAmt(l,b),0):0; }
function groupSubtotal(key, b) { return SECTIONS.filter(s=>s.group===key).reduce((s,sec)=>s+sectionTotal(sec,b)+sectionFringeTotal(sec,b),0); }
function btlSubtotal(b) { return groupSubtotal('production',b)+groupSubtotal('post',b); }

function grandTotal(b) {
  const btl=btlSubtotal(b), atl=groupSubtotal('atl',b);
  const fee=btl*((parseFloat(b.markup.prodFee)||0)/100);
  const fri=btl*((parseFloat(b.markup.fringes)||0)/100);
  const cont=(btl+fee)*((parseFloat(b.markup.contingency)||0)/100);
  return atl+btl+fee+fri+cont;
}

// ─── RANDOM HELPERS ───────────────────────────────────────────────────────────

function rand(min, max) { return Math.random() * (max - min) + min; }
function randInt(min, max) { return Math.floor(rand(min, max+1)); }
function pick(arr) { return arr[randInt(0, arr.length-1)]; }

function randomRate() {
  // Realistic day rates for commercial production
  const ranges = [[500,1000],[1000,2000],[2000,3500],[3500,6000]];
  const [min,max] = pick(ranges);
  return Math.round(rand(min, max) * 4) / 4; // rounded to nearest 0.25
}

function randomDays() {
  return pick([0.5, 1, 1.5, 2, 3, 4, 5, 8, 10]);
}

function randomMarkup() {
  return {
    prodFee:      pick([0, 5, 8, 10, 12, 15, 20]),
    fringes:      pick([0, 2, 5, 8]),
    contingency:  pick([0, 3, 5, 7, 10])
  };
}

function makeTestBudget() {
  const b = {
    id: 'sim_' + Date.now() + '_' + Math.random().toString(36).slice(2,6),
    name: 'Simulation Budget',
    values: {},
    fringes: {},
    lineMeta: {},
    lineOT: {},
    markup: randomMarkup()
  };
  // Randomly populate some lines
  ALL_LINES.forEach(line => {
    if (Math.random() < 0.4) { // 40% of lines get values
      b.values[line.id] = {
        qty:  line.unit === 'flat' ? 1 : randomDays(),
        rate: randomRate()
      };
      // Random fringe for crew lines
      if (line.sec.isCrew && Math.random() < 0.6) {
        b.fringes[line.id] = pick(FRINGE_KEYS.filter(k=>k!==''));
      }
      // Random kit rental for some crew
      if (line.sec.isCrew && Math.random() < 0.2) {
        if (!b.lineMeta[line.id]) b.lineMeta[line.id] = {};
        b.lineMeta[line.id].kitRental = Math.round(rand(100, 1000));
      }
      // Random OT for some crew
      if (line.sec.isCrew && Math.random() < 0.15) {
        b.lineOT[line.id] = {
          days: randomDays(),
          hourlyRate: Math.round(rand(50,300)),
          ot1Hours: randInt(0,4), ot1Mult: 1.5,
          ot2Hours: randInt(0,2), ot2Mult: 2.0,
        };
      }
    }
  });
  return b;
}

// ─── INVARIANT CHECKERS ────────────────────────────────────────────────────────

function checkNaN(b, label) {
  const grand = grandTotal(b);
  if (isNaN(grand) || !isFinite(grand)) {
    throw new Error(`grandTotal is ${grand} in ${label}`);
  }
  // Check all section totals
  SECTIONS.forEach(sec => {
    const st = sectionTotal(sec, b);
    const ft = sectionFringeTotal(sec, b);
    if (isNaN(st) || !isFinite(st)) throw new Error(`sectionTotal[${sec.code}] is ${st} in ${label}`);
    if (isNaN(ft) || !isFinite(ft)) throw new Error(`sectionFringeTotal[${sec.code}] is ${ft} in ${label}`);
  });
  return grand;
}

function checkNonNegative(b, label) {
  ALL_LINES.forEach(line => {
    const lt = lineTotal(line, b);
    const lf = lineFringeAmt(line, b);
    if (lt < 0) throw new Error(`lineTotal[${line.id}] is negative: ${lt} in ${label}`);
    if (lf < 0) throw new Error(`lineFringeAmt[${line.id}] is negative: ${lf} in ${label}`);
  });
}

function checkMarkupMonotonicity(b) {
  // Adding a positive markup % should increase or maintain the grand total
  const base = grandTotal(b);
  const withFee = grandTotal({ ...b, markup: { ...b.markup, prodFee: (parseFloat(b.markup.prodFee)||0) + 5 } });
  const btl = btlSubtotal(b);
  if (btl > 0 && withFee < base - 0.001) {
    throw new Error(`Adding 5% prodFee decreased grandTotal: ${base} → ${withFee}`);
  }
}

function checkSectionSumMatchesGroup(b) {
  // Sum of individual section totals must equal groupSubtotal
  for (const groupKey of ['atl', 'production', 'post']) {
    const fromGroup = groupSubtotal(groupKey, b);
    const fromSections = SECTIONS
      .filter(s => s.group === groupKey)
      .reduce((sum, sec) => sum + sectionTotal(sec, b) + sectionFringeTotal(sec, b), 0);
    if (Math.abs(fromGroup - fromSections) > 0.001) {
      throw new Error(`Group[${groupKey}] mismatch: groupSubtotal=${fromGroup}, sum-of-sections=${fromSections}`);
    }
  }
}

function checkMutationConsistency(b) {
  // After changing a rate, grandTotal should update consistently
  const before = grandTotal(b);
  const targetLine = CREW_LINES.find(l => b.values[l.id]?.rate > 0);
  if (!targetLine) return; // no crew lines set, skip
  
  const origRate = b.values[targetLine.id].rate;
  b.values[targetLine.id].rate = origRate * 2; // double the rate
  const after = grandTotal(b);
  b.values[targetLine.id].rate = origRate; // restore
  const restored = grandTotal(b);
  
  if (Math.abs(restored - before) > 0.001) {
    throw new Error(`Mutation not idempotent: before=${before}, restored=${restored}`);
  }
  // Doubling a positive rate in a budget with BTL costs should increase total
  if (after < before - 0.001) {
    throw new Error(`Doubling rate decreased total: ${before} → ${after}`);
  }
}

// ─── SIMULATION RUNNER ────────────────────────────────────────────────────────

console.log('\n═══════════════════════════════════════════');
console.log(' FARALLON BUDGET — USER BEHAVIOR SIMULATION');
console.log(`═══════════════════════════════════════════`);
console.log(` Running ${ITERATIONS} iterations...\n`);

const startTime = Date.now();
let simPassed = 0, simFailed = 0;
const simErrors = [];

function runSimulation(iteration) {
  const label = `iteration ${iteration}`;
  try {
    const b = makeTestBudget();
    
    // 1. Basic sanity: no NaN, no Infinity
    const grand = checkNaN(b, label);
    
    // 2. All line totals non-negative
    checkNonNegative(b, label);
    
    // 3. Group subtotals must equal sum of their sections
    checkSectionSumMatchesGroup(b);
    
    // 4. ATL not affected by prodFee markup
    const atlAmount = groupSubtotal('atl', b);
    const btl = btlSubtotal(b);
    const expectedGrand = atlAmount + btl
      + btl * ((parseFloat(b.markup.prodFee)||0)/100)
      + btl * ((parseFloat(b.markup.fringes)||0)/100)
      + (btl + btl * ((parseFloat(b.markup.prodFee)||0)/100)) * ((parseFloat(b.markup.contingency)||0)/100);
    if (Math.abs(grand - expectedGrand) > 0.01) {
      throw new Error(`Grand total formula mismatch: computed=${grand}, expected=${expectedGrand}, diff=${Math.abs(grand-expectedGrand)}`);
    }
    
    // 5. Markup monotonicity (positive fee → non-decreasing total)
    checkMarkupMonotonicity(b);
    
    // 6. Mutation consistency (change and restore)
    checkMutationConsistency(b);
    
    // 7. JSON serialization round-trip preserves grand total
    const serialized = JSON.parse(JSON.stringify(b));
    const restoredGrand = grandTotal(serialized);
    if (Math.abs(grand - restoredGrand) > 0.001) {
      throw new Error(`Grand total changed after JSON round-trip: ${grand} → ${restoredGrand}`);
    }
    
    simPassed++;
  } catch(e) {
    simFailed++;
    simErrors.push({ iteration, error: e.message });
    if (simErrors.length <= 5) { // Show first 5 errors inline
      console.error(`  ✗  Iteration ${iteration}: ${e.message}`);
    }
  }
}

// Run all iterations
for (let i = 1; i <= ITERATIONS; i++) {
  runSimulation(i);
}

const elapsed = ((Date.now() - startTime) / 1000).toFixed(2);

// ─── TARGETED EDGE CASE SCENARIOS ────────────────────────────────────────────

console.log(' Running targeted edge case scenarios...\n');
let edgePassed = 0, edgeFailed = 0;
const edgeErrors = [];

function edgeTest(name, fn) {
  try {
    fn();
    console.log(`  ✓  ${name}`);
    edgePassed++;
  } catch(e) {
    console.error(`  ✗  ${name}: ${e.message}`);
    edgeFailed++;
    edgeErrors.push({ name, error: e.message });
  }
}

// ── Scenario: Producer builds typical TVC budget ──────────────────────────────
edgeTest('typical TVC: 1 prep + 1 shoot + 2 post', () => {
  const b = {
    id:'tvc',
    values:{
      A01:{qty:5,rate:1800}, A03:{qty:5,rate:3500}, A11:{qty:5,rate:1200},  // Prep crew
      B01:{qty:2,rate:1800}, B03:{qty:2,rate:3500}, B11:{qty:2,rate:1200},  // Shoot crew
      O01:{qty:10,rate:800},                                                  // Editor
      I01:{rate:8000}, I02:{rate:3500},                                       // Equipment
    },
    fringes:{ A01:'Non-Union', A03:'Non-Union', A11:'Non-Union',
               B01:'Non-Union', B03:'Non-Union', B11:'Non-Union' },
    markup:{ prodFee:10, fringes:0, contingency:5 },
    lineMeta:{}, lineOT:{},
  };
  const grand = checkNaN(b, 'TVC scenario');
  if (grand < 50000) throw new Error(`TVC budget grand total suspiciously low: $${grand.toFixed(2)}`);
  if (grand > 500000) throw new Error(`TVC budget grand total suspiciously high: $${grand.toFixed(2)}`);
});

// ── Scenario: Budget with only ATL (director-only deal) ───────────────────────
edgeTest('ATL-only budget: director fee with no BTL crew', () => {
  const b = {
    id:'atl_only',
    values:{ L229:{qty:1,rate:50000} },  // Director shoot: 1 day × $50K
    fringes:{}, markup:{ prodFee:15, fringes:0, contingency:0 },
    lineMeta:{}, lineOT:{},
  };
  const grand = grandTotal(b);
  // ATL not subject to prodFee: grand should be exactly 50000
  if (Math.abs(grand - 50000) > 0.001) {
    throw new Error(`ATL-only: expected $50,000 but got $${grand.toFixed(2)}`);
  }
});

// ── Scenario: Budget with only BTL (no director deal yet) ─────────────────────
edgeTest('BTL-only budget: production fee applies correctly', () => {
  const b = {
    id:'btl_only',
    values:{ A01:{qty:5,rate:1000}, B03:{qty:3,rate:2000} },
    fringes:{}, markup:{ prodFee:10, fringes:0, contingency:0 },
    lineMeta:{}, lineOT:{},
  };
  const grand = grandTotal(b);
  // btl = 5000 + 6000 = 11000, fee = 1100, grand = 12100
  if (Math.abs(grand - 12100) > 0.001) {
    throw new Error(`BTL-only: expected $12,100 but got $${grand.toFixed(2)}`);
  }
});

// ── Scenario: Union escalation check ──────────────────────────────────────────
edgeTest('all-DGA crew: fringe = 46% of crew total', () => {
  const b = {
    id:'dga',
    values:{ A01:{qty:5,rate:1000}, A03:{qty:5,rate:2000} },
    fringes:{ A01:'DGA', A03:'DGA' },
    markup:{ prodFee:0, fringes:0, contingency:0 },
    lineMeta:{}, lineOT:{},
  };
  const sec = SECTIONS.find(s=>s.code==='A');
  const crew = sectionTotal(sec, b);   // 5000+10000=15000
  const fri  = sectionFringeTotal(sec, b); // 15000*0.46=6900
  const ratio = fri / crew;
  if (Math.abs(ratio - 0.46) > 0.0001) {
    throw new Error(`DGA fringe ratio should be 0.46, got ${ratio.toFixed(6)}`);
  }
});

// ── Scenario: Mixed fringe rates in same section ──────────────────────────────
edgeTest('mixed fringe rates accumulate independently', () => {
  const b = {
    id:'mixed_fringe',
    values:{ A01:{qty:1,rate:1000}, A03:{qty:1,rate:1000}, A11:{qty:1,rate:1000} },
    fringes:{ A01:'DGA', A03:'SAG', A11:'Non-Union' },
    markup:{ prodFee:0, fringes:0, contingency:0 },
    lineMeta:{}, lineOT:{},
  };
  const sec = SECTIONS.find(s=>s.code==='A');
  const fri = sectionFringeTotal(sec, b);
  // 1000*0.46 + 1000*0.235 + 1000*0.24 = 460+235+240 = 935
  if (Math.abs(fri - 935) > 0.001) {
    throw new Error(`Mixed fringe: expected $935 got $${fri.toFixed(2)}`);
  }
});

// ── Scenario: Kit rental accumulates per day ──────────────────────────────────
edgeTest('kit rental: 5 days × ($1000 rate + $200 kit) = $6000', () => {
  const item = { id:'A03', unit:'days', sec: SECTIONS.find(s=>s.code==='A') };
  const b = {
    id:'kit',
    values:{ A03:{qty:5,rate:1000} },
    lineMeta:{ A03:{kitRental:200} },
    fringes:{}, lineOT:{}, markup:{ prodFee:0,fringes:0,contingency:0 }
  };
  const total = lineTotal(item, b);
  if (Math.abs(total - 6000) > 0.001) {
    throw new Error(`Kit rental: expected $6,000 got $${total.toFixed(2)}`);
  }
});

// ── Scenario: OT compounds with base rate in fringe calc ──────────────────────
edgeTest('OT included in fringe base: (base + OT) × fringe%', () => {
  const item = { id:'A01', unit:'days', sec: SECTIONS.find(s=>s.code==='A') };
  const b = {
    id:'ot_fringe',
    values:{ A01:{qty:1,rate:1000} },
    fringes:{ A01:'DGA' },
    lineOT:{ A01:{ days:1, hourlyRate:125, ot1Hours:2, ot1Mult:1.5, ot2Hours:0 } },
    lineMeta:{}, markup:{ prodFee:0,fringes:0,contingency:0 }
  };
  // base=1000, OT=1*(2*125*1.5)=375, lineTotal=1375
  // fringe=1375*0.46=632.5
  const lt = lineTotal(item, b);
  const lf = lineFringeAmt(item, b);
  if (Math.abs(lt - 1375) > 0.001) throw new Error(`lineTotal with OT: expected 1375 got ${lt}`);
  if (Math.abs(lf - 632.5) > 0.001) throw new Error(`fringe on OT: expected 632.5 got ${lf}`);
});

// ── Scenario: Zero-filled budget has zero grand total ─────────────────────────
edgeTest('completely empty budget has $0 grand total', () => {
  const b = { id:'empty', values:{}, fringes:{}, lineMeta:{}, lineOT:{}, markup:{prodFee:15,fringes:10,contingency:5} };
  const grand = grandTotal(b);
  if (grand !== 0) throw new Error(`Empty budget should be $0, got $${grand}`);
});

// ── Scenario: Rapid rate edits don't corrupt accumulation ─────────────────────
edgeTest('100 sequential rate edits produce correct final total', () => {
  const b = { id:'rapid', values:{ A01:{qty:5,rate:1000} }, fringes:{}, lineMeta:{}, lineOT:{}, markup:{prodFee:0,fringes:0,contingency:0} };
  // Simulate 100 rapid edits
  const rates = Array.from({length:100}, () => Math.round(rand(500,3000)));
  rates.forEach(r => { b.values['A01'].rate = r; });
  // After all edits, total should exactly reflect last rate
  const finalRate = rates[rates.length-1];
  const item = { id:'A01', unit:'days', sec: SECTIONS[1] };
  const total = lineTotal(item, b);
  if (Math.abs(total - 5 * finalRate) > 0.001) {
    throw new Error(`After 100 edits: expected ${5*finalRate} got ${total}`);
  }
});

// ── Scenario: Contingency is on (BTL + fee), not BTL alone ──────────────────
edgeTest('contingency base includes production fee', () => {
  const b = {
    id:'cont_base',
    values:{ A01:{qty:10,rate:1000} }, // btl=10000
    fringes:{}, lineMeta:{}, lineOT:{},
    markup:{ prodFee:10, fringes:0, contingency:10 }
  };
  const grand = grandTotal(b);
  // btl=10000, fee=1000, cont=(10000+1000)*0.10=1100, grand=12100
  if (Math.abs(grand - 12100) > 0.001) {
    throw new Error(`Contingency base: expected $12,100 got $${grand.toFixed(2)}`);
  }
});

// ─── RESULTS ─────────────────────────────────────────────────────────────────

const totalIterations = simPassed + simFailed;
const totalEdge = edgePassed + edgeFailed;
const allPassed = simFailed === 0 && edgeFailed === 0;

console.log('\n═══════════════════════════════════════════');
console.log(' SIMULATION RESULTS');
console.log('═══════════════════════════════════════════');
console.log(` Random simulations: ${simPassed}/${totalIterations} passed  (${elapsed}s)`);
console.log(` Edge case scenarios: ${edgePassed}/${totalEdge} passed`);
console.log(` Total: ${simPassed+edgePassed}/${totalIterations+totalEdge} passed`);

if (simErrors.length > 5) {
  console.log(`\n (${simErrors.length - 5} more simulation errors not shown)`);
}
if (edgeErrors.length > 0) {
  console.log('\n FAILED EDGE CASES:');
  edgeErrors.forEach(e => console.log(`   • ${e.name}: ${e.error}`));
}
console.log('═══════════════════════════════════════════\n');

process.exit(allPassed ? 0 : 1);
