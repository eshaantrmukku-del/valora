/**
 * Investment score — deterministic weighted formula. The AI never chooses this.
 * Weights: Yield 25, Area growth 20, Rental demand 15, Condition 10,
 *          Market discount 15, Cash flow 10, Risk 5. (0–100)
 */

function clamp01(x) {
  return Math.max(0, Math.min(1, x));
}

export function computeInvestmentScore({
  grossYield,        // %
  areaGrowth5yr,     // %
  rentalDemand,      // 'very high' | 'high' | 'moderate' | 'low'
  condition,         // 'Good' | 'Fair' | 'Poor' | 'Unknown'
  comparableDeviationPct, // asking vs comps median, negative = cheaper
  monthlyCashFlow,   // £
  riskFlags = [],    // array of strings
  targetYield = null,
}) {
  const parts = {};

  // Yield (25): 3% → 0, 8%+ → 1; bonus alignment with user target folded in
  let yieldScore = clamp01(((grossYield ?? 0) - 3) / 5);
  if (targetYield && grossYield != null) {
    yieldScore = clamp01(yieldScore + (grossYield >= targetYield ? 0.1 : -0.1));
  }
  parts.yield = Math.round(yieldScore * 25);

  // Area growth (20): 0% → 0, 25%+ 5yr → 1
  parts.growth = Math.round(clamp01((areaGrowth5yr ?? 0) / 25) * 20);

  // Rental demand (15)
  const demandMap = { 'very high': 1, high: 0.85, moderate: 0.55, low: 0.25 };
  parts.demand = Math.round((demandMap[rentalDemand] ?? 0.5) * 15);

  // Condition (10): Good 1, Unknown 0.6, Fair 0.5, Poor 0.25
  const conditionMap = { Good: 1, Unknown: 0.6, Fair: 0.5, Poor: 0.25 };
  parts.condition = Math.round((conditionMap[condition] ?? 0.6) * 10);

  // Market discount (15): -15% vs comps → 1, +10% → 0
  const dev = comparableDeviationPct;
  parts.discount = dev == null
    ? Math.round(0.5 * 15)
    : Math.round(clamp01((10 - dev) / 25) * 15);

  // Cash flow (10): -£200/mo → 0, +£400/mo → 1
  parts.cashFlow = monthlyCashFlow == null
    ? 5
    : Math.round(clamp01((monthlyCashFlow + 200) / 600) * 10);

  // Risk (5): each flag deducts
  parts.risk = Math.max(0, 5 - riskFlags.length * 2);

  const total = Object.values(parts).reduce((s, v) => s + v, 0);

  return {
    score: Math.max(0, Math.min(100, total)),
    parts,
    weights: { yield: 25, growth: 20, demand: 15, condition: 10, discount: 15, cashFlow: 10, risk: 5 },
  };
}

export function scoreGrade(score) {
  if (score >= 80) return 'Strong';
  if (score >= 65) return 'Good';
  if (score >= 50) return 'Fair';
  return 'Weak';
}
