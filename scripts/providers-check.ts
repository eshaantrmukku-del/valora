/**
 * Live provider smoke test. Run with real credentials in .env:  npm run providers:check [postcode]
 * Makes a small number of real API calls (PropertyData calls consume credits) and prints what each returned.
 */
import { closeDb } from '../server/src/db/client';
import { config } from '../server/src/config';
import { geocode } from '../server/src/providers/postcodes';
import { fetchSoldEvidence } from '../server/src/providers/landRegistry';
import { fetchPlanningConstraints } from '../server/src/providers/planningData';
import { fetchEpcForPostcode } from '../server/src/providers/epc';
import { fetchRentalEvidence, propertyDataProvider } from '../server/src/providers/propertyData';

const postcode = process.argv[2] ?? 'M20 2AB';

async function check(name: string, fn: () => Promise<string>) {
  try {
    console.log(`✓ ${name}: ${await fn()}`);
  } catch (e) {
    console.log(`✗ ${name}: ${(e as Error).message}`);
  }
}

const geo = await geocode(postcode).catch(() => null);
await check('postcodes.io', async () =>
  geo ? `${geo.label} → ${geo.district}, ${geo.country}` : 'not found',
);
await check('HM Land Registry', async () => {
  if (!geo?.district) return 'skipped (no district)';
  const s = await fetchSoldEvidence({ district: geo.district, propertyType: null });
  return `${s?.comparables.length ?? 0} sales (${s?.scope})`;
});
await check('planning.data.gov.uk', async () => {
  if (!geo) return 'skipped';
  const c = await fetchPlanningConstraints(geo.latitude, geo.longitude);
  return `${c?.length ?? 0} designations`;
});
await check('EPC register', async () => {
  if (!config().EPC_API_KEY) return 'not configured';
  const r = await fetchEpcForPostcode(postcode);
  return `${r?.length ?? 0} certificates`;
});
await check('PropertyData rents', async () => {
  if (!config().PROPERTYDATA_API_KEY) return 'not configured';
  const r = await fetchRentalEvidence({ postcode, bedrooms: 3, propertyType: 'house_any' });
  return r ? `£${r.monthlyAverage}/month average (${r.scope})` : 'no data';
});
await check('PropertyData sourced listings', async () => {
  if (!config().PROPERTYDATA_API_KEY) return 'not configured';
  if (!geo) return 'skipped';
  const l = await propertyDataProvider.search({
    centre: geo,
    radiusMiles: 3,
    minPrice: null,
    maxPrice: null,
    minBedrooms: null,
    maxBedrooms: null,
    propertyTypes: [],
    objective: 'general_screening',
    limit: 10,
  });
  return `${l.length} listings; first: ${l[0] ? JSON.stringify(l[0].facts).slice(0, 200) : 'none'}`;
});
await closeDb();
