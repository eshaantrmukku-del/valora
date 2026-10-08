/**
 * Smoke-test Discover: search + analyse first 4 cards.
 * Usage: node scripts/test-discover.mjs
 */
import { parseIntent, summarizeIntent } from '../src/lib/discover/parseIntent.js';
import { searchListingsServer } from '../src/lib/discover/searchListings.js';
import { analyseProperty } from '../src/lib/propertyIntelligence.js';
import { rankOpportunity, whyMatches, investmentRating, confidenceOf } from '../src/lib/discover/runDiscover.js';
import { intentToSearchParams } from '../src/lib/discover/parseIntent.js';

const query = process.argv[2] || 'Buy-to-let flats in Manchester under £300k with at least 8% gross yield';
const intent = parseIntent(query);
console.log('INTENT', summarizeIntent(intent));

const params = intentToSearchParams(intent);
const search = await searchListingsServer(params);
console.log('SEARCH ok=', search.ok, 'count=', search.resultCount, 'cards=', search.cards?.length, 'loc=', search.location?.displayName);
if (!search.ok) {
  console.error(search.error);
  process.exit(1);
}

const slice = search.cards.slice(0, 4);
const opportunities = [];
for (const card of slice) {
  try {
    const property = await analyseProperty({
      url: card.url,
      id: card.id,
      meta: {
        fetched: true,
        source: 'rightmove-search',
        title: card.title,
        description: card.summary || '',
        price: card.price,
        beds: card.beds,
        baths: card.baths,
        propertyType: card.propertyType,
        address: card.address,
        postcode: card.postcode,
        tenure: card.tenure,
        listingType: 'sale',
        image: card.image,
        agent: card.agent,
        priceLabel: card.priceLabel,
      },
      parsed: { valid: true, portal: 'Rightmove', listingId: card.listingId, city: null, postcode: card.postcode },
    });
    const y = property.deal?.grossYield;
    // Soft yield filter when rent is modelled (same as runDiscover)
    if (intent.minGrossYield != null && property.rentEstimate?.confidence === 'high' && y < intent.minGrossYield) {
      console.log('SKIP (yield)', property.name, y);
      continue;
    }
    opportunities.push({
      property,
      rankScore: rankOpportunity(property, intent),
      reasons: whyMatches(property, intent),
      rating: investmentRating(property.score),
      confidence: confidenceOf(property),
    });
    console.log('OK', property.score, property.name.slice(0, 40), `£${property.price}`, `${y}%`, `cf=${property.deal?.monthlyCashFlow}`);
  } catch (err) {
    console.log('FAIL', card.id, err.message);
  }
}

opportunities.sort((a, b) => b.rankScore - a.rankScore);
console.log('\nTOP');
for (const o of opportunities.slice(0, 5)) {
  console.log(o.property.score, o.rating, o.property.deal?.grossYield + '%', o.property.address, o.reasons.join(' · '));
}
