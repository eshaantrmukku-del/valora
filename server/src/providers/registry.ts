import { config } from '../config';
import { epcInfo } from './epc';
import { fixtureInfo, fixtureProvider, fixturesEnabled } from './fixtures';
import { landRegistryInfo } from './landRegistry';
import { planningDataInfo } from './planningData';
import { postcodesInfo } from './postcodes';
import { propertyDataInfo, propertyDataProvider } from './propertyData';
import type { ListingProvider, ProviderInfo } from './types';

/** All listing providers Valora knows about, configured or not. */
export function allListingProviders(): ListingProvider[] {
  const list: ListingProvider[] = [propertyDataProvider];
  if (fixturesEnabled()) list.push(fixtureProvider);
  return list;
}

export function configuredListingProviders(): ListingProvider[] {
  return allListingProviders().filter((p) => p.info().configured);
}

export function allProviderInfo(): ProviderInfo[] {
  const infos = [propertyDataInfo(), landRegistryInfo(), postcodesInfo(), planningDataInfo(), epcInfo()];
  if (fixturesEnabled()) infos.push(fixtureInfo());
  return infos;
}

export function aiInfo() {
  const c = config();
  const fake = c.ENABLE_FAKE_AI && !c.isProduction;
  return {
    configured: Boolean(c.ANTHROPIC_API_KEY) || fake,
    provider: fake ? 'Test stub (not a real model)' : 'Anthropic Claude',
    model: fake ? 'fake' : c.ANTHROPIC_MODEL,
    setup: c.ANTHROPIC_API_KEY || fake ? null : 'Set ANTHROPIC_API_KEY (from console.anthropic.com) to enable AI interpretation, narratives and the assistant.',
  };
}
