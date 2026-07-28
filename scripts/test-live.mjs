/* Live end-to-end: real listing fetch → full analysis pipeline */
import { fetchListingMetadataServer } from '../src/lib/fetchListing.js';
import { analyseProperty } from '../src/lib/propertyIntelligence.js';
import { parseListingUrl, propertyIdFromUrl } from '../src/lib/parseListingUrl.js';

const url = process.argv[2] || 'https://www.rightmove.co.uk/properties/167051633';
console.log('URL:', url);

const meta = await fetchListingMetadataServer(url);
console.log('META:', JSON.stringify({
  title: meta.title, price: meta.price, beds: meta.beds, baths: meta.baths,
  postcode: meta.postcode, propertyType: meta.propertyType, tenure: meta.tenure,
  monthlyRent: meta.monthlyRent, source: meta.source,
}, null, 1));

const parsed = parseListingUrl(url);
const report = await analyseProperty({ url, id: propertyIdFromUrl(url), meta, parsed });
console.log('\nREPORT');
console.log('name:', report.name);
console.log('score:', report.score, report.grade, report.scoreParts);
console.log('comps:', report.comparables.available, report.comparables.count, 'median', report.comparables.median, 'dev%', report.comparables.deviationPct);
console.log('condition:', report.condition.overall);
console.log('cash flow/mo:', report.deal.monthlyCashFlow, 'total cash:', report.deal.totalCashRequired);
console.log('opening:', report.aiInsight.opening);
console.log('valueLine:', report.aiInsight.valueLine);
