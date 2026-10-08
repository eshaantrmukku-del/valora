/** Ranking result shapes shared by the server and the UI. */
import type { ScoreComponent } from './brief';

export type ConstraintStatus = 'pass' | 'fail' | 'unknown';

export interface ConstraintCheck {
  kind: string;
  description: string;
  status: ConstraintStatus;
  detail: string;
}

export interface ComponentScore {
  key: ScoreComponent;
  label: string;
  weight: number;
  /** 0–100, or null when the data needed is missing. */
  score: number | null;
  /** Score actually used in the weighted total (unknowns are scored below neutral). */
  effectiveScore: number;
  explanation: string;
  evidence: { text: string; basis: EvidenceBasis }[];
}

export type EvidenceBasis = 'listing_claim' | 'official_dataset' | 'provider_data' | 'calculation' | 'assumption' | 'user_input';

export const EVIDENCE_BASIS_LABELS: Record<EvidenceBasis, string> = {
  listing_claim: 'Listing claim',
  official_dataset: 'Official dataset',
  provider_data: 'Provider data',
  calculation: 'Calculation',
  assumption: 'Assumption',
  user_input: 'Your input',
};

export interface RankingResult {
  eligible: boolean;
  /** 0–100: how well the property matches the brief's strategy. Not a probability of success. */
  matchScore: number;
  /** 0–100: share of the weighted criteria that could be assessed with data. */
  confidence: number;
  confidenceLabel: 'high' | 'medium' | 'low';
  constraints: ConstraintCheck[];
  components: ComponentScore[];
  highlights: string[];
  concerns: string[];
  missing: string[];
  summary: string;
  metrics: {
    grossYieldPct: number | null;
    monthlyCashFlow: number | null;
    comparableMedian: number | null;
    comparableCount: number;
    discountToComparablesPct: number | null;
    estimatedNetProfit: number | null;
  };
}

/** Unknown criteria are scored at this value so that missing data never improves a ranking. */
export const UNKNOWN_COMPONENT_SCORE = 40;
