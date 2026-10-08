/**
 * Strategy-aware, explainable ranking engine.
 *
 *  1. Hard constraints are checked first. A property that definitely fails one is ineligible. A property
 *     whose data cannot confirm a constraint stays eligible but the check is reported as "unknown".
 *  2. Each scoring component returns a 0–100 score, `null` (data missing) or is not applicable to the brief.
 *  3. The match score is the weighted mean of applicable components, where unknown components count as
 *     UNKNOWN_COMPONENT_SCORE (below neutral) — missing data never improves a ranking.
 *  4. Confidence is the weighted share of applicable components that could actually be assessed.
 */
import {
  HOUSE_TYPES,
  PROPERTY_TYPE_LABELS,
  SCORE_COMPONENT_LABELS,
  type BriefCriteria,
  type ScoreComponent,
} from '../../../shared/brief';
import { calculateDeal, blankInputs, type DealInputs } from '../../../shared/finance/deal';
import type { EvidenceBundle, PropertyFacts } from '../../../shared/property';
import {
  UNKNOWN_COMPONENT_SCORE,
  type ComponentScore,
  type ConstraintCheck,
  type EvidenceBasis,
  type RankingResult,
} from '../../../shared/ranking';
import { indicativeRefurbRange, summariseComparables } from './comparables';
import { detectSignals, hasSignal } from './signals';
import { jurisdictionFromCountry } from '../../../shared/finance/tax';

const gbp = (n: number) => `£${Math.round(n).toLocaleString('en-GB')}`;
const clamp = (x: number, lo = 0, hi = 100) => Math.min(hi, Math.max(lo, x));
const lerp = (x: number, x0: number, x1: number) => clamp(((x - x0) / (x1 - x0)) * 100);

type Partial_ = Omit<ComponentScore, 'key' | 'label' | 'weight' | 'effectiveScore'> | 'not_applicable';

export interface RankingContext {
  criteria: BriefCriteria;
  facts: PropertyFacts;
  evidence: EvidenceBundle;
  /** User's financing/operating assumptions (from preferences or defaults), used for cash-flow estimates. */
  financing: Partial<DealInputs>;
}

function typeMatches(wanted: BriefCriteria['propertyTypes'], actual: PropertyFacts['propertyType']): boolean | null {
  if (!wanted.length) return true;
  if (!actual) return null;
  if (wanted.includes(actual)) return true;
  if (wanted.includes('house_any') && HOUSE_TYPES.includes(actual)) return true;
  if (actual === 'house_any' && wanted.some((w) => HOUSE_TYPES.includes(w))) return true;
  return false;
}

export function checkConstraints(c: BriefCriteria, f: PropertyFacts): ConstraintCheck[] {
  const checks: ConstraintCheck[] = [];
  const price = f.askingPrice;
  if (c.budget.maximum != null) {
    checks.push({
      kind: 'max_price',
      description: `Asking price ≤ ${gbp(c.budget.maximum)}`,
      status: price == null ? 'unknown' : price <= c.budget.maximum ? 'pass' : 'fail',
      detail: price == null ? 'Asking price not available' : `Asking ${gbp(price)}`,
    });
  }
  if (c.budget.minimum != null) {
    checks.push({
      kind: 'min_price',
      description: `Asking price ≥ ${gbp(c.budget.minimum)}`,
      status: price == null ? 'unknown' : price >= c.budget.minimum ? 'pass' : 'fail',
      detail: price == null ? 'Asking price not available' : `Asking ${gbp(price)}`,
    });
  }
  if (c.bedrooms.minimum != null) {
    checks.push({
      kind: 'min_bedrooms',
      description: `At least ${c.bedrooms.minimum} bedrooms`,
      status: f.bedrooms == null ? 'unknown' : f.bedrooms >= c.bedrooms.minimum ? 'pass' : 'fail',
      detail: f.bedrooms == null ? 'Bedroom count not available' : `${f.bedrooms} bedrooms`,
    });
  }
  if (c.bedrooms.maximum != null) {
    checks.push({
      kind: 'max_bedrooms',
      description: `At most ${c.bedrooms.maximum} bedrooms`,
      status: f.bedrooms == null ? 'unknown' : f.bedrooms <= c.bedrooms.maximum ? 'pass' : 'fail',
      detail: f.bedrooms == null ? 'Bedroom count not available' : `${f.bedrooms} bedrooms`,
    });
  }
  if (c.bathrooms.minimum != null) {
    checks.push({
      kind: 'min_bathrooms',
      description: `At least ${c.bathrooms.minimum} bathrooms`,
      status: f.bathrooms == null ? 'unknown' : f.bathrooms >= c.bathrooms.minimum ? 'pass' : 'fail',
      detail: f.bathrooms == null ? 'Bathroom count not available' : `${f.bathrooms} bathrooms`,
    });
  }
  if (c.propertyTypes.length) {
    const m = typeMatches(c.propertyTypes, f.propertyType);
    checks.push({
      kind: 'property_type',
      description: `Type: ${c.propertyTypes.map((t) => PROPERTY_TYPE_LABELS[t]).join(' / ')}`,
      status: m == null ? 'unknown' : m ? 'pass' : 'fail',
      detail: f.propertyType ? PROPERTY_TYPE_LABELS[f.propertyType] : 'Property type not available',
    });
  }
  const text = [f.description ?? '', ...f.keyFeatures].join(' ').toLowerCase();
  for (const feat of c.requiredFeatures) {
    const found = text.includes(feat.toLowerCase());
    checks.push({
      kind: 'required_feature',
      description: `Has: ${feat}`,
      status: found ? 'pass' : 'unknown',
      detail: found ? 'Mentioned in listing text' : 'Not mentioned in available listing text — needs checking',
    });
  }
  for (const feat of c.excludedFeatures) {
    const found = text.includes(feat.toLowerCase());
    checks.push({
      kind: 'excluded_feature',
      description: `Not: ${feat}`,
      status: found ? 'fail' : text ? 'pass' : 'unknown',
      detail: found ? 'Mentioned in listing text' : text ? 'Not mentioned in listing text' : 'No listing text available',
    });
  }
  return checks;
}

function fmtPct(x: number) {
  return `${x.toFixed(1)}%`;
}

export function rankProperty(ctx: RankingContext): RankingResult {
  const { criteria: c, facts: f, evidence } = ctx;
  const signals = detectSignals([f.description, ...f.keyFeatures]);
  const hasText = Boolean(f.description?.trim() || f.keyFeatures.length);
  const constraints = checkConstraints(c, f);
  const eligible = !constraints.some((x) => x.status === 'fail');

  const comps = summariseComparables(evidence.sold, { propertyType: f.propertyType, outcode: f.outcode });
  const highlights: string[] = [];
  const concerns: string[] = [];
  const missing: string[] = [];

  const wantsModernisation =
    c.objective === 'renovation_value_add' ||
    c.objective === 'renovation_resale' ||
    c.softPreferences.some((p) => p.kind === 'needs_modernisation');
  const wantsGoodCondition = c.softPreferences.some((p) => p.kind === 'good_condition');
  const wantsExtension =
    c.development.extensionInterest ||
    c.development.loftConversionInterest ||
    c.softPreferences.some((p) => p.kind === 'large_plot' || p.kind === 'extension_potential') ||
    c.investigationCriteria.some((i) => i.kind === 'extension_potential');

  // ---------- Financial estimates used by several components ----------
  const rent = evidence.rental?.monthlyAverage ?? null;
  const price = f.askingPrice;
  const scope = c.renovation.appetite && c.renovation.appetite !== 'none' ? c.renovation.appetite : 'moderate';
  const refurb = indicativeRefurbRange(f.floorAreaSqm, scope);
  const refurbLow = c.renovation.maxBudget != null && !refurb ? c.renovation.maxBudget * 0.6 : refurb?.low ?? null;
  const refurbHigh = c.renovation.maxBudget != null && !refurb ? c.renovation.maxBudget : refurb?.high ?? null;
  const jurisdiction = jurisdictionFromCountry(f.country);
  const baseInputs: DealInputs = {
    ...blankInputs(),
    ...ctx.financing,
    purchasePrice: price,
    jurisdiction: jurisdiction ?? ctx.financing.jurisdiction ?? null,
    monthlyRent: rent,
    serviceChargeAnnual: f.serviceChargeAnnual,
    groundRentAnnual: f.groundRentAnnual,
  };
  const rentalDeal = rent != null && price != null ? calculateDeal(baseInputs) : null;
  const resale = comps.confidence !== 'none' ? comps.median : null;
  const flipDeal =
    price != null && resale != null && refurbLow != null
      ? calculateDeal({ ...baseInputs, resaleValue: resale, refurbCostLow: refurbLow, refurbCostHigh: refurbHigh })
      : null;
  const discountPct = price != null && comps.median != null && comps.confidence !== 'none'
    ? ((comps.median - price) / comps.median) * 100
    : null;

  // ---------- Components ----------
  const parts: Record<ScoreComponent, () => Partial_> = {
    priceFit: () => {
      if (c.budget.maximum == null && c.budget.minimum == null) return 'not_applicable';
      if (price == null) return { score: null, explanation: 'Asking price not available.', evidence: [] };
      if (c.budget.maximum == null) return { score: 80, explanation: `Asking ${gbp(price)}; no maximum budget set.`, evidence: [] };
      const ratio = price / c.budget.maximum;
      const score = ratio > 1 ? 0 : ratio <= 0.85 ? 100 : 100 - ((ratio - 0.85) / 0.15) * 30;
      return {
        score: Math.round(score),
        explanation: `Asking ${gbp(price)} is ${Math.round(ratio * 100)}% of the ${gbp(c.budget.maximum)} budget${ratio <= 0.85 ? ', leaving headroom for costs and works' : ''}.`,
        evidence: [{ text: `Asking price ${gbp(price)}`, basis: 'provider_data' }],
      };
    },
    propertyFit: () => {
      if (c.bedrooms.minimum == null && !c.propertyTypes.length) return 'not_applicable';
      const bits: number[] = [];
      const ev: { text: string; basis: EvidenceBasis }[] = [];
      if (c.bedrooms.minimum != null) {
        if (f.bedrooms == null) return { score: null, explanation: 'Bedroom count not available.', evidence: [] };
        bits.push(f.bedrooms > c.bedrooms.minimum ? 100 : f.bedrooms === c.bedrooms.minimum ? 85 : 0);
        ev.push({ text: `${f.bedrooms} bedrooms`, basis: 'provider_data' });
      }
      if (c.propertyTypes.length) {
        const m = typeMatches(c.propertyTypes, f.propertyType);
        if (m == null) return { score: null, explanation: 'Property type not available.', evidence: ev };
        bits.push(m ? 100 : 0);
        ev.push({ text: PROPERTY_TYPE_LABELS[f.propertyType!], basis: 'provider_data' });
      }
      const score = Math.round(bits.reduce((a, b) => a + b, 0) / bits.length);
      return { score, explanation: score >= 85 ? 'Matches the requested size and type.' : 'Partial match on size or type.', evidence: ev };
    },
    conditionOpportunity: () => {
      if (!wantsModernisation && !wantsGoodCondition) return 'not_applicable';
      const needs = hasSignal(signals, 'needs_modernisation');
      const refurbished = hasSignal(signals, 'recently_refurbished');
      const tagged = f.providerTags.find((t) => /unmodernised|refurb|renovation|project/i.test(t));
      const ev: { text: string; basis: EvidenceBasis }[] = [];
      if (needs) ev.push({ text: `“${needs.snippet}”`, basis: 'listing_claim' });
      if (tagged) ev.push({ text: `Provider list: ${tagged}`, basis: 'provider_data' });
      if (refurbished) ev.push({ text: `“${refurbished.snippet}”`, basis: 'listing_claim' });
      if (!hasText && !tagged) return { score: null, explanation: 'No listing description available to judge condition.', evidence: [] };
      if (wantsGoodCondition && !wantsModernisation) {
        const score = refurbished ? 90 : needs || tagged ? 15 : 55;
        return { score, explanation: refurbished ? 'Listing describes the property as refurbished.' : needs ? 'Listing indicates works are needed.' : 'No clear condition statement in the listing.', evidence: ev };
      }
      let score = 30;
      let explanation = 'Listing text does not indicate a need for modernisation.';
      if (needs && tagged) { score = 95; explanation = 'Listing text and provider classification both indicate the property needs modernising.'; }
      else if (needs) { score = 88; explanation = 'Listing text indicates the property needs modernising (agent’s description, not verified).'; }
      else if (tagged) { score = 80; explanation = 'Classified as unmodernised by the data provider.'; }
      if (refurbished && !needs) { score = 10; explanation = 'Listing describes the property as already refurbished — limited improvement opportunity.'; }
      if (refurbished && needs) explanation += ' The text also mentions recent refurbishment of some areas — check which rooms need work.';
      return { score, explanation, evidence: ev };
    },
    extensionPotential: () => {
      if (!wantsExtension) return 'not_applicable';
      const ev: { text: string; basis: EvidenceBasis }[] = [];
      if (f.propertyType === 'flat' || f.propertyType === 'maisonette') {
        return { score: 5, explanation: 'Flats and maisonettes rarely offer extension potential for an individual owner.', evidence: [{ text: PROPERTY_TYPE_LABELS[f.propertyType], basis: 'provider_data' }] };
      }
      const plot = hasSignal(signals, 'large_plot');
      const ext = hasSignal(signals, 'extension_potential');
      const loft = hasSignal(signals, 'loft_potential');
      const granted = hasSignal(signals, 'planning_granted');
      for (const s of [plot, ext, loft, granted]) if (s) ev.push({ text: `“${s.snippet}”`, basis: 'listing_claim' });
      const restrictive = (evidence.planningConstraints ?? []).filter((p) => /conservation|listed|article-4|article 4|green belt|tree/i.test(`${p.dataset} ${p.name}`));
      for (const r of restrictive) ev.push({ text: `${r.dataset}: ${r.name}`, basis: 'official_dataset' });
      if (!hasText && !f.propertyType) return { score: null, explanation: 'No listing text or property type to assess plot or extension signals.', evidence: ev };
      let score = f.propertyType === 'detached' || f.propertyType === 'bungalow' ? 55 : f.propertyType === 'semi_detached' || f.propertyType === 'end_of_terrace' ? 45 : 30;
      if (plot) score += 20;
      if (ext || loft) score += 15;
      if (granted) score += 15;
      if (restrictive.length) score -= 25;
      score = clamp(score);
      const parts: string[] = [];
      parts.push(plot || ext || loft || granted ? 'Listing text mentions plot size or extension scope' : 'No plot or extension claims in the listing text');
      if (restrictive.length) parts.push('the site is within a planning designation that can restrict extensions');
      parts.push('planning approval is never assured and needs professional advice');
      return { score, explanation: `${parts.join('; ')}.`, evidence: ev };
    },
    valueUplift: () => {
      if (c.objective === 'long_term_rental' && !c.softPreferences.some((p) => p.kind === 'below_market')) {
        if (c.objectiveWeights.valueUplift === 0) return 'not_applicable';
      }
      if (price == null) return { score: null, explanation: 'Asking price not available.', evidence: [] };
      if (discountPct == null || comps.median == null) {
        return { score: null, explanation: 'Not enough comparable sold prices to judge value.', evidence: [] };
      }
      let score = lerp(discountPct, -20, 25);
      if (comps.confidence === 'low') score = 50 + (score - 50) * 0.5;
      const dir = discountPct >= 0 ? `${fmtPct(discountPct)} below` : `${fmtPct(-discountPct)} above`;
      return {
        score: Math.round(score),
        explanation: `Asking price is ${dir} the median of ${comps.count} comparable sales (${gbp(comps.median)}, ${comps.confidence} confidence). Sold records don’t include condition or size, so this is indicative only.`,
        evidence: [{ text: `HM Land Registry: ${comps.count} sales ${comps.oldest ?? ''}–${comps.newest ?? ''}, median ${gbp(comps.median)}`, basis: 'official_dataset' }],
      };
    },
    rentalYield: () => {
      if (c.objectiveWeights.rentalYield === 0 && c.financialTargets.minGrossYieldPct == null) return 'not_applicable';
      if (!rentalDeal?.rental) return { score: null, explanation: rent == null ? 'No rental evidence available for this area and size.' : 'Asking price not available.', evidence: [] };
      const y = rentalDeal.rental.grossYieldPct!;
      const target = c.financialTargets.minGrossYieldPct;
      const score = target != null ? (y >= target ? 70 + lerp(y, target, target + 3) * 0.3 : lerp(y, target - 3, target) * 0.6) : lerp(y, 3, 9);
      return {
        score: Math.round(score),
        explanation: `Estimated gross yield ${fmtPct(y)} using ${evidence.rental!.basis === 'asking_rents' ? 'local asking rents' : 'rental evidence'} of ${gbp(rent!)}/month${target != null ? ` (target ${fmtPct(target)})` : ''}.`,
        evidence: [
          { text: `${evidence.rental!.source}: average ${gbp(rent!)}/month (${evidence.rental!.scope})`, basis: 'provider_data' },
          { text: 'Gross yield = annual rent ÷ asking price', basis: 'calculation' },
        ],
      };
    },
    cashFlow: () => {
      if (c.objectiveWeights.cashFlow === 0 && c.financialTargets.minMonthlyCashFlow == null) return 'not_applicable';
      if (!rentalDeal?.rental) return { score: null, explanation: 'Cash flow needs rental evidence and an asking price.', evidence: [] };
      const cf = rentalDeal.rental.monthlyCashFlow;
      const target = c.financialTargets.minMonthlyCashFlow ?? 0;
      const score = cf >= target ? 65 + lerp(cf, target, target + 400) * 0.35 : lerp(cf, target - 400, target) * 0.6;
      return {
        score: Math.round(score),
        explanation: `Estimated ${cf >= 0 ? 'surplus' : 'shortfall'} of ${gbp(Math.abs(cf))}/month after mortgage and operating costs (target ${gbp(target)}). Based on your financing assumptions and labelled default costs.`,
        evidence: [{ text: `Monthly cash flow ${gbp(cf)} (deterministic calculation)`, basis: 'calculation' }],
      };
    },
    resaleMargin: () => {
      if (c.objectiveWeights.resaleMargin === 0 && c.financialTargets.minProfit == null) return 'not_applicable';
      if (!flipDeal?.flip) {
        const why = price == null ? 'asking price' : resale == null ? 'comparable sold prices' : 'a refurbishment budget (floor area or your renovation budget)';
        return { score: null, explanation: `Resale margin can’t be estimated without ${why}.`, evidence: [] };
      }
      const margin = flipDeal.flip.profitOnCostPct ?? 0;
      const score = lerp(margin, -10, 25);
      return {
        score: Math.round(score),
        explanation: `Indicative net margin ${fmtPct(margin)} (${gbp(flipDeal.flip.netProfit)}) if resold at the comparable median after ${gbp(flipDeal.flip.refurbishmentCost)} of works. Resale value and works cost are assumptions.`,
        evidence: [
          { text: `Resale value assumed at comparable median ${gbp(resale!)}`, basis: 'assumption' },
          { text: refurb ? refurb.basis : `Works budget from your brief (${gbp(refurbLow!)}–${gbp(refurbHigh!)})`, basis: 'assumption' },
        ],
      };
    },
    dataCompleteness: () => {
      const keys: [string, boolean][] = [
        ['asking price', price != null],
        ['bedrooms', f.bedrooms != null],
        ['property type', f.propertyType != null],
        ['postcode', f.postcode != null || f.outcode != null],
        ['description', hasText],
        ['floor area', f.floorAreaSqm != null],
        ['tenure', f.tenure != null && f.tenure !== 'unknown'],
        ['photos', f.images.length > 0],
      ];
      const known = keys.filter(([, k]) => k).length;
      const absent = keys.filter(([, k]) => !k).map(([n]) => n);
      return {
        score: Math.round((known / keys.length) * 100),
        explanation: absent.length ? `Missing: ${absent.join(', ')}.` : 'All key listing fields available.',
        evidence: [],
      };
    },
    riskAlignment: () => {
      const flags: { label: string; snippet?: string; basis: EvidenceBasis }[] = [];
      const add = (kind: Parameters<typeof hasSignal>[1], label: string) => {
        const s = hasSignal(signals, kind);
        if (s) flags.push({ label, snippet: s.snippet, basis: 'listing_claim' });
      };
      add('cash_buyers_only', 'Cash buyers only / possibly unmortgageable');
      add('non_standard_construction', 'Possible non-standard construction');
      add('structural_concern', 'Mentions a structural, damp or invasive-plant issue');
      add('flood_risk', 'Mentions flooding');
      add('short_lease', 'Short lease mentioned');
      add('auction', 'Auction sale (fixed timescales, reservation fees)');
      if (f.tenure === 'leasehold' && f.leaseYearsRemaining != null && f.leaseYearsRemaining < 85) {
        flags.push({ label: `Lease has ${f.leaseYearsRemaining} years remaining`, basis: 'provider_data' });
      }
      for (const p of evidence.planningConstraints ?? []) {
        if (/listed/i.test(p.dataset)) flags.push({ label: `Listed building record: ${p.name}`, basis: 'official_dataset' });
        if (/flood/i.test(p.dataset)) flags.push({ label: `Flood risk designation: ${p.name}`, basis: 'official_dataset' });
      }
      if (!hasText && !evidence.planningConstraints) return { score: null, explanation: 'No listing text or constraint data to assess risk factors.', evidence: [] };
      const penalty = c.risk.tolerance === 'low' ? 30 : c.risk.tolerance === 'high' ? 10 : 18;
      const score = clamp(100 - flags.length * penalty);
      return {
        score,
        explanation: flags.length ? `${flags.length} risk flag(s) relative to your ${c.risk.tolerance ?? 'medium'} risk tolerance.` : 'No risk flags found in the available data (absence of evidence is not evidence of absence).',
        evidence: flags.map((x) => ({ text: x.snippet ? `${x.label}: “${x.snippet}”` : x.label, basis: x.basis })),
      };
    },
  };

  const components: ComponentScore[] = [];
  for (const key of Object.keys(parts) as ScoreComponent[]) {
    const weight = c.objectiveWeights[key];
    if (weight <= 0) continue;
    const r = parts[key]();
    if (r === 'not_applicable') continue;
    components.push({
      key,
      label: SCORE_COMPONENT_LABELS[key],
      weight,
      score: r.score,
      effectiveScore: r.score ?? UNKNOWN_COMPONENT_SCORE,
      explanation: r.explanation,
      evidence: r.evidence,
    });
  }

  const totalWeight = components.reduce((s, x) => s + x.weight, 0);
  const knownWeight = components.filter((x) => x.score != null).reduce((s, x) => s + x.weight, 0);
  let matchScore = totalWeight ? components.reduce((s, x) => s + x.weight * x.effectiveScore, 0) / totalWeight : 0;
  // Unconfirmed hard constraints cap the score slightly so confirmed matches rank above unconfirmed ones.
  const unknownConstraints = constraints.filter((x) => x.status === 'unknown').length;
  matchScore -= Math.min(15, unknownConstraints * 5);
  if (!eligible) matchScore = 0;
  const confidence = totalWeight ? Math.round((knownWeight / totalWeight) * 100) : 0;

  for (const comp of components) {
    if (comp.score == null) missing.push(`${comp.label}: ${comp.explanation}`);
    else if (comp.score >= 75 && comp.weight >= 2) highlights.push(`${comp.label}: ${comp.explanation}`);
    else if (comp.score <= 30 && comp.weight >= 1) concerns.push(`${comp.label}: ${comp.explanation}`);
  }
  for (const x of constraints) {
    if (x.status === 'fail') concerns.unshift(`Fails requirement — ${x.description} (${x.detail}).`);
    if (x.status === 'unknown') missing.push(`Unconfirmed requirement — ${x.description}: ${x.detail}.`);
  }
  for (const u of evidence.unavailable) missing.push(`${u.source} unavailable: ${u.reason}`);

  const score = Math.round(clamp(matchScore));
  const confidenceLabel: RankingResult['confidenceLabel'] = confidence >= 75 ? 'high' : confidence >= 45 ? 'medium' : 'low';
  const top = [...components].filter((x) => x.score != null).sort((a, b) => b.weight * b.effectiveScore - a.weight * a.effectiveScore)[0];
  const summary = !eligible
    ? 'Excluded: fails one or more of your hard requirements.'
    : `Match ${score}/100 with ${confidenceLabel} confidence${top ? `; strongest factor: ${top.label.toLowerCase()}` : ''}${missing.length ? `; ${missing.length} item(s) need checking` : ''}.`;

  return {
    eligible,
    matchScore: score,
    confidence,
    confidenceLabel,
    constraints,
    components,
    highlights,
    concerns,
    missing,
    summary,
    metrics: {
      grossYieldPct: rentalDeal?.rental?.grossYieldPct ?? null,
      monthlyCashFlow: rentalDeal?.rental?.monthlyCashFlow ?? null,
      comparableMedian: comps.median,
      comparableCount: comps.count,
      discountToComparablesPct: discountPct == null ? null : Math.round(discountPct * 10) / 10,
      estimatedNetProfit: flipDeal?.flip?.netProfit ?? null,
    },
  };
}
