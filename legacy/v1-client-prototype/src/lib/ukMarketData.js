/** Regional market baselines — illustrative UK averages for client-side modelling */
export const CITIES = {
  Manchester: { region: 'north', avgPrice: 215000, avgYield: 6.2, growth5yr: 22, demand: 'high', schools: 'Good', crime: 'Moderate', transport: 'Excellent' },
  Liverpool: { region: 'north', avgPrice: 165000, avgYield: 7.1, growth5yr: 18, demand: 'high', schools: 'Average', crime: 'Moderate', transport: 'Good' },
  Sheffield: { region: 'north', avgPrice: 185000, avgYield: 6.0, growth5yr: 20, demand: 'moderate', schools: 'Good', crime: 'Low', transport: 'Good' },
  Leeds: { region: 'north', avgPrice: 195000, avgYield: 5.8, growth5yr: 21, demand: 'high', schools: 'Good', crime: 'Moderate', transport: 'Excellent' },
  Birmingham: { region: 'midlands', avgPrice: 205000, avgYield: 5.5, growth5yr: 19, demand: 'high', schools: 'Average', crime: 'Moderate', transport: 'Excellent' },
  Nottingham: { region: 'midlands', avgPrice: 175000, avgYield: 6.4, growth5yr: 17, demand: 'moderate', schools: 'Good', crime: 'Moderate', transport: 'Good' },
  Leicester: { region: 'midlands', avgPrice: 180000, avgYield: 6.0, growth5yr: 16, demand: 'moderate', schools: 'Average', crime: 'Moderate', transport: 'Good' },
  Bristol: { region: 'south', avgPrice: 310000, avgYield: 4.8, growth5yr: 24, demand: 'high', schools: 'Excellent', crime: 'Low', transport: 'Good' },
  Newcastle: { region: 'north', avgPrice: 175000, avgYield: 6.5, growth5yr: 15, demand: 'moderate', schools: 'Good', crime: 'Low', transport: 'Good' },
  London: { region: 'south', avgPrice: 520000, avgYield: 3.9, growth5yr: 12, demand: 'very high', schools: 'Excellent', crime: 'Moderate', transport: 'Excellent' },
  Cardiff: { region: 'wales', avgPrice: 220000, avgYield: 5.6, growth5yr: 18, demand: 'moderate', schools: 'Good', crime: 'Low', transport: 'Good' },
  Edinburgh: { region: 'scotland', avgPrice: 285000, avgYield: 4.9, growth5yr: 20, demand: 'high', schools: 'Excellent', crime: 'Low', transport: 'Excellent' },
  Glasgow: { region: 'scotland', avgPrice: 165000, avgYield: 6.8, growth5yr: 14, demand: 'moderate', schools: 'Good', crime: 'Moderate', transport: 'Excellent' },
  Reading: { region: 'south', avgPrice: 340000, avgYield: 4.4, growth5yr: 16, demand: 'high', schools: 'Good', crime: 'Low', transport: 'Excellent' },
  Oxford: { region: 'south', avgPrice: 420000, avgYield: 4.0, growth5yr: 15, demand: 'high', schools: 'Excellent', crime: 'Low', transport: 'Good' },
  Cambridge: { region: 'south', avgPrice: 430000, avgYield: 3.9, growth5yr: 17, demand: 'high', schools: 'Excellent', crime: 'Low', transport: 'Good' },
  Southampton: { region: 'south', avgPrice: 255000, avgYield: 5.2, growth5yr: 16, demand: 'moderate', schools: 'Good', crime: 'Moderate', transport: 'Good' },
  Plymouth: { region: 'south', avgPrice: 210000, avgYield: 5.5, growth5yr: 14, demand: 'moderate', schools: 'Average', crime: 'Low', transport: 'Moderate' },
  // Chilterns / Bucks / Berks — high-value stock; never fall back to NATIONAL for HP/SL
  Amersham: { region: 'south', avgPrice: 620000, avgYield: 3.6, growth5yr: 14, demand: 'high', schools: 'Excellent', crime: 'Low', transport: 'Excellent' },
  'Little Chalfont': { region: 'south', avgPrice: 580000, avgYield: 3.5, growth5yr: 13, demand: 'high', schools: 'Excellent', crime: 'Low', transport: 'Excellent' },
  Chesham: { region: 'south', avgPrice: 480000, avgYield: 3.8, growth5yr: 13, demand: 'moderate', schools: 'Good', crime: 'Low', transport: 'Good' },
  'High Wycombe': { region: 'south', avgPrice: 420000, avgYield: 4.1, growth5yr: 14, demand: 'high', schools: 'Good', crime: 'Low', transport: 'Good' },
  Beaconsfield: { region: 'south', avgPrice: 780000, avgYield: 3.2, growth5yr: 12, demand: 'high', schools: 'Excellent', crime: 'Low', transport: 'Excellent' },
  Aylesbury: { region: 'south', avgPrice: 360000, avgYield: 4.4, growth5yr: 15, demand: 'moderate', schools: 'Good', crime: 'Low', transport: 'Good' },
  Slough: { region: 'south', avgPrice: 380000, avgYield: 4.3, growth5yr: 14, demand: 'high', schools: 'Average', crime: 'Moderate', transport: 'Excellent' },
  Maidenhead: { region: 'south', avgPrice: 520000, avgYield: 3.7, growth5yr: 13, demand: 'high', schools: 'Good', crime: 'Low', transport: 'Excellent' },
  Watford: { region: 'south', avgPrice: 450000, avgYield: 3.9, growth5yr: 14, demand: 'high', schools: 'Good', crime: 'Moderate', transport: 'Excellent' },
  'St Albans': { region: 'south', avgPrice: 580000, avgYield: 3.5, growth5yr: 13, demand: 'high', schools: 'Excellent', crime: 'Low', transport: 'Excellent' },
  'Milton Keynes': { region: 'midlands', avgPrice: 340000, avgYield: 4.6, growth5yr: 16, demand: 'high', schools: 'Good', crime: 'Moderate', transport: 'Good' },
  Luton: { region: 'south', avgPrice: 310000, avgYield: 4.8, growth5yr: 15, demand: 'moderate', schools: 'Average', crime: 'Moderate', transport: 'Good' },
};

/** Postcode district → city (major UK outcodes) */
export const OUTCODE_CITY = {
  M: 'Manchester', L: 'Liverpool', S: 'Sheffield', B: 'Birmingham', LS: 'Leeds',
  NE: 'Newcastle', BS: 'Bristol', NG: 'Nottingham', LE: 'Leicester', CF: 'Cardiff',
  EH: 'Edinburgh', G: 'Glasgow', E: 'London', N: 'London', NW: 'London', SE: 'London',
  SW: 'London', W: 'London', EC: 'London', WC: 'London', BR: 'London', CR: 'London',
  HA: 'London', IG: 'London', KT: 'London', RM: 'London', SM: 'London', TW: 'London',
  UB: 'London', EN: 'London', DA: 'London',
  BD: 'Leeds', HX: 'Leeds', HD: 'Leeds', WF: 'Leeds',
  SK: 'Manchester', WA: 'Manchester', OL: 'Manchester', BL: 'Manchester',
  CH: 'Liverpool', PR: 'Liverpool', WN: 'Liverpool',
  CV: 'Birmingham', DY: 'Birmingham', WS: 'Birmingham',
  ST: 'Birmingham', DE: 'Nottingham',
  DN: 'Sheffield', HU: 'Sheffield',
  GL: 'Bristol', BA: 'Bristol',
  TN: 'London', ME: 'London', CT: 'London',
  RG: 'Reading', OX: 'Oxford', CB: 'Cambridge', SO: 'Southampton', PL: 'Plymouth',
  HP: 'Amersham', SL: 'Slough', WD: 'Watford', AL: 'St Albans', MK: 'Milton Keynes',
  LU: 'Luton',
};

export const NATIONAL = { avgPrice: 285000, avgYield: 5.4, growth5yr: 18 };

export function normalizeOutcode(input) {
  const key = input.trim().toUpperCase().replace(/\s+/g, ' ');
  const outcode = key.split(' ')[0] || key;
  if (OUTCODE_CITY[outcode]) return outcode;
  const two = outcode.match(/^([A-Z]{2})/)?.[1];
  if (two && OUTCODE_CITY[two]) return two;
  const one = outcode.match(/^([A-Z])/)?.[1];
  if (one && OUTCODE_CITY[one]) return one;
  return outcode;
}

export function cityFromPostcode(postcode) {
  if (!postcode) return null;
  const outcode = normalizeOutcode(postcode);
  return OUTCODE_CITY[outcode] || null;
}

export function getCityData(cityName) {
  if (!cityName) return null;
  const key = Object.keys(CITIES).find((c) => c.toLowerCase() === cityName.toLowerCase());
  return key ? { name: key, ...CITIES[key] } : null;
}

export function resolveLocation({ postcode, city, title = '', description = '' }) {
  const text = `${title} ${description}`.toLowerCase();
  let resolvedCity = city || cityFromPostcode(postcode);

  if (!resolvedCity) {
    // Prefer longer place names (Little Chalfont before generic matches)
    resolvedCity = Object.keys(CITIES)
      .sort((a, b) => b.length - a.length)
      .find((c) => text.includes(c.toLowerCase())) || null;
  }

  const data = getCityData(resolvedCity) || {
    name: resolvedCity || 'UK',
    ...NATIONAL,
    region: 'uk',
    demand: 'moderate',
    schools: 'Average',
    crime: 'Moderate',
    transport: 'Good',
  };

  return {
    city: resolvedCity || data.name,
    outcode: postcode ? normalizeOutcode(postcode) : null,
    market: data,
  };
}
