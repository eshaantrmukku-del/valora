import type { PropertyType } from '../../../shared/brief';
import type { FactOrigins, PropertyFacts } from '../../../shared/property';

export interface GeoPoint {
  label: string;
  postcode: string | null;
  outcode: string | null;
  latitude: number;
  longitude: number;
  country: string | null;
  district: string | null;
  kind: 'postcode' | 'outcode' | 'place';
}

export interface ListingQuery {
  centre: GeoPoint;
  radiusMiles: number;
  minPrice: number | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  maxBedrooms: number | null;
  propertyTypes: PropertyType[];
  objective: string;
  limit: number;
}

export interface ProviderListing {
  provider: string;
  providerListingId: string;
  url: string | null;
  facts: Partial<PropertyFacts>;
  factOrigins: FactOrigins;
  raw: unknown;
}

export interface ProviderCapabilities {
  listingSearch: boolean;
  listingDetails: boolean;
  images: boolean;
  askingPrice: boolean;
  listingUrl: boolean;
  soldEvidence: boolean;
  rentalEvidence: boolean;
  planning: boolean;
  epc: boolean;
  geocoding: boolean;
}

export interface ProviderInfo {
  id: string;
  name: string;
  kind: 'listings' | 'sold' | 'rental' | 'planning' | 'epc' | 'geocoding' | 'test';
  configured: boolean;
  /** True only for providers that require no credentials (open data). */
  openData: boolean;
  capabilities: Partial<ProviderCapabilities>;
  coverage: string;
  limitations: string[];
  setup: string | null;
  docsUrl: string;
  envVars: string[];
}

export interface ListingProvider {
  info(): ProviderInfo;
  search(q: ListingQuery): Promise<ProviderListing[]>;
}

export class ProviderNotConfiguredError extends Error {}
