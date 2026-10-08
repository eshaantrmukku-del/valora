/**
 * Deterministic text-signal detection over listing descriptions and key features.
 *
 * Signals are *claims made in listing text* (usually by the selling agent), not verified facts.
 * Each match returns the quoted snippet so the UI can show exactly what was matched.
 */

export type SignalKind =
  | 'needs_modernisation'
  | 'recently_refurbished'
  | 'large_plot'
  | 'extension_potential'
  | 'loft_potential'
  | 'planning_granted'
  | 'cash_buyers_only'
  | 'auction'
  | 'non_standard_construction'
  | 'structural_concern'
  | 'flood_risk'
  | 'short_lease'
  | 'tenanted'
  | 'no_chain'
  | 'parking'
  | 'garden';

export interface SignalMatch {
  kind: SignalKind;
  phrase: string;
  snippet: string;
}

const PATTERNS: Record<SignalKind, RegExp[]> = {
  needs_modernisation: [
    /\bin need of (?:full |some |complete )?(?:modernisation|modernization|updating|refurbishment|renovation)\b/i,
    /\b(?:requires|require|requiring|needs|needing) (?:full |some |complete |general )?(?:modernisation|modernization|updating|refurbishment|renovation|improvement)\b/i,
    /\b(?:scope|potential|opportunity) (?:to|for) (?:modernise|modernize|update|improve|refurbish|renovate)\b/i,
    /\b(?:renovation|refurbishment|modernisation) project\b/i,
    /\bdoer[- ]upper\b/i,
    /\b(?:dated|tired) (?:throughout|interior|decor|kitchen|bathroom)\b/i,
    /\b(?:offered|sold) in need of\b/i,
  ],
  recently_refurbished: [
    /\b(?:newly|recently|fully|completely|tastefully|extensively) (?:refurbished|renovated|modernised|modernized|updated)\b/i,
    /\bwalk[- ]in condition\b/i,
    /\bturn[- ]key\b/i,
  ],
  large_plot: [
    /\b(?:large|generous|substantial|sizeable|sizable|wide|extensive|good[- ]sized|corner|double) (?:plot|garden|rear garden|gardens|grounds)\b/i,
    /\bplot of (?:approximately|approx\.?|around|circa)?\s*[\d.]+\s*(?:acres?|sq\.? ?ft|square feet|m2|sqm)\b/i,
    /\b[\d.]+\s*acres?\b/i,
  ],
  extension_potential: [
    /\b(?:potential|scope|room|possibility) (?:to|for) (?:extend|an extension|extension)\b/i,
    /\bextend(?:ed|ing)? (?:to the )?(?:rear|side)\b.*\b(?:stpp|subject to planning)\b/i,
    /\b(?:stpp|subject to (?:the necessary )?planning(?: permission)?)\b/i,
  ],
  loft_potential: [/\bloft (?:conversion|potential)\b/i, /\bpotential to convert the loft\b/i],
  planning_granted: [/\bplanning (?:permission )?(?:granted|approved|consent)\b/i, /\bwith planning\b/i],
  cash_buyers_only: [/\bcash buyers? only\b/i, /\bnon[- ]mortgageable\b/i, /\bunmortgageable\b/i],
  auction: [/\bauction\b/i, /\bmodern method of auction\b/i],
  non_standard_construction: [/\bnon[- ]standard construction\b/i, /\b(?:prefab|pre-fabricated|concrete construction|timber[- ]framed?)\b/i],
  structural_concern: [
    /\bsubsidence\b/i,
    /\bunderpinn(?:ed|ing)\b/i,
    /\bstructural (?:issues?|problems?|movement|repairs?)\b/i,
    /\bjapanese knotweed\b/i,
    /\bdamp\b/i,
  ],
  flood_risk: [/\bflood(?:ing| risk| plain| zone)\b/i],
  short_lease: [/\bshort lease\b/i, /\b(?:[1-7]\d) years? (?:remaining|left) on the lease\b/i],
  tenanted: [/\b(?:currently )?tenanted\b/i, /\bsitting tenant\b/i, /\btenant in situ\b/i],
  no_chain: [/\bno (?:onward )?chain\b/i, /\bchain[- ]free\b/i],
  parking: [/\b(?:driveway|off[- ]road parking|garage|allocated parking)\b/i],
  garden: [/\b(?:rear|front|private|south[- ]facing|enclosed) garden\b/i, /\bgardens?\b/i],
};

function snippetAround(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 50);
  const end = Math.min(text.length, index + length + 50);
  return `${start > 0 ? '…' : ''}${text.slice(start, end).replace(/\s+/g, ' ').trim()}${end < text.length ? '…' : ''}`;
}

export function detectSignals(texts: (string | null | undefined)[]): SignalMatch[] {
  const corpus = texts.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).join('\n');
  if (!corpus) return [];
  const out: SignalMatch[] = [];
  for (const [kind, patterns] of Object.entries(PATTERNS) as [SignalKind, RegExp[]][]) {
    for (const re of patterns) {
      const m = re.exec(corpus);
      if (m) {
        out.push({ kind, phrase: m[0], snippet: snippetAround(corpus, m.index, m[0].length) });
        break;
      }
    }
  }
  // "Recently refurbished" and "needs modernisation" can both match in long texts (e.g. "kitchen recently
  // updated, bathroom requires modernisation"). Keep both: the ranking engine reports the conflict.
  return out;
}

export function hasSignal(signals: SignalMatch[], kind: SignalKind): SignalMatch | undefined {
  return signals.find((s) => s.kind === kind);
}
