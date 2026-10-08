/**
 * Property analysis: strategy-aware, evidence-grounded reports.
 *
 * Property facts are identical across analyses of the same property (snapshotted per analysis so old reports
 * never silently change); the brief determines weighting, emphasis and which financial views matter.
 * All figures come from the deterministic finance engine; the AI only writes the narrative.
 */
import { and, eq } from 'drizzle-orm';
import { emptyCriteria, OBJECTIVE_LABELS, type BriefCriteria } from '../../../shared/brief';
import {
  blankInputs,
  calculateDeal,
  DealInputsSchema,
  runScenarios,
  sensitivity,
  type DealInputs,
  type DealResult,
  type ProvenanceMap,
  type ScenarioResult,
  type SensitivityRow,
} from '../../../shared/finance/deal';
import { jurisdictionFromCountry } from '../../../shared/finance/tax';
import type { EvidenceBundle, FactOrigins, PropertyFacts } from '../../../shared/property';
import type { RankingResult } from '../../../shared/ranking';
import { aiAvailable, describeAiError } from '../ai/client';
import { checkGrounding, collectNumbers, generateNarrative, NARRATIVE_PROMPT_VERSION, type Narrative } from '../ai/narrative';
import { getDb, schema } from '../db/client';
import { indicativeRefurbRange, summariseComparables, type ComparableSummary } from '../domain/comparables';
import { rankProperty } from '../domain/ranking';
import { detectSignals, hasSignal } from '../domain/signals';
import { enqueue } from '../jobs/queue';
import { notFound } from '../lib/errors';
import { getPreferences } from '../routes/preferences';
import { latestEvidence, refreshPropertyEvidence } from './evidence';
import { financingFromPreferences } from './financing';
import { getAccessibleProperty } from './properties';

export interface DeterministicReport {
  financials: DealResult;
  scenarios: ScenarioResult[];
  sensitivity: SensitivityRow[];
  comparables: Omit<ComparableSummary, 'used'> & { sample: ComparableSummary['used'] };
  refurbishmentBasis: string | null;
  dueDiligence: string[];
  dataRisks: string[];
  missingInformation: string[];
}

export interface AnalysisReport {
  version: 1;
  deterministic: DeterministicReport;
  narrative: Narrative | null;
  groundingWarnings: string[];
  narrativeStale: boolean;
}

export function buildInputs(
  facts: PropertyFacts,
  evidence: EvidenceBundle,
  criteria: BriefCriteria,
  financing: { inputs: Partial<DealInputs>; provenance: ProvenanceMap },
  overrides: Partial<DealInputs> = {},
): { inputs: DealInputs; provenance: ProvenanceMap; refurbBasis: string | null } {
  const inputs: DealInputs = { ...blankInputs(), ...financing.inputs };
  const provenance: ProvenanceMap = { ...financing.provenance };
  const set = <K extends keyof DealInputs>(k: K, v: DealInputs[K] | null | undefined, p: ProvenanceMap[K]) => {
    if (v == null) return;
    inputs[k] = v;
    provenance[k] = p;
  };
  set('purchasePrice', facts.askingPrice, 'source');
  set('jurisdiction', jurisdictionFromCountry(facts.country), 'source');
  set('serviceChargeAnnual', facts.serviceChargeAnnual, 'source');
  set('groundRentAnnual', facts.groundRentAnnual, 'source');
  set('monthlyRent', evidence.rental?.monthlyAverage ?? null, 'source');

  const scope = criteria.renovation.appetite && criteria.renovation.appetite !== 'none' ? criteria.renovation.appetite : 'moderate';
  const refurb = indicativeRefurbRange(facts.floorAreaSqm, scope);
  let refurbBasis: string | null = null;
  if (refurb) {
    set('refurbCostLow', refurb.low, 'default');
    set('refurbCostHigh', refurb.high, 'default');
    refurbBasis = refurb.basis;
  } else if (criteria.renovation.maxBudget != null) {
    set('refurbCostLow', Math.round(criteria.renovation.maxBudget * 0.6), 'user');
    set('refurbCostHigh', criteria.renovation.maxBudget, 'user');
    refurbBasis = 'Range derived from the renovation budget in your brief (60–100%).';
  }
  const comps = summariseComparables(evidence.sold, { propertyType: facts.propertyType, outcode: facts.outcode });
  if (comps.median != null && comps.confidence !== 'none') set('resaleValue', Math.round(comps.median), 'default');

  for (const [k, v] of Object.entries(overrides) as [keyof DealInputs, unknown][]) {
    if (v === undefined) continue;
    (inputs as Record<string, unknown>)[k] = v;
    provenance[k] = 'user';
  }
  return { inputs: DealInputsSchema.parse(inputs), provenance, refurbBasis };
}

export function dueDiligenceChecklist(criteria: BriefCriteria, facts: PropertyFacts, evidence: EvidenceBundle): string[] {
  const s = detectSignals([facts.description, ...facts.keyFeatures]);
  const out = [
    'Instruct a conveyancer to check title, boundaries, rights of way and local authority searches.',
    hasSignal(s, 'needs_modernisation') || hasSignal(s, 'structural_concern')
      ? 'Commission a RICS Level 3 building survey — listing text suggests works or defects that photos cannot verify.'
      : 'Commission an independent RICS survey (Level 2 or 3 depending on age and condition).',
    'Confirm the asking price against recent comparable sales with a local agent; sold-price data here excludes size and condition.',
  ];
  if (facts.tenure === 'leasehold' || facts.propertyType === 'flat' || facts.propertyType === 'maisonette')
    out.push('Obtain the lease: remaining term, service charge history, ground rent terms and any restrictions on letting or alterations.');
  if (facts.tenure == null || facts.tenure === 'unknown') out.push('Confirm the tenure (freehold or leasehold) with the agent.');
  if (criteria.objective === 'long_term_rental' || criteria.objectiveWeights.cashFlow > 0) {
    out.push('Check achieved (not asking) rents with two local letting agents.');
    out.push('Check whether the council runs selective or additional landlord licensing for this street.');
    out.push('Confirm the EPC rating meets the minimum standard for letting, and the cost of upgrades if not.');
    out.push('Check your lender’s buy-to-let rental cover (stress-test) requirements against the expected rent.');
  }
  if (criteria.objective === 'renovation_value_add' || criteria.objective === 'renovation_resale' || criteria.development.extensionInterest) {
    out.push('Get at least two itemised builder quotes before relying on the refurbishment range.');
    out.push('Search the local planning portal for the property’s planning history and nearby decisions.');
  }
  if (criteria.development.extensionInterest || criteria.development.loftConversionInterest) {
    out.push('Ask an architect or planning consultant whether the extension could be permitted development or needs full planning permission; check for Article 4 directions.');
    out.push('Budget for Building Regulations approval and, if relevant, Party Wall agreements.');
  }
  if ((evidence.planningConstraints ?? []).some((p) => /conservation|listed/i.test(p.dataset)))
    out.push('The location has a conservation or listed-building designation: alterations may need additional consent.');
  if (hasSignal(s, 'cash_buyers_only')) out.push('“Cash buyers only” often signals a mortgageability issue — establish why before offering.');
  if (hasSignal(s, 'flood_risk')) out.push('Obtain a flood risk report and buildings insurance quote.');
  if (hasSignal(s, 'tenanted')) out.push('Obtain the tenancy agreement, deposit protection certificate and rent payment history.');
  if (hasSignal(s, 'auction')) out.push('Read the auction legal pack before bidding; completion timescales and fees are fixed.');
  if (criteria.objective === 'renovation_resale') out.push('Ask a local estate agent for a written view of the after-works value, citing renovated comparables.');
  return out;
}

export function buildDeterministicReport(
  criteria: BriefCriteria,
  facts: PropertyFacts,
  evidence: EvidenceBundle,
  inputs: DealInputs,
  refurbBasis: string | null,
  ranking: RankingResult,
): DeterministicReport {
  const comps = summariseComparables(evidence.sold, { propertyType: facts.propertyType, outcode: facts.outcode });
  const { used, ...compRest } = comps;
  const financials = calculateDeal(inputs);
  const missing = [...ranking.missing];
  for (const k of financials.missing.acquisition) missing.push(`Financial input missing: ${k}`);
  return {
    financials,
    scenarios: runScenarios(inputs),
    sensitivity: sensitivity(inputs),
    comparables: { ...compRest, sample: used.slice(0, 15) },
    refurbishmentBasis: refurbBasis,
    dueDiligence: dueDiligenceChecklist(criteria, facts, evidence),
    dataRisks: ranking.concerns,
    missingInformation: [...new Set(missing)],
  };
}

async function evidenceFor(propertyId: string, facts: PropertyFacts, origins: FactOrigins) {
  const cachedEvidence = await latestEvidence(propertyId);
  if (cachedEvidence) return { evidence: cachedEvidence, facts, origins };
  const enriched = await refreshPropertyEvidence(propertyId, facts, origins);
  return { evidence: enriched.evidence, facts: enriched.facts, origins: enriched.origins };
}

export async function createAnalysis(userId: string, propertyId: string, briefId: string | null, overrides: Partial<DealInputs> = {}) {
  const db = getDb();
  const property = await getAccessibleProperty(userId, propertyId);
  let criteria: BriefCriteria = emptyCriteria('general_screening');
  let briefName: string | null = null;
  if (briefId) {
    const [brief] = await db
      .select()
      .from(schema.investmentBriefs)
      .where(and(eq(schema.investmentBriefs.id, briefId), eq(schema.investmentBriefs.userId, userId)));
    if (!brief) throw notFound('Investment brief');
    criteria = brief.criteria;
    briefName = brief.name;
  }
  const { evidence, facts, origins } = await evidenceFor(property.id, property.facts, property.factOrigins);
  const prefs = await getPreferences(userId);
  const financing = financingFromPreferences(prefs);
  const { inputs, provenance, refurbBasis } = buildInputs(facts, evidence, criteria, financing, overrides);
  const ranking = rankProperty({ criteria, facts, evidence, financing: inputs });
  const report: AnalysisReport = {
    version: 1,
    deterministic: buildDeterministicReport(criteria, facts, evidence, inputs, refurbBasis, ranking),
    narrative: null,
    groundingWarnings: [],
    narrativeStale: false,
  };
  const ai = aiAvailable();
  const [row] = await db
    .insert(schema.analyses)
    .values({
      userId,
      propertyId: property.id,
      briefId,
      briefName: briefName ?? OBJECTIVE_LABELS.general_screening,
      criteriaSnapshot: criteria,
      factsSnapshot: facts,
      factOriginsSnapshot: origins,
      evidenceSnapshot: evidence,
      inputs,
      inputProvenance: provenance,
      ranking,
      report,
      narrativeStatus: ai ? 'pending' : 'not_configured',
      promptVersion: ai ? NARRATIVE_PROMPT_VERSION : null,
    })
    .returning();
  if (ai) await enqueue('analysis.narrative', { analysisId: row!.id }, { dedupeKey: `narrative:${row!.id}`, maxAttempts: 2 });
  return row!;
}

export async function getOwnedAnalysis(userId: string, id: string) {
  const [row] = await getDb()
    .select()
    .from(schema.analyses)
    .where(and(eq(schema.analyses.id, id), eq(schema.analyses.userId, userId)));
  if (!row) throw notFound('Analysis');
  return row;
}

/** Recalculate with edited assumptions. Facts and evidence stay as snapshotted. */
export async function recalculateAnalysis(userId: string, id: string, inputs: DealInputs, provenance: ProvenanceMap) {
  const row = await getOwnedAnalysis(userId, id);
  const ranking = rankProperty({ criteria: row.criteriaSnapshot, facts: row.factsSnapshot, evidence: row.evidenceSnapshot, financing: inputs });
  const prev = row.report as AnalysisReport;
  const report: AnalysisReport = {
    ...prev,
    deterministic: buildDeterministicReport(row.criteriaSnapshot, row.factsSnapshot, row.evidenceSnapshot, inputs, prev.deterministic.refurbishmentBasis, ranking),
    narrativeStale: prev.narrative != null,
  };
  const [updated] = await getDb()
    .update(schema.analyses)
    .set({ inputs, inputProvenance: { ...row.inputProvenance, ...provenance }, ranking, report, updatedAt: new Date() })
    .where(eq(schema.analyses.id, id))
    .returning();
  return updated!;
}

export async function requestNarrative(userId: string, id: string) {
  const row = await getOwnedAnalysis(userId, id);
  if (!aiAvailable()) return row;
  await getDb().update(schema.analyses).set({ narrativeStatus: 'pending', narrativeError: null }).where(eq(schema.analyses.id, id));
  await enqueue('analysis.narrative', { analysisId: row.id }, { dedupeKey: `narrative:${row.id}`, maxAttempts: 2 });
  return getOwnedAnalysis(userId, id);
}

export async function generateAnalysisNarrative(analysisId: string) {
  const db = getDb();
  const [row] = await db.select().from(schema.analyses).where(eq(schema.analyses.id, analysisId));
  if (!row) return;
  const report = row.report as AnalysisReport;
  const det = report.deterministic;
  const { description, keyFeatures, images: _images, ...factsForModel } = row.factsSnapshot;
  const input = {
    strategy: { brief: row.briefName, objective: row.criteriaSnapshot.objective, criteria: row.criteriaSnapshot },
    facts: { ...factsForModel, keyFeatures, origins: row.factOriginsSnapshot },
    listingText: description,
    evidence: {
      comparables: det.comparables,
      rental: row.evidenceSnapshot.rental,
      planningConstraints: row.evidenceSnapshot.planningConstraints,
      unavailable: row.evidenceSnapshot.unavailable,
    },
    ranking: row.ranking,
    financials: { inputs: row.inputs, provenance: row.inputProvenance, result: det.financials },
    scenarios: det.scenarios,
    refurbishment: { basis: det.refurbishmentBasis, low: row.inputs.refurbCostLow, high: row.inputs.refurbCostHigh },
    checklist: det.dueDiligence,
  };
  try {
    const { data, model } = await generateNarrative(input, row.userId);
    const warnings = checkGrounding(data, collectNumbers(input));
    await db
      .update(schema.analyses)
      .set({ report: { ...report, narrative: data, groundingWarnings: warnings, narrativeStale: false }, narrativeStatus: 'generated', narrativeError: null, model, updatedAt: new Date() })
      .where(eq(schema.analyses.id, analysisId));
  } catch (err) {
    await markNarrativeFailed(analysisId, describeAiError(err));
  }
}

export async function markNarrativeFailed(analysisId: string, message: string) {
  await getDb().update(schema.analyses).set({ narrativeStatus: 'failed', narrativeError: message.slice(0, 500) }).where(eq(schema.analyses.id, analysisId));
}
