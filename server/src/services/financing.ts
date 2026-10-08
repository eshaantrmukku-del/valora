import type { Preferences } from '../../../shared/api';
import { DEFAULT_ASSUMPTIONS, type DealInputs, type ProvenanceMap } from '../../../shared/finance/deal';

/** The user's financing assumptions from preferences, falling back to labelled defaults. */
export function financingFromPreferences(p: Preferences): { inputs: Partial<DealInputs>; provenance: ProvenanceMap } {
  const inputs: Partial<DealInputs> = { ...DEFAULT_ASSUMPTIONS };
  const provenance: ProvenanceMap = {};
  for (const k of Object.keys(DEFAULT_ASSUMPTIONS) as (keyof DealInputs)[]) provenance[k] = 'default';
  const fromUser = <K extends keyof DealInputs>(k: K, v: DealInputs[K] | null | undefined) => {
    if (v != null) {
      inputs[k] = v;
      provenance[k] = 'user';
    }
  };
  fromUser('buyerType', p.buyerType);
  fromUser('cashPurchase', p.cashPurchase);
  fromUser('depositPct', p.depositPct);
  fromUser('interestRatePct', p.interestRatePct);
  fromUser('termYears', p.termYears);
  fromUser('interestOnly', p.interestOnly);
  return { inputs, provenance };
}
