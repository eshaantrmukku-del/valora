const KEYS = {
  recent: 'valora_recent',
  portfolio: 'valora_portfolio',
  briefs: 'valora_briefs',
  profile: 'valora_profile',
  notifications: 'valora_notifications',
  areaReports: 'valora_area_reports',
  dealAlerts: 'valora_deal_alerts',
  briefMatches: 'valora_brief_matches',
  activeBrief: 'valora_active_brief',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
  window.dispatchEvent(new Event('valora-store-change'));
}

export function emitStoreChange() {
  window.dispatchEvent(new Event('valora-store-change'));
}

export function getRecent() {
  return read(KEYS.recent, []);
}

export function getPortfolioIds() {
  return read(KEYS.portfolio, []);
}

export function getPortfolio() {
  return getPortfolioIds();
}

export function isInPortfolio(propertyId) {
  return getPortfolioIds().some((p) => p.id === propertyId);
}

export function addToPortfolio(propertyId) {
  const list = getPortfolioIds().filter((p) => p.id !== propertyId);
  list.unshift({ id: propertyId, addedAt: Date.now() });
  write(KEYS.portfolio, list);
}

export function removeFromPortfolio(propertyId) {
  write(KEYS.portfolio, getPortfolioIds().filter((p) => p.id !== propertyId));
  try {
    const meta = JSON.parse(localStorage.getItem('valora_portfolio_meta') || '{}');
    if (meta[propertyId]) {
      delete meta[propertyId];
      localStorage.setItem('valora_portfolio_meta', JSON.stringify(meta));
    }
  } catch {
    /* ignore */
  }
}

export function getBriefs() {
  return read(KEYS.briefs, []);
}

/**
 * Save an Investment Brief for continuous monitoring.
 * @param {string} query
 * @param {{ filters?: object, notify?: boolean, name?: string }} [extra]
 */
export function saveBrief(query, extra = {}) {
  const briefs = getBriefs().filter((b) => b.query !== query);
  briefs.unshift({
    id: `brief-${Date.now()}`,
    name: extra.name || null,
    query,
    filters: extra.filters || null,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    lastCheckedAt: null,
    active: true,
    notify: extra.notify !== false,
    matchCount: 0,
    bestScore: null,
  });
  write(KEYS.briefs, briefs.slice(0, 20));
  return briefs[0];
}

export function updateBrief(id, patch) {
  const briefs = getBriefs().map((b) => (b.id === id ? { ...b, ...patch, updatedAt: Date.now() } : b));
  write(KEYS.briefs, briefs);
}

export function toggleBrief(id) {
  const briefs = getBriefs().map((b) => (b.id === id ? { ...b, active: !b.active, updatedAt: Date.now() } : b));
  write(KEYS.briefs, briefs);
}

export function deleteBrief(id) {
  write(KEYS.briefs, getBriefs().filter((b) => b.id !== id));
  const matches = read(KEYS.briefMatches, {});
  delete matches[id];
  write(KEYS.briefMatches, matches);
  if (getActiveBriefId() === id) setActiveBriefId(null);
}

export function getActiveBriefId() {
  return read(KEYS.activeBrief, null);
}

export function setActiveBriefId(id) {
  write(KEYS.activeBrief, id || null);
}

export function getActiveBrief() {
  const id = getActiveBriefId();
  if (!id) return null;
  return getBriefs().find((b) => b.id === id) || null;
}

export function getBriefMatches(briefId) {
  return read(KEYS.briefMatches, {})[briefId] || [];
}

export function setBriefMatches(briefId, matches) {
  const all = read(KEYS.briefMatches, {});
  all[briefId] = matches.slice(0, 40);
  write(KEYS.briefMatches, all);
}

export function getDealAlerts() {
  return read(KEYS.dealAlerts, []);
}

export function pushDealAlert(alert) {
  const list = getDealAlerts();
  list.unshift({
    id: `alert-${Date.now()}`,
    read: false,
    createdAt: Date.now(),
    ...alert,
  });
  write(KEYS.dealAlerts, list.slice(0, 50));
}

export function markAlertRead(id) {
  write(KEYS.dealAlerts, getDealAlerts().map((a) => (a.id === id ? { ...a, read: true } : a)));
}

export function clearDealAlerts() {
  write(KEYS.dealAlerts, []);
}

export function getProfile() {
  return read(KEYS.profile, { firstName: '', lastName: '', email: '' });
}

export function saveProfile(profile) {
  write(KEYS.profile, profile);
}

export function getNotificationPrefs() {
  return read(KEYS.notifications, {
    dealAlerts: true,
    weeklyDigest: true,
    portfolioPerformance: false,
  });
}

export function saveNotificationPrefs(prefs) {
  write(KEYS.notifications, prefs);
}

export function getAreaReport(postcode) {
  const key = postcode.trim().toUpperCase().replace(/\s+/g, ' ');
  return read(KEYS.areaReports, {})[key] || null;
}

export function saveAreaReport(postcode, report) {
  const key = postcode.trim().toUpperCase().replace(/\s+/g, ' ');
  const all = read(KEYS.areaReports, {});
  all[key] = { ...report, postcode: key, updatedAt: Date.now() };
  write(KEYS.areaReports, all);
}

export function deleteAreaReport(postcode) {
  const key = postcode.trim().toUpperCase().replace(/\s+/g, ' ');
  const all = read(KEYS.areaReports, {});
  delete all[key];
  write(KEYS.areaReports, all);
}

export function listAreaReports() {
  return Object.values(read(KEYS.areaReports, {}))
    .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getAllAnalysedPropertyIds() {
  const ids = new Set();
  getRecent().forEach((r) => ids.add(r.id));
  getPortfolioIds().forEach((p) => ids.add(p.id));
  return [...ids];
}
