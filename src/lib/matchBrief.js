/**
 * Brief matching helpers — used when a newly analysed property is
 * checked against saved briefs. Discover live search uses
 * parseIntent + runDiscover instead; this stays for Analyse toast matching.
 */
import { parseIntent, REGIONS, summarizeIntent } from './discover/parseIntent';

export function parseBrief(query) {
  const intent = parseIntent(query);
  return {
    minYield: intent.minGrossYield,
    maxBudget: intent.maxPrice,
    minBudget: intent.minPrice,
    minBeds: intent.minBedrooms,
    minScore: intent.minScore,
    cities: intent.cities,
    regions: intent.regions,
    propertyTypes: intent.propertyTypes,
    strategies: intent.strategy ? [intent.strategy] : [],
    raw: query,
  };
}

export function summarizeCriteria(criteria) {
  if (!criteria?.raw && !criteria?.cities) return [];
  if (criteria.raw) return summarizeIntent(parseIntent(criteria.raw));
  const chips = [];
  if (criteria.cities?.length) chips.push(criteria.cities.map((c) => c.charAt(0).toUpperCase() + c.slice(1)).join(', '));
  if (criteria.regions?.length) chips.push(criteria.regions.map((r) => r.charAt(0).toUpperCase() + r.slice(1)).join(', '));
  if (criteria.minYield != null) chips.push(`${criteria.minYield}%+ yield`);
  if (criteria.maxBudget != null) chips.push(`Under £${criteria.maxBudget.toLocaleString()}`);
  if (criteria.minBeds != null) chips.push(`${criteria.minBeds}+ beds`);
  if (criteria.propertyTypes?.length) chips.push(criteria.propertyTypes.join(', '));
  if (criteria.strategies?.length) chips.push(criteria.strategies.map((s) => s.toUpperCase()).join(', '));
  return chips;
}

function propertyBeds(property) {
  if (property?.beds != null) return property.beds;
  const fromFacts = property.facts?.find((f) => /bed/i.test(f.label))?.value;
  if (fromFacts && /studio/i.test(fromFacts)) return 0;
  const m = fromFacts?.match(/(\d+)/) || property.name?.match(/(\d+)\s*bed/i);
  return m ? parseInt(m[1], 10) : null;
}

function propertyYield(property) {
  return property.deal?.grossYield
    ?? parseFloat(property.rental?.grossYield || property.metrics?.return || '0');
}

function cityInRegion(city, region) {
  const list = REGIONS[region] || [];
  return list.includes(city?.toLowerCase());
}

export function propertyMatchesBrief(property, criteria) {
  if (!property) return false;

  if (criteria.cities?.length > 0) {
    const loc = `${property.location} ${property.address} ${property.name}`.toLowerCase();
    if (!criteria.cities.some((c) => loc.includes(c))) return false;
  }

  if (criteria.regions?.length > 0) {
    if (!criteria.regions.some((r) => cityInRegion(property.location, r))) return false;
  }

  if (criteria.minYield != null && propertyYield(property) < criteria.minYield) return false;

  if (criteria.maxBudget != null && property.price > criteria.maxBudget) return false;
  if (criteria.minBudget != null && property.price < criteria.minBudget) return false;

  if (criteria.minBeds != null) {
    const beds = propertyBeds(property);
    if (beds != null && beds < criteria.minBeds) return false;
  }

  if (criteria.minScore != null && (property.score || 0) < criteria.minScore) return false;

  if (criteria.propertyTypes?.length > 0) {
    const pt = (property.propertyType || '').toLowerCase();
    const name = `${property.name} ${property.tags?.join(' ')}`.toLowerCase();
    if (!criteria.propertyTypes.some((t) => pt.includes(t) || name.includes(t))) return false;
  }

  if (criteria.strategies?.length > 0) {
    const sk = (property.strategyKey || property.strategy || '').toLowerCase();
    if (!criteria.strategies.some((s) => sk.includes(s))) return false;
  }

  return true;
}

export function explainMatch(property, criteria) {
  const reasons = [];

  if (criteria.cities?.length) {
    const match = criteria.cities.find((c) => `${property.location}`.toLowerCase().includes(c));
    if (match) reasons.push(`In ${match.charAt(0).toUpperCase() + match.slice(1)}`);
  }

  const y = propertyYield(property);
  if (criteria.minYield != null && y >= criteria.minYield) {
    reasons.push(`${y}% yield (target ${criteria.minYield}%+)`);
  } else if (criteria.minYield == null && y) {
    reasons.push(`${y}% gross yield`);
  }

  if (criteria.maxBudget != null && property.price <= criteria.maxBudget) {
    reasons.push(`£${property.price.toLocaleString()} within budget`);
  }

  if (criteria.minBeds != null) {
    const beds = propertyBeds(property);
    if (beds >= criteria.minBeds) reasons.push(`${beds} bedrooms`);
  }

  if (criteria.minScore != null && property.score >= criteria.minScore) {
    reasons.push(`Score ${property.score}`);
  }

  if (criteria.strategies?.length) {
    reasons.push(property.strategy || 'Strategy match');
  }

  if (property.hasLiveData) reasons.push('Live listing data');

  return reasons.slice(0, 4);
}

export function rankMatch(property, criteria) {
  let relevance = property.score || 0;
  const y = propertyYield(property);

  if (criteria.minYield && y >= criteria.minYield) relevance += (y - criteria.minYield) * 3;
  if (criteria.maxBudget && property.price <= criteria.maxBudget) {
    relevance += Math.min(15, ((criteria.maxBudget - property.price) / criteria.maxBudget) * 20);
  }
  if (criteria.cities?.length && property.location) {
    if (criteria.cities.some((c) => property.location.toLowerCase().includes(c))) relevance += 12;
  }
  if (property.hasLiveData) relevance += 5;

  return relevance;
}

export function matchSavedBriefs(property) {
  try {
    const briefs = JSON.parse(localStorage.getItem('valora_briefs') || '[]');
    return briefs
      .filter((b) => b.active !== false)
      .map((b) => ({ brief: b, criteria: parseBrief(b.query) }))
      .filter(({ criteria }) => propertyMatchesBrief(property, criteria))
      .map(({ brief }) => brief);
  } catch {
    return [];
  }
}
