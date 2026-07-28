/**
 * Discover intent + match regression tests (no network).
 * Usage: node scripts/test-discover-intent.mjs
 */
import { parseIntent, summarizeIntent } from '../src/lib/discover/parseIntent.js';
import { scoreBriefMatch } from '../src/lib/discover/investmentBrief.js';

let failed = 0;
function assert(cond, msg) {
  if (!cond) {
    failed += 1;
    console.error('FAIL', msg);
  } else {
    console.log('ok', msg);
  }
}

const lc = parseIntent('3 bed houses in Little Chalfont under £600k that need modernising');
assert(lc.location === 'Little Chalfont', `location=${lc.location}`);
assert(lc.minBedrooms === 3, `beds=${lc.minBedrooms}`);
assert(lc.maxPrice === 600000, `max=${lc.maxPrice}`);
assert(lc.strategy === 'flip', `strategy=${lc.strategy}`);
assert(!lc.keywords?.length, `keywords should be empty, got ${lc.keywords}`);
assert(lc.rankHints?.some((h) => /modern|refurb|dated/.test(h)), `rankHints=${lc.rankHints}`);
assert(lc.minGrossYield == null, 'no silent yield floor');

const word = parseIntent('three-bedroom house in Manchester under £500k needing modernising');
assert(word.minBedrooms === 3, `word beds=${word.minBedrooms}`);
assert(word.location === 'Manchester', `word loc=${word.location}`);
assert(!word.keywords?.includes('refurbishment'), 'no refurbishment keyword trap');

const rental = parseIntent("I'm looking for properties in Manchester that would make strong long-term rental investments with reliable tenant demand and good monthly returns.");
assert(rental.location === 'Manchester', 'rental loc');
assert(rental.minGrossYield == null, `rental should not invent 7% yield, got ${rental.minGrossYield}`);
assert(rental.boosts.preferHighYield || rental.boosts.preferRentalDemand, 'rental boosts');

const auction = parseIntent('auction houses in Leeds under 200k');
assert(auction.keywords.includes('auction'), 'auction keyword kept');

console.log('chips', summarizeIntent(lc));

// Match % honesty
const goodFit = scoreBriefMatch({
  price: 450000,
  beds: 3,
  propertyType: 'terraced',
  location: 'Little Chalfont',
  address: 'Station Approach, Little Chalfont, HP7',
  postcode: 'HP7 9PN',
  condition: { overall: 'Fair' },
  comparables: { available: true, deviationPct: -9, undervalued: 'possible', confidence: 'medium' },
  flip: { uplift: 25000 },
  description: 'dated kitchen needs modernising large rear garden',
  score: 70,
}, lc);
assert(goodFit.matchPct >= 70, `good fit match=${goodFit.matchPct}`);

const turnkey = scoreBriefMatch({
  price: 450000,
  beds: 3,
  propertyType: 'detached',
  location: 'Little Chalfont',
  address: 'Little Chalfont HP7',
  postcode: 'HP7 1AA',
  condition: { overall: 'Good' },
  comparables: { available: true, deviationPct: -1, undervalued: 'no', confidence: 'medium' },
  flip: { uplift: -10000 },
  description: 'newly refurbished throughout',
  score: 55,
}, lc);
assert(turnkey.matchPct < 55, `turnkey should score low, got ${turnkey.matchPct}`);
assert(turnkey.checklist.some((c) => !c.ok && /Good condition|modernisation/i.test(c.text)), 'turnkey fail chip');

const overBudget = scoreBriefMatch({
  price: 750000,
  beds: 3,
  propertyType: 'house',
  location: 'Little Chalfont',
  address: 'Little Chalfont',
  condition: { overall: 'Fair' },
  comparables: { available: false },
  score: 60,
}, lc);
assert(overBudget.matchPct < goodFit.matchPct, `over budget ${overBudget.matchPct} < ${goodFit.matchPct}`);
assert(overBudget.checklist.some((c) => !c.ok && /Over budget/i.test(c.text)), 'over budget chip');

if (failed) {
  console.error(`\n${failed} failed`);
  process.exit(1);
}
console.log('\nAll discover intent/match tests passed');
