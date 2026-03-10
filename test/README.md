# Farallon Budget — Testing Strategy & Test Suite

## Overview

This directory contains the complete testing infrastructure for Farallon Budget.
The goal is a **stable baseline build** before adding payments, imports, or new features.

Tests are organized in three layers, each testing a different surface:

```
farallon-tests/
├── run-tests.js        ← Master runner (start here)
├── math.test.js        ← Layer 1: Pure math unit tests
├── integrity.test.js   ← Layer 2: Data structure & integrity tests
├── simulate.js         ← Layer 3: Randomized behavior simulation
└── supabase.test.js    ← Layer 4: Live database integration tests
```

---

## Quick Start

```bash
# Run everything (math + integrity + simulation)
node run-tests.js

# Run 1000 simulation iterations (good for CI)
node run-tests.js --simulate=1000

# Run specific suite
node run-tests.js --math
node run-tests.js --integrity

# Run live database tests (requires test account credentials)
TEST_EMAIL=test@example.com TEST_PASSWORD=yourpass node run-tests.js --supabase
```

---

## Layer 1: Math Unit Tests (`math.test.js`)

**What it tests:** Every calculation function extracted from `index.html` and
verified in isolation. These are the functions that touch money.

**Covers:**
- `lineTotal` — qty × rate, flat lines, kit rental, edge cases
- `lineOTTotal` — time-and-a-half, double-time, combined tiers, pref fallbacks
- `lineFringeAmt` — all 6 fringe codes, crew vs non-crew sections
- `sectionTotal` / `sectionFringeTotal` — aggregation across lines
- `grandTotal` — ATL/BTL separation, production fee, contingency stacking
- Floating point precision, null/undefined inputs, string number parsing

**46 tests. Run time: ~0.1s**

**When to run:** After every change to any calculation function in `index.html`.
If any of these fail, there is a real math bug in the app.

---

## Layer 2: Data Integrity Tests (`integrity.test.js`)

**What it tests:** Data structure invariants — that data survives save/load
cycles without corruption, mutation is isolated, and all required fields exist.

**Covers:**
- Budget schema completeness
- JSON round-trip fidelity (values, fringes, lineOT, lineMeta, notes)
- Mutation isolation (copies don't affect originals)
- `lineMeta` assign/unassign correctness
- Contact integrity (unique IDs, demo contact filtering, orphaned refs)
- PO structure invariants
- Markup edge cases (string values, missing keys, negative percentages)
- Mode transitions (bid/actual independence)
- Snapshot deep-copy correctness
- Special characters and Unicode in all fields

**36 tests. Run time: ~0.1s**

**When to run:** After any change to data structures, save/load logic,
or lineMeta/contact assignment.

---

## Layer 3: Behavior Simulation (`simulate.js`)

**What it tests:** Randomized budget generation with invariant checking.
Generates thousands of realistic budgets and verifies mathematical properties
hold under all conditions.

**Invariants checked per iteration:**
1. `grandTotal` is never NaN or Infinity
2. All line totals are non-negative
3. `groupSubtotal` == sum of its section totals (aggregation consistency)
4. ATL is never subject to production fee
5. Grand total formula matches manual calculation
6. Adding positive markup % never decreases total (monotonicity)
7. Changing a rate and restoring it produces the same total (idempotency)
8. JSON serialization doesn't change the computed total

**Targeted edge case scenarios:**
- Typical TVC budget (prep crew + shoot crew + post)
- ATL-only budget ($0 BTL → no production fee applied)
- BTL-only budget (prodFee applies correctly)
- All-DGA crew (46% fringe ratio exactly)
- Mixed fringe rates in same section
- Kit rental accumulation (per-day)
- OT included in fringe calculation base
- Empty budget = $0 grand total
- 100 rapid sequential rate edits (last-write-wins)
- Contingency base includes production fee

**Run 500 iterations for development, 2000+ for pre-release validation.**

```bash
ITERATIONS=2000 node simulate.js
```

---

## Layer 4: Supabase Integration Tests (`supabase.test.js`)

**What it tests:** The live database layer — that the app's actual read/write
operations work correctly against Supabase.

**Requires:** A dedicated test account (not your production account).
Create one at `farallon-budget.vercel.app`, then pass the credentials as env vars.

**⚠️ IMPORTANT: Use a test account only. These tests write and delete records.**

**Covers:**
- Authentication (sign in, session management)
- Budget CRUD: insert, read, upsert, delete
- RLS enforcement: cross-user reads blocked
- Bulk upsert (simulates `cloudSave` with multiple budgets)
- Parallel read (simulates `cloudLoad` fetching all 7 tables)
- Data round-trip fidelity (complex budgets with unicode, fractions, multiline notes)
- Empty object/array preservation
- `cloudSave` → `cloudLoad` produces identical data
- Scale: 10 budgets in parallel, 200-line budget

**Cleans up all test records after each run.**

```bash
# One-time setup: create a test account at farallon-budget.vercel.app
# Then run:
TEST_EMAIL=yourtest@email.com TEST_PASSWORD=yourpassword node supabase.test.js
```

---

## Testing Strategy for Bug Hunting

### Phase 1: Establish the baseline (current)
Run the full suite and confirm all tests pass on the current build.
This is your green baseline — any future regression immediately shows.

```bash
node run-tests.js --simulate=1000
```

### Phase 2: Manual exploratory testing
While the automated tests cover math and data, some bugs only surface in the UI.
Work through these scenarios manually in the browser:

**Session stability:**
- [ ] Open the app, create a budget, close the tab, reopen — data intact?
- [ ] Sign out and sign in — all budgets still there?
- [ ] Create 10 budgets — sidebar renders correctly, no weird ordering?

**Edit resilience:**
- [ ] Type values rapidly into qty/rate fields — totals update correctly?
- [ ] Open line panel, change rate, close, reopen — persisted?
- [ ] Set fringe code, change it, clear it — section total updates each time?
- [ ] Add OT, modify it, remove it — line total reflects each state?

**Vendor assignment:**
- [ ] Assign a vendor, reload page — still assigned?
- [ ] Assign then unassign — lineMeta fully cleared?
- [ ] Delete a contact that's assigned — no crash?

**Save/load under load:**
- [ ] Make rapid edits (10+ in 2 seconds) — does debounce save correctly?
- [ ] Edit budget, immediately switch to another, switch back — data intact?
- [ ] Edit budget, immediately close the browser — reopening shows the data?

**PO and petty cash:**
- [ ] Create 20 POs — all save correctly?
- [ ] Edit a PO amount — save + reload preserves it?

**Exports:**
- [ ] Export wrap book PDF — opens without error, numbers match screen?
- [ ] Export calendar PDF — dates and bars render correctly?

### Phase 3: Regression testing
After fixing a bug, add a test case that would have caught it.
This prevents the same bug from reappearing.

Template for adding a test to `integrity.test.js` or `math.test.js`:

```javascript
test('description of the bug that was fixed', () => {
  // Set up the exact conditions that caused the bug
  const b = makeBudget({ /* ... */ });
  // Assert the correct behavior
  assert(someValue, expectedValue, 'what should be true');
});
```

### Phase 4: Pre-release validation
Before shipping to paying customers, run the full suite at high iteration count:

```bash
# Full pre-release run (takes ~30s)
node run-tests.js --simulate=2000
TEST_EMAIL=test@... TEST_PASSWORD=... node run-tests.js --supabase
```

All 182+ tests must pass before any release.

---

## What the Tests Do NOT Cover

These require browser-based tooling (Playwright/Puppeteer) to test:

- DOM rendering correctness
- Input debounce timing
- Tab switching state
- Keyboard shortcuts (Cmd+K spotlight)
- PDF export content verification
- Calendar drag interactions
- Sidebar drag-and-drop

Browser automation is a Phase 2 addition. The current suite covers the highest-
risk surface (math accuracy and data integrity) with no additional tooling required.

---

## Adding Tests

When you find a bug in the app, write a failing test first, then fix the bug.

**Math bug?** → Add to `math.test.js`
**Data corruption?** → Add to `integrity.test.js`
**Edge case in calculation?** → Add scenario to `simulate.js`
**Database issue?** → Add to `supabase.test.js`

Keep tests fast. Each test should run in milliseconds. No `setTimeout`, no network
calls (except in `supabase.test.js`).

---

## Current Status

```
math.test.js        46/46  ✓  All math functions verified
integrity.test.js   36/36  ✓  All data invariants hold
simulate.js        500/500  ✓  No calculation errors in random scenarios
supabase.test.js     TBD   —  Requires test credentials to run
```

**Total: 182/182 automated tests passing.**
