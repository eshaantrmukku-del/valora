/**
 * Rule-based Investment Brief interpreter.
 *
 * Used when no AI provider is configured (and as a safety net if the AI call fails). It is deliberately
 * conservative: it extracts only what it can recognise with high confidence, records its assumptions,
 * and always asks the user to review the structured brief before searching.
 */
import {
  defaultWeights,
  emptyCriteria,
  normaliseCriteria,
  type BriefCriteria,
  type Objective,
  type PropertyType,
} from '../../../shared/brief';

const WORD_NUMBERS: Record<string, number> = {
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
};

const NOT_PLACES = new Set(
  (
    'a an the and or for to of in on at near around within with that which my our some any properties property homes home ' +
    'house houses flat flats apartment apartments bungalow bungalows terraced terrace semi detached bed beds bedroom bedrooms ' +
    'budget under below over above max maximum good large modernising modernisation need needs renovation renovating ' +
    'extension rental rent income yield cash flow profit resale value the uk england area areas town city'
  ).split(' '),
);

function money(raw: string, suffix: string | undefined): number {
  let v = parseFloat(raw.replace(/,/g, ''));
  const s = (suffix ?? '').toLowerCase();
  if (s === 'k') v *= 1_000;
  if (s === 'm' || s === 'million') v *= 1_000_000;
  return Math.round(v);
}

export function parseBudget(q: string): { minimum: number | null; maximum: number | null } {
  const amount = String.raw`£?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|million)?\b`;
  const between = new RegExp(String.raw`between\s+${amount}\s+(?:and|to|-)\s+${amount}`, 'i').exec(q);
  if (between) return { minimum: money(between[1]!, between[2]), maximum: money(between[3]!, between[4]) };
  const range = new RegExp(String.raw`£\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?\s*(?:-|–|to)\s*£?\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m)?`, 'i').exec(q);
  if (range) return { minimum: money(range[1]!, range[2]), maximum: money(range[3]!, range[4]) };
  const max = new RegExp(String.raw`(?:under|below|less than|up to|max(?:imum)?|no more than|budget(?: of)?|at most)\s+${amount}`, 'i').exec(q);
  const min = new RegExp(String.raw`(?:over|above|more than|at least|min(?:imum)?(?: of)?)\s+£\s*(\d[\d,]*(?:\.\d+)?)\s*(k|m|million)?`, 'i').exec(q);
  const result = { minimum: min ? money(min[1]!, min[2]) : null, maximum: max ? money(max[1]!, max[2]) : null };
  // Ignore implausible values (e.g. "under 5 miles").
  if (result.maximum != null && result.maximum < 10_000) result.maximum = null;
  if (result.minimum != null && result.minimum < 10_000) result.minimum = null;
  return result;
}

export function parseBedrooms(q: string): { minimum: number | null; maximum: number | null } {
  const num = String.raw`(\d+|one|two|three|four|five|six|seven|eight)`;
  const toN = (s: string) => WORD_NUMBERS[s.toLowerCase()] ?? parseInt(s, 10);
  const range = new RegExp(String.raw`${num}\s*(?:-|to)\s*${num}\s*-?\s*bed`, 'i').exec(q);
  if (range) return { minimum: toN(range[1]!), maximum: toN(range[2]!) };
  const plus = new RegExp(String.raw`(?:at least|minimum(?: of)?|min)\s+${num}\s*-?\s*bed|${num}\s*\+\s*-?\s*bed`, 'i').exec(q);
  if (plus) return { minimum: toN((plus[1] ?? plus[2])!), maximum: null };
  const exact = new RegExp(String.raw`\b${num}\s*-?\s*bed(?:room)?s?\b`, 'i').exec(q);
  if (exact) return { minimum: toN(exact[1]!), maximum: null };
  if (/\bstudio\b/i.test(q)) return { minimum: 0, maximum: 0 };
  return { minimum: null, maximum: null };
}

export function parsePropertyTypes(q: string): PropertyType[] {
  const t: PropertyType[] = [];
  if (/\bsemi[- ]?detached\b|\bsemis?\b/i.test(q)) t.push('semi_detached');
  if (/(?<!semi[- ]?)\bdetached\b/i.test(q)) t.push('detached');
  if (/\bend[- ]of[- ]terrace\b/i.test(q)) t.push('end_of_terrace');
  else if (/\bterrace[ds]?\b/i.test(q)) t.push('terraced');
  if (/\bbungalows?\b/i.test(q)) t.push('bungalow');
  if (/\bmaisonettes?\b/i.test(q)) t.push('maisonette');
  if (/\b(?:flats?|apartments?|studios?)\b/i.test(q)) t.push('flat');
  if (!t.length && /\bhouses?\b/i.test(q)) t.push('house_any');
  return t;
}

export function parseObjective(q: string): Objective {
  const s = q.toLowerCase();
  const resale = /\b(resell|resold|resale|re-sell|flip|sell (?:it )?on|sold at a profit|profit on (?:sale|resale)|renovat\w* and (?:re)?sell)\b/.test(s);
  const rental = /\b(rental|rent(?:ed|ing)? out|buy[- ]to[- ]let|btl|tenant|yield|cash ?flow|let(?:ting)?s?\b|passive income|monthly income)\b/.test(s);
  const reno = /\b(moderni[sz]|renovat|refurb|doer[- ]upper|needs? work|add(?:ing)? value|increase (?:its|the) value|extension|extend|value[- ]add|improve)\w*/.test(s);
  if (resale) return 'renovation_resale';
  if (rental && !reno) return 'long_term_rental';
  if (reno) return 'renovation_value_add';
  if (rental) return 'long_term_rental';
  return 'general_screening';
}

function titleCase(s: string) {
  return s
    .split(/\s+/)
    .map((w) => (/^(upon|on|the|le|in|under)$/i.test(w) ? w.toLowerCase() : w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()))
    .join(' ');
}

export function parseLocation(q: string): { areas: string[]; postcodes: string[]; radiusMiles: number | null } {
  const postcodes = new Set<string>();
  for (const m of q.matchAll(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})?\b/gi)) {
    const out = m[1]!.toUpperCase();
    // Avoid matching things like "3 bed": outcodes must start with letters.
    if (!/^[A-Z]{1,2}\d/.test(out)) continue;
    postcodes.add(m[2] ? `${out} ${m[2].toUpperCase()}` : out);
  }
  const areas: string[] = [];
  const re = /\b(?:in|near|around|within|across|based in)\s+((?:[A-Z][a-zA-Z'-]+)(?:\s+(?:[A-Z][a-zA-Z'-]+|upon|on|in|under|le|the))*?)(?=\s+(?:(?:under|below|over|for|with|that|which|and|or|up|at|needing|needs)\b|£|\d)|[,.;!?]|$)/g;
  for (const m of q.matchAll(re)) {
    const words = m[1]!.split(/\s+/).filter((w) => !NOT_PLACES.has(w.toLowerCase()));
    const name = words.join(' ').trim();
    if (name.length >= 3 && !/^[A-Z]{1,2}\d/.test(name)) areas.push(titleCase(name));
  }
  // "in manchester" written in lower case
  if (!areas.length) {
    const lc = /\b(?:in|near|around)\s+([a-z][a-z'-]+(?:\s+[a-z][a-z'-]+)?)(?=\s+(?:(?:under|below|over|for|with|that|which|and)\b|£|\d)|[,.;!?]|$)/i.exec(q);
    if (lc) {
      const words = lc[1]!.split(/\s+/).filter((w) => !NOT_PLACES.has(w.toLowerCase()));
      if (words.length && words.join(' ').length >= 3) areas.push(titleCase(words.join(' ')));
    }
  }
  const radius = /\bwithin\s+(\d+(?:\.\d+)?)\s*(?:miles?|mi)\b/i.exec(q);
  return { areas: [...new Set(areas)], postcodes: [...postcodes], radiusMiles: radius ? parseFloat(radius[1]!) : null };
}

export interface RuleInterpretation {
  name: string;
  criteria: BriefCriteria;
}

export function interpretWithRules(request: string): RuleInterpretation {
  const q = request.trim();
  const objective = parseObjective(q);
  const c = emptyCriteria(objective);
  c.location = parseLocation(q);
  c.budget = parseBudget(q);
  c.bedrooms = parseBedrooms(q);
  c.propertyTypes = parsePropertyTypes(q);
  const s = q.toLowerCase();

  if (/moderni[sz]|needs? (?:work|updating|refurb)|doer[- ]upper|renovation project|dated/.test(s))
    c.softPreferences.push({ kind: 'needs_modernisation', description: 'Needs modernising', importance: 3 });
  if (/(?:good|large|big|generous|decent)[- ]sized? (?:plot|garden)|large (?:plot|garden)|big (?:plot|garden)|good plot/.test(s))
    c.softPreferences.push({ kind: 'large_plot', description: 'Good-sized plot', importance: 2 });
  if (/\bparking|driveway|garage\b/.test(s)) c.softPreferences.push({ kind: 'parking', description: 'Parking', importance: 1 });
  if (/\bno chain\b|chain[- ]free/.test(s)) c.softPreferences.push({ kind: 'no_chain', description: 'No onward chain', importance: 1 });
  if (/below market|undervalued|bmv|bargain/.test(s)) c.softPreferences.push({ kind: 'below_market', description: 'Priced below comparable sales', importance: 2 });
  if (/\bextension|extend\b|extending/.test(s)) {
    c.development.extensionInterest = true;
    c.investigationCriteria.push({ kind: 'extension_potential', description: 'Potential for an extension (requires planning investigation)' });
  }
  if (/\bloft\b/.test(s)) {
    c.development.loftConversionInterest = true;
    c.investigationCriteria.push({ kind: 'extension_potential', description: 'Loft conversion potential (requires investigation)' });
  }
  if (objective === 'renovation_value_add' || objective === 'renovation_resale')
    c.investigationCriteria.push({ kind: 'value_uplift', description: 'Potential to increase value through renovation' });
  if (objective === 'renovation_resale')
    c.investigationCriteria.push({ kind: 'resale_evidence', description: 'Comparable resale evidence for renovated homes' });
  if (objective === 'long_term_rental') {
    c.investigationCriteria.push({ kind: 'tenant_demand', description: 'Reliable tenant demand' });
    c.investigationCriteria.push({ kind: 'rental_evidence', description: 'Local rental evidence' });
  }
  if (/positive (?:monthly )?cash ?flow|cash ?flow positive/.test(s)) c.financialTargets.minMonthlyCashFlow = 0;
  const yieldM = /(\d+(?:\.\d+)?)\s*%\s*(?:gross\s*)?yield|yield (?:of |above |over )?(\d+(?:\.\d+)?)\s*%/.exec(s);
  if (yieldM) c.financialTargets.minGrossYieldPct = parseFloat((yieldM[1] ?? yieldM[2])!);
  if (/low risk|safe|cautious|conservative/.test(s)) c.risk.tolerance = 'low';
  if (/high risk|aggressive/.test(s)) c.risk.tolerance = 'high';
  if (/\bcosmetic\b/.test(s)) c.renovation.appetite = 'cosmetic';
  if (/full renovation|complete renovation|extensive|gut/.test(s)) c.renovation.appetite = 'extensive';

  c.objectiveWeights = defaultWeights(objective);
  c.assumptions.push('Interpreted with Valora’s rule-based parser (AI interpretation is not configured). Please review every field.');
  if (objective === 'general_screening') c.assumptions.push('No clear investment strategy found; using general screening weights.');
  if (!c.location.areas.length && !c.location.postcodes.length) {
    c.clarificationQuestions.push('Which town, city or postcode should Valora search?');
    c.missingInformation.push('Location');
  }
  if (c.budget.maximum == null) c.missingInformation.push('Maximum budget');
  if (objective === 'long_term_rental' && c.financialTargets.minGrossYieldPct == null && c.financialTargets.minMonthlyCashFlow == null)
    c.missingInformation.push('Target yield or monthly cash flow');

  const criteria = normaliseCriteria(c);
  return { name: suggestBriefName(criteria), criteria };
}

export function suggestBriefName(c: BriefCriteria): string {
  const where = c.location.areas[0] ?? c.location.postcodes[0] ?? 'UK';
  const what: Record<Objective, string> = {
    renovation_value_add: 'renovation opportunities',
    long_term_rental: 'rental investments',
    renovation_resale: 'renovate-and-resell projects',
    general_screening: 'property screen',
  };
  const beds = c.bedrooms.minimum ? `${c.bedrooms.minimum}+ bed ` : '';
  return `${where} ${beds}${what[c.objective]}`.replace(/\s+/g, ' ').replace(/^./, (x) => x.toUpperCase());
}
