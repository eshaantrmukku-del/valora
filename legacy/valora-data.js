/* Valora — demo property & area data */
window.VALORA_DATA = {
  areas: {
    'sheffield-s6': { name: 'Sheffield City North', subtitle: 'S6, S7, S10 · 3 postcode districts · 42,800 residents', score: 78 },
    'manchester-m1': { name: 'Manchester City Centre', subtitle: 'M1–M4 · 4 postcode districts · 68,200 residents', score: 82 },
    'birmingham-b12': { name: 'Birmingham East', subtitle: 'B8, B12 · 2 postcode districts · 31,400 residents', score: 71 },
    'leeds-ls6': { name: 'Leeds Headingley', subtitle: 'LS6 · Student & HMO corridor · 24,100 residents', score: 68 },
    'nottingham-ng5': { name: 'Nottingham North', subtitle: 'NG5 · Family terraces · 19,800 residents', score: 58 }
  },

  properties: {
    'sheffield-plot': {
      id: 'sheffield-plot',
      name: 'Derelict Corner Plot, Walkley Road',
      address: 'Sheffield, South Yorkshire · S6 2LT',
      location: 'Sheffield · S6',
      strategy: 'Demo & Rebuild',
      strategyKey: 'demo',
      emoji: '🏗️',
      price: 155000,
      marketValue: 210000,
      score: 91,
      grade: 'Exceptional',
      tags: ['Demolish & Rebuild', 'Chain Free', 'Freehold', 'Regen Zone'],
      facts: [
        { label: 'Asking Price', value: '£155,000' },
        { label: 'Plot Size', value: '0.12 acres' },
        { label: 'Est. GDV', value: '£420k' },
        { label: 'Profit on Cost', value: '24%' }
      ],
      metrics: { land: '£155k', build: '£185k', total: '£340k', return: '24%', returnLabel: 'Profit on Cost' },
      undervalued: { title: 'Gross Development Value: £420,000', desc: '4-bed new-build detached in S6 — based on 14 comparable new-build sales within 0.5 miles.', badge: '£80k profit' },
      rental: { conservative: 1350, expected: 1550, optimistic: 1750, grossYield: '4.4%', netYield: '3.8%' },
      risks: [
        { type: 'ok', text: 'Corner plot — good access' },
        { type: 'ok', text: 'Chain free' },
        { type: 'ok', text: 'Planning precedent nearby' },
        { type: 'warn', text: 'Planning not yet secured' },
        { type: 'risk', text: 'No services confirmed on plot' }
      ],
      isDevelopment: true
    },
    'victoria-lofts': {
      id: 'victoria-lofts',
      name: 'The Victoria Lofts',
      address: 'Manchester, Greater Manchester · M1 3AB',
      location: 'Manchester · M1',
      strategy: 'Buy-to-Let',
      strategyKey: 'btl',
      emoji: '🏢',
      price: 425000,
      marketValue: 518000,
      score: 88,
      grade: 'Excellent',
      tags: ['Undervalued', 'Off-Market', 'Chain Free', 'High Yield'],
      facts: [
        { label: 'Asking Price', value: '£425,000' },
        { label: 'Bedrooms', value: '2 bed' },
        { label: 'Est. MV', value: '£518k' },
        { label: 'Gross Yield', value: '9.2%' }
      ],
      metrics: { land: '£425k', build: '£12k', total: '£437k', return: '9.2%', returnLabel: 'Gross Yield' },
      undervalued: { title: 'Estimated Market Value: £518,000', desc: 'Trading 18% below comparable sales in M1. Strong rental demand with 100% occupancy in comparable block.', badge: '−18% BMV' },
      rental: { conservative: 2900, expected: 3260, optimistic: 3500, grossYield: '9.2%', netYield: '7.8%' },
      risks: [
        { type: 'ok', text: 'Strong rental demand' },
        { type: 'ok', text: 'Below market value' },
        { type: 'ok', text: 'City centre location' },
        { type: 'warn', text: 'Service charge review due' },
        { type: 'info', text: 'Leasehold — check years remaining' }
      ],
      isDevelopment: false
    },
    'garratt-lane': {
      id: 'garratt-lane',
      name: 'Garratt Lane Multi-Unit',
      address: 'London · SW18 4EQ',
      location: 'London · SW18',
      strategy: 'Buy-to-Let',
      strategyKey: 'btl',
      emoji: '🏘️',
      price: 895000,
      marketValue: 1020000,
      score: 72,
      grade: 'Good',
      tags: ['Multi-Unit', 'Undervalued', 'Freehold'],
      facts: [
        { label: 'Asking Price', value: '£895,000' },
        { label: 'Units', value: '4 flats' },
        { label: 'Est. MV', value: '£1.02M' },
        { label: 'Gross Yield', value: '6.4%' }
      ],
      metrics: { land: '£895k', build: '£45k', total: '£940k', return: '6.4%', returnLabel: 'Gross Yield' },
      undervalued: { title: 'Estimated Market Value: £1,020,000', desc: 'Multi-unit block trading 12% below SW18 average. Established area with strong tenant demand.', badge: '−12% BMV' },
      rental: { conservative: 4200, expected: 4780, optimistic: 5200, grossYield: '6.4%', netYield: '5.2%' },
      risks: [
        { type: 'ok', text: 'Established rental area' },
        { type: 'ok', text: 'Freehold title' },
        { type: 'warn', text: 'Some units need light refurb' },
        { type: 'warn', text: 'EPC upgrades may be required' }
      ],
      isDevelopment: false
    },
    'quayside': {
      id: 'quayside',
      name: 'Quayside Portfolio (3 Units)',
      address: 'Birmingham, West Midlands · B1 2AA',
      location: 'Birmingham · B1',
      strategy: 'Buy-to-Let',
      strategyKey: 'btl',
      emoji: '🏗️',
      price: 610000,
      marketValue: 782000,
      score: 95,
      grade: 'Exceptional',
      tags: ['Motivated Seller', 'Undervalued', 'Portfolio'],
      facts: [
        { label: 'Asking Price', value: '£610,000' },
        { label: 'Units', value: '3 units' },
        { label: 'Est. MV', value: '£782k' },
        { label: 'Gross Yield', value: '11.1%' }
      ],
      metrics: { land: '£610k', build: '£28k', total: '£638k', return: '11.1%', returnLabel: 'Gross Yield' },
      undervalued: { title: 'Estimated Market Value: £782,000', desc: 'Motivated seller — priced 22% below independent valuation. Massive equity uplift opportunity.', badge: '−22% BMV' },
      rental: { conservative: 4800, expected: 5640, optimistic: 6100, grossYield: '11.1%', netYield: '9.4%' },
      risks: [
        { type: 'ok', text: 'Motivated seller signals' },
        { type: 'ok', text: 'Exceptional yield' },
        { type: 'ok', text: 'Strong Birmingham demand' },
        { type: 'warn', text: 'Due diligence on tenant mix' }
      ],
      isDevelopment: false
    },
    'leeds-hmo': {
      id: 'leeds-hmo',
      name: '6-Bed Terrace — HMO Licensed',
      address: 'Leeds, West Yorkshire · LS6 3CD',
      location: 'Leeds · LS6',
      strategy: 'HMO',
      strategyKey: 'hmo',
      emoji: '🏢',
      price: 268000,
      marketValue: 310000,
      score: 83,
      grade: 'Excellent',
      tags: ['HMO Licensed', 'Probate Sale', 'High Yield'],
      facts: [
        { label: 'Asking Price', value: '£268,000' },
        { label: 'Rooms', value: '6 beds' },
        { label: 'Est. MV', value: '£310k' },
        { label: 'Gross Yield', value: '10.8%' }
      ],
      metrics: { land: '£268k', build: '£15k', total: '£283k', return: '10.8%', returnLabel: 'Gross Yield' },
      undervalued: { title: 'Estimated Market Value: £310,000', desc: 'Probate sale with transferable HMO licence. Article 4 area protects existing use.', badge: '−14% BMV' },
      rental: { conservative: 2200, expected: 2410, optimistic: 2650, grossYield: '10.8%', netYield: '8.9%' },
      risks: [
        { type: 'ok', text: 'Licence transfers on purchase' },
        { type: 'ok', text: 'Strong student demand' },
        { type: 'warn', text: 'Article 4 — no new HMOs' },
        { type: 'info', text: 'Probate — allow extra completion time' }
      ],
      isDevelopment: false
    },
    'nottingham-brrr': {
      id: 'nottingham-brrr',
      name: 'Victorian Terrace — Refurb Ready',
      address: 'Nottingham, Nottinghamshire · NG5 4EF',
      location: 'Nottingham · NG5',
      strategy: 'BRRR',
      strategyKey: 'brrr',
      emoji: '🔧',
      price: 142000,
      marketValue: 180000,
      score: 76,
      grade: 'Good',
      tags: ['Motivated Seller', 'Refurb Ready', 'BRRR'],
      facts: [
        { label: 'Asking Price', value: '£142,000' },
        { label: 'Bedrooms', value: '3 bed' },
        { label: 'Refurb Est.', value: '£28k' },
        { label: 'Post-Refurb Yield', value: '8.9%' }
      ],
      metrics: { land: '£142k', build: '£28k', total: '£170k', return: '8.9%', returnLabel: 'Post-Refurb Yield' },
      undervalued: { title: 'Post-Refurb Value: £195,000', desc: 'Victorian terrace with cosmetic refurb needed. 75% LTV refinance likely after works complete.', badge: '£25k equity' },
      rental: { conservative: 850, expected: 950, optimistic: 1050, grossYield: '8.9%', netYield: '7.2%' },
      risks: [
        { type: 'ok', text: 'Strong BRRR fundamentals' },
        { type: 'ok', text: 'Motivated seller' },
        { type: 'warn', text: 'Refurb cost risk ±15%' },
        { type: 'warn', text: 'Check damp & roof condition' }
      ],
      isDevelopment: false
    }
  }
};

VALORA_DATA.generateFromUrl = function (url) {
  var hash = 0;
  for (var i = 0; i < url.length; i++) hash = ((hash << 5) - hash) + url.charCodeAt(i);
  hash = Math.abs(hash);

  var price = 120000 + (hash % 280000);
  var bmv = 8 + (hash % 18);
  var mv = Math.round(price * (1 + bmv / 100));
  var yieldPct = (5 + (hash % 6)) + (hash % 10) / 10;
  var score = 58 + (hash % 38);
  var grade = score >= 90 ? 'Exceptional' : score >= 80 ? 'Excellent' : score >= 70 ? 'Good' : score >= 60 ? 'Average' : 'High Risk';

  var cities = ['Manchester', 'Birmingham', 'Leeds', 'Sheffield', 'Liverpool', 'Bristol'];
  var city = cities[hash % cities.length];
  var beds = 2 + (hash % 4);

  return {
    id: 'custom-' + hash,
    name: beds + '-Bed ' + (hash % 2 ? 'Semi-Detached' : 'Terrace') + ', ' + city,
    address: city + ' · Analysis from listing URL',
    location: city,
    strategy: 'Buy-to-Let',
    strategyKey: 'btl',
    emoji: '🏠',
    price: price,
    marketValue: mv,
    score: score,
    grade: grade,
    tags: ['AI Extracted', 'Chain Free', bmv > 12 ? 'Undervalued' : 'Fair Value'],
    facts: [
      { label: 'Asking Price', value: '£' + price.toLocaleString() },
      { label: 'Bedrooms', value: beds + ' bed' },
      { label: 'Est. MV', value: '£' + (mv / 1000).toFixed(0) + 'k' },
      { label: 'Gross Yield', value: yieldPct.toFixed(1) + '%' }
    ],
    metrics: {
      land: '£' + (price / 1000).toFixed(0) + 'k',
      build: '£' + (8000 + (hash % 20000)).toLocaleString(),
      total: '£' + Math.round((price + 12000) / 1000) + 'k',
      return: yieldPct.toFixed(1) + '%',
      returnLabel: 'Gross Yield'
    },
    undervalued: {
      title: 'Estimated Market Value: £' + mv.toLocaleString(),
      desc: 'Valora compared listing price against ' + (10 + hash % 20) + ' comparable sales and local market trends.',
      badge: '−' + bmv + '% BMV'
    },
    rental: {
      conservative: Math.round(price * yieldPct / 100 / 12 * 0.85),
      expected: Math.round(price * yieldPct / 100 / 12),
      optimistic: Math.round(price * yieldPct / 100 / 12 * 1.12),
      grossYield: yieldPct.toFixed(1) + '%',
      netYield: (yieldPct - 1.2).toFixed(1) + '%'
    },
    risks: [
      { type: 'ok', text: 'Data extracted from listing' },
      { type: 'ok', text: 'Rental demand assessed' },
      { type: 'warn', text: 'Verify listing details independently' },
      { type: 'info', text: 'Source: ' + (url.length > 50 ? url.slice(0, 50) + '…' : url) }
    ],
    isDevelopment: false,
    sourceUrl: url
  };
};

VALORA_DATA.getProperty = function (id) {
  if (id && this.properties[id]) return this.properties[id];
  try {
    var stored = JSON.parse(localStorage.getItem('valora_custom_' + id) || 'null');
    if (stored) return stored;
  } catch (e) {}
  return null;
};

VALORA_DATA.saveCustom = function (property) {
  localStorage.setItem('valora_custom_' + property.id, JSON.stringify(property));
  var recent = JSON.parse(localStorage.getItem('valora_recent') || '[]');
  recent = recent.filter(function (r) { return r.id !== property.id; });
  recent.unshift({ id: property.id, name: property.name, score: property.score, time: Date.now() });
  localStorage.setItem('valora_recent', JSON.stringify(recent.slice(0, 10)));
};
