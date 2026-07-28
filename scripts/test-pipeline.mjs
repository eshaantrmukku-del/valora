/* Pipeline smoke test — run via: node scripts/run-test.mjs */
import { analyseProperty } from '../src/lib/propertyIntelligence.js';
import { computeDealFinancials } from '../src/lib/engine/finance.js';
import { classifyCondition } from '../src/lib/engine/condition.js';
import { computeInvestmentScore } from '../src/lib/engine/score.js';

// Deterministic finance check
const deal = computeDealFinancials({ price: 250000, monthlyRent: 1200, depositPct: 25, interestRate: 4.5, termYears: 25, interestOnly: true, refurbCost: 0 });
console.log('FINANCE', {
  deposit: deal.deposit, stampDuty: deal.stampDuty, totalCash: deal.totalCashRequired,
  mortgage: deal.monthlyMortgage, cashFlow: deal.monthlyCashFlow, grossYield: deal.grossYield,
  coc: deal.cashOnCash, breakEven: deal.breakEvenRent,
});

// Condition rules
console.log('CONDITION poor:', classifyCondition({ title: '3 bed house', description: 'In need of full refurbishment. New kitchen required.' }));
console.log('CONDITION good:', classifyCondition({ title: '2 bed flat', description: 'Recently refurbished throughout, immaculate.' }).overall);
console.log('CONDITION unknown:', classifyCondition({ title: '2 bed flat', description: 'Close to transport links.' }).overall);

// Score determinism
const s1 = computeInvestmentScore({ grossYield: 7.5, areaGrowth5yr: 20, rentalDemand: 'high', condition: 'Good', comparableDeviationPct: -8, monthlyCashFlow: 250, riskFlags: [] });
const s2 = computeInvestmentScore({ grossYield: 7.5, areaGrowth5yr: 20, rentalDemand: 'high', condition: 'Good', comparableDeviationPct: -8, monthlyCashFlow: 250, riskFlags: [] });
console.log('SCORE deterministic:', s1.score === s2.score, s1.score, s1.parts);

// Full async pipeline with a realistic meta (as extracted from a live listing)
const meta = {
  fetched: true,
  source: 'test',
  title: '3 bedroom terraced house for sale in Braxfield Road, London SE4',
  description: '3 bed terraced house for sale in Braxfield Road, Brockley for £600,000. Leasehold. In need of some modernisation.',
  price: 600000,
  beds: 3,
  propertyType: 'terraced',
  postcode: 'SE4 2AW',
  listingType: 'sale',
  tenure: 'Leasehold',
};
const parsed = { valid: true, portal: 'Rightmove', listingId: '123', city: 'London', postcode: 'SE4 2AW' };

const report = await analyseProperty({ url: 'https://www.rightmove.co.uk/properties/123', id: 'test-123', meta, parsed });
console.log('\nPIPELINE OK');
console.log('score:', report.score, report.grade);
console.log('scoreParts:', report.scoreParts);
console.log('comps:', report.comparables.available, 'count', report.comparables.count, 'median', report.comparables.median, 'deviation', report.comparables.deviationPct, 'district', report.comparables.district);
console.log('sample[0]:', report.comparables.sample[0]);
console.log('condition:', report.condition.overall, report.condition.refurbLow, '-', report.condition.refurbHigh, report.condition.signals);
console.log('deal cashflow/mo:', report.deal.monthlyCashFlow, 'CoC:', report.deal.cashOnCash, 'breakEven:', report.deal.breakEvenRent);
console.log('rent confidence:', report.rentEstimate.confidence);
console.log('provenance:', report.provenance);
console.log('\nAI summary:');
for (const [k, v] of Object.entries(report.aiInsight)) if (v) console.log(` ${k}: ${v}`);
