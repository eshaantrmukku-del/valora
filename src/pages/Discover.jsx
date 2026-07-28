import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import AppPage, { AppEmpty, AppStat } from '../components/AppPage';
import { IlluDiscover } from '../components/AppIllustrations';
import { saveCustom } from '../data/properties';
import { runDiscover } from '../lib/discover/runDiscover';
import { runBriefMonitor } from '../lib/discover/monitor';
import {
  nameInvestmentBrief,
  briefCriteria,
} from '../lib/discover/investmentBrief';
import { parseIntent } from '../lib/discover/parseIntent';
import {
  getBriefs,
  saveBrief,
  deleteBrief,
  toggleBrief,
  updateBrief,
  getDealAlerts,
  markAlertRead,
  setActiveBriefId,
  getActiveBriefId,
} from '../lib/storage';
import { useStore } from '../hooks/useStore';
import { useApp } from '../context/AppContext';

const EXAMPLE_BRIEFS = [
  {
    label: 'Manchester renovation',
    text: '3 bed houses in Manchester under £350k that need modernising',
  },
  {
    label: 'Chilterns value-add',
    text: '3 bed houses in Little Chalfont under £600k needing modernising',
  },
  {
    label: 'Long-term rentals',
    text: 'Buy-to-let flats in Manchester under £250k with strong rental demand',
  },
  {
    label: 'Buy, improve, sell',
    text: 'Houses in Birmingham under £280k to renovate and sell for a profit',
  },
];

const DEFAULT_FILTERS = {
  sort: 'match-desc',
  minScore: '',
  beds: '',
  maxBeds: '',
  minPrice: '',
  maxPrice: '',
  minYield: '',
  minSqft: '',
  propertyType: '',
  condition: '',
  cashFlowPositive: false,
  minMatch: '',
};

const SORT_OPTIONS = [
  { value: 'match-desc', label: 'Match % ↓' },
  { value: 'score-desc', label: 'Score ↓' },
  { value: 'score-asc', label: 'Score ↑' },
  { value: 'price-asc', label: 'Price ↑' },
  { value: 'price-desc', label: 'Price ↓' },
  { value: 'yield-desc', label: 'Yield ↓' },
  { value: 'cashflow-desc', label: 'Cash flow ↓' },
  { value: 'beds-desc', label: 'Beds ↓' },
  { value: 'sqft-desc', label: 'Sq ft ↓' },
  { value: 'listed-desc', label: 'Newest' },
];

function timeAgo(ts) {
  if (!ts) return null;
  const mins = Math.round((Date.now() - ts) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function floorAreaSqft(p) {
  if (p?.floorArea == null || Number.isNaN(Number(p.floorArea))) return null;
  // Parser stores sqm; convert for UK sq ft filters/display
  return Math.round(Number(p.floorArea) * 10.764);
}

function itemYield(item) {
  const p = item.property;
  const y = p.deal?.grossYield ?? p.rental?.grossYield;
  if (y == null || y === '') return null;
  return Number(y);
}

function itemCashFlow(item) {
  const cf = item.property.deal?.monthlyCashFlow;
  return cf == null ? null : Number(cf);
}

function applyResultFilters(opportunities, filters) {
  let list = opportunities.filter((item) => {
    const p = item.property;
    const score = Number(p.score) || 0;
    const beds = p.beds;
    const price = Number(p.price) || 0;
    const yieldPct = itemYield(item);
    const sqft = floorAreaSqft(p);
    const cashFlow = itemCashFlow(item);

    if (filters.minScore !== '' && score < Number(filters.minScore)) return false;
    if (filters.beds !== '') {
      const minBeds = Number(filters.beds);
      if (beds == null || beds < minBeds) return false;
    }
    if (filters.maxBeds !== '') {
      const maxBeds = Number(filters.maxBeds);
      if (beds == null || beds > maxBeds) return false;
    }
    if (filters.minPrice !== '' && price < Number(filters.minPrice)) return false;
    if (filters.maxPrice !== '' && price > Number(filters.maxPrice)) return false;
    if (filters.minYield !== '') {
      if (yieldPct == null || yieldPct < Number(filters.minYield)) return false;
    }
    if (filters.minSqft !== '') {
      if (sqft == null || sqft < Number(filters.minSqft)) return false;
    }
    if (filters.propertyType) {
      const type = String(p.propertyType || '').toLowerCase();
      if (type !== filters.propertyType) return false;
    }
    if (filters.condition) {
      const overall = String(p.condition?.overall || '').toLowerCase();
      const want = filters.condition.toLowerCase() === 'average' ? 'fair' : filters.condition.toLowerCase();
      if (overall !== want) return false;
    }
    if (filters.cashFlowPositive && (cashFlow == null || cashFlow < 0)) return false;
    if (filters.minMatch !== '' && (item.matchPct ?? 0) < Number(filters.minMatch)) return false;
    return true;
  });

  const [key, dir] = filters.sort.split('-');
  const mult = dir === 'asc' ? 1 : -1;
  list = [...list].sort((a, b) => {
    const pa = a.property;
    const pb = b.property;
    let va = 0;
    let vb = 0;
    switch (key) {
      case 'match':
        va = a.matchPct ?? 0;
        vb = b.matchPct ?? 0;
        break;
      case 'price':
        va = Number(pa.price) || 0;
        vb = Number(pb.price) || 0;
        break;
      case 'yield':
        va = itemYield(a) ?? -Infinity;
        vb = itemYield(b) ?? -Infinity;
        break;
      case 'cashflow':
        va = itemCashFlow(a) ?? -Infinity;
        vb = itemCashFlow(b) ?? -Infinity;
        break;
      case 'beds':
        va = pa.beds ?? -1;
        vb = pb.beds ?? -1;
        break;
      case 'sqft':
        va = floorAreaSqft(pa) ?? -1;
        vb = floorAreaSqft(pb) ?? -1;
        break;
      case 'listed':
        va = pa.listedAt || 0;
        vb = pb.listedAt || 0;
        break;
      case 'score':
      default:
        va = Number(pa.score) || 0;
        vb = Number(pb.score) || 0;
        break;
    }
    if (va === vb) return (b.matchPct ?? 0) - (a.matchPct ?? 0);
    return (va - vb) * mult;
  });

  return list;
}

function filtersAreActive(filters) {
  return Object.entries(filters).some(([k, v]) => {
    if (k === 'sort') return v !== DEFAULT_FILTERS.sort;
    if (k === 'cashFlowPositive') return Boolean(v);
    return v !== '' && v != null;
  });
}

function OpportunityCard({ item, onOpen }) {
  const { property: p, reasons, checklist, matchPct, rating, confidence, mode } = item;
  const isRefurb = mode === 'refurb' || p.strategyKey === 'flip';
  const yieldPct = p.deal?.grossYield ?? p.rental?.grossYield;
  const cashFlow = p.deal?.monthlyCashFlow;
  const rent = p.deal?.monthlyRent ?? p.rental?.expected;
  const listed = timeAgo(p.listedAt);
  const disc = p.comparables?.deviationPct;
  const isCheap = p.comparables?.undervalued === 'strong' || p.comparables?.undervalued === 'possible';
  const sqft = floorAreaSqft(p);
  const works = p.flip?.works
    || (p.condition?.refurbHigh
      ? Math.round(((p.condition.refurbLow || 0) + p.condition.refurbHigh) / 2)
      : null);
  const uplift = p.flip?.uplift;
  const matchTone = matchPct >= 80 ? 'excellent' : matchPct >= 65 ? 'good' : matchPct >= 50 ? 'fair' : 'weak';
  // Show a balanced checklist: up to 3 passes + up to 2 misses
  const checks = (() => {
    if (!checklist?.length) return (reasons || []).map((text) => ({ ok: true, text }));
    const ok = checklist.filter((c) => c.ok).slice(0, 3);
    const bad = checklist.filter((c) => !c.ok).slice(0, 2);
    return [...ok, ...bad].slice(0, 5);
  })();

  return (
    <button type="button" className="disc-card" onClick={onOpen}>
      <div className="disc-card-score" data-rating={matchTone}>
        <span className="disc-card-score-num">{matchPct ?? p.score}</span>
        <span className="disc-card-score-den">{matchPct != null ? '% match' : '/100'}</span>
      </div>
      <div className="disc-card-body">
        <div className="disc-card-top">
          <div>
            <div className="disc-card-title">
              {p.beds === 0 ? 'Studio' : `${p.beds} Bed`}{' '}
              {(p.propertyType || 'property').charAt(0).toUpperCase() + (p.propertyType || '').slice(1)}
              {isRefurb ? ' · Renovation' : ''}
              {sqft ? ` · ${sqft.toLocaleString()} sq ft` : ''}
            </div>
            <div className="disc-card-loc">{p.location}{p.postcode ? ` · ${p.postcode}` : ''}</div>
          </div>
          <div className="disc-card-price">£{(Number(p.price) || 0).toLocaleString()}</div>
        </div>
        <div className="disc-card-metrics">
          {isRefurb ? (
            <>
              <div>
                <div className="disc-m-label">Condition</div>
                <div className="disc-m-val">{p.condition?.verdict?.label || p.condition?.overall || 'Unknown'}</div>
              </div>
              <div>
                <div className="disc-m-label">Works est.</div>
                <div className="disc-m-val">{works ? `£${Number(works).toLocaleString()}` : '—'}</div>
              </div>
              <div>
                <div className="disc-m-label">Price vs sold</div>
                <div
                  className="disc-m-val"
                  style={{ color: isCheap ? 'var(--green, #16a34a)' : disc != null && disc > 3 ? 'var(--red, #dc2626)' : undefined }}
                >
                  {isCheap && disc != null
                    ? `−${Math.abs(disc)}% (BMV)`
                    : p.comparables?.verdict?.label
                      || (disc != null ? `${disc > 0 ? '+' : ''}${disc}%` : 'No comps')}
                </div>
              </div>
              <div>
                <div className="disc-m-label">Uplift vs GDV</div>
                <div
                  className="disc-m-val"
                  style={{
                    color: uplift == null
                      ? undefined
                      : uplift > 0
                        ? 'var(--green, #16a34a)'
                        : 'var(--red, #dc2626)',
                  }}
                >
                  {uplift != null ? `£${uplift.toLocaleString()}` : '—'}
                </div>
              </div>
            </>
          ) : (
            <>
              <div>
                <div className="disc-m-label">Est. rent</div>
                <div className="disc-m-val">{rent != null ? `£${Number(rent).toLocaleString()}/mo` : '—'}</div>
              </div>
              <div>
                <div className="disc-m-label">Gross yield</div>
                <div className="disc-m-val disc-m-val--green">{yieldPct != null ? `${yieldPct}%` : '—'}</div>
              </div>
              <div>
                <div className="disc-m-label">Cash flow</div>
                <div
                  className="disc-m-val"
                  style={{ color: cashFlow >= 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)' }}
                >
                  {cashFlow != null ? `${cashFlow >= 0 ? '+' : ''}£${cashFlow.toLocaleString()}/mo` : '—'}
                </div>
              </div>
              <div>
                <div className="disc-m-label">Inv. score</div>
                <div className="disc-m-val">{p.score}/100 · {rating}</div>
              </div>
            </>
          )}
        </div>
        <div className="disc-card-foot">
          <div className="disc-reasons">
            {checks.map((c) => (
              <span
                key={c.text}
                className={`disc-chip${c.ok ? ' disc-chip--ok' : c.warn ? ' disc-chip--warn' : ' disc-chip--no'}`}
              >
                {c.ok ? '✓' : c.warn ? '⚠' : '×'} {c.text}
              </span>
            ))}
          </div>
          <div className="disc-meta">
            <span>{isRefurb ? 'Renovation brief' : `Confidence ${confidence}`}</span>
            {listed && <span>Listed {listed}</span>}
          </div>
        </div>
      </div>
    </button>
  );
}

export default function Discover() {
  useStore();
  const navigate = useNavigate();
  const { showToast } = useApp();

  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(null);
  const [result, setResult] = useState(null);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [moreFilters, setMoreFilters] = useState(false);
  const [briefs, setBriefs] = useState(() => getBriefs());
  const [alerts, setAlerts] = useState(() => getDealAlerts());
  const [activeBriefId, setActiveId] = useState(() => getActiveBriefId());

  const briefDisplayName = useCallback((b) => {
    if (b?.name) return b.name;
    return nameInvestmentBrief(parseIntent(b?.query || ''), b?.query || '');
  }, []);

  const refreshSide = useCallback(() => {
    setBriefs(getBriefs());
    setAlerts(getDealAlerts());
    setActiveId(getActiveBriefId());
  }, []);

  useEffect(() => {
    const onStore = () => refreshSide();
    window.addEventListener('valora-store-change', onStore);
    return () => window.removeEventListener('valora-store-change', onStore);
  }, [refreshSide]);

  const filteredOpportunities = useMemo(
    () => (result?.opportunities?.length ? applyResultFilters(result.opportunities, filters) : []),
    [result, filters],
  );

  const propertyTypes = useMemo(() => {
    if (!result?.opportunities?.length) return [];
    const set = new Set();
    result.opportunities.forEach(({ property: p }) => {
      if (p.propertyType) set.add(String(p.propertyType).toLowerCase());
    });
    return [...set].sort();
  }, [result]);

  const setFilter = (key, value) => {
    setFilters((prev) => ({ ...prev, [key]: value }));
  };

  const clearFilters = () => setFilters(DEFAULT_FILTERS);

  const runSearch = async (q = query) => {
    const text = (q || '').trim();
    if (!text) return;
    setQuery(text);
    setLoading(true);
    setProgress({ phase: 'parse', message: 'Understanding your brief…' });
    setResult(null);
    setFilters(DEFAULT_FILTERS);
    try {
      const out = await runDiscover(text, {
        onProgress: setProgress,
        maxAnalyse: 20,
      });
      setResult(out);
      if (out.ok && out.opportunities.length) {
        // Only persist strong fits — don't pollute the library with weak leftovers
        out.opportunities
          .filter((o) => (o.matchPct ?? 0) >= 55)
          .slice(0, 8)
          .forEach(({ property }) => {
            try { saveCustom(property); } catch { /* ignore */ }
          });
        showToast(
          `${out.opportunities.length} opportunities`,
          out.briefName
            ? `${out.briefName} · analysed ${out.analysedCount} of ${out.resultCount.toLocaleString()} live`
            : `Analysed ${out.analysedCount} listings in ${out.intent.location}`,
        );
      } else if (!out.ok) {
        showToast('Discover', out.error || 'Search failed');
      } else {
        showToast('No matching opportunities', out.error || 'Try widening budget, beds, or strategy');
      }
    } catch (err) {
      showToast('Discover failed', err.message || 'Something went wrong');
    } finally {
      setLoading(false);
      setProgress(null);
    }
  };

  const saveCurrentBrief = () => {
    const text = query.trim();
    if (!text) return;
    const intent = result?.intent || parseIntent(text);
    const name = result?.briefName || nameInvestmentBrief(intent, text);
    const brief = saveBrief(text, {
      name,
      filters: intent,
      notify: true,
    });
    setActiveBriefId(brief.id);
    refreshSide();
    showToast('Investment Brief saved', `${name} · Valora will watch for new matches`);
    updateBrief(brief.id, { lastCheckedAt: null, name });
    runBriefMonitor({ force: true }).then(() => refreshSide()).catch(() => {});
  };

  const activateBrief = (brief) => {
    setActiveBriefId(brief.id);
    setActiveId(brief.id);
    runSearch(brief.query);
  };

  const openProperty = (property) => {
    try { saveCustom(property); } catch { /* ignore */ }
    navigate(`/analyse/${property.id}`, { viewTransition: true });
  };

  const unreadAlerts = alerts.filter((a) => !a.read);

  const aside = (
    <div className="disc-brief-aside">
      <div className="disc-brief-aside-head">
        <div className="disc-brief-aside-title">Investment Briefs</div>
        <p className="disc-brief-aside-sub">How you like to invest. Click to reload.</p>
      </div>
      {briefs.length === 0 ? (
        <p className="disc-brief-aside-empty">Save a brief after searching to monitor it.</p>
      ) : (
        <div className="disc-brief-aside-list">
          {briefs.slice(0, 12).map((b) => (
            <div
              key={b.id}
              className={`disc-brief-item${activeBriefId === b.id ? ' is-active' : ''}`}
            >
              <button type="button" className="disc-brief-item-main" onClick={() => activateBrief(b)}>
                <div className="disc-brief-item-name">{briefDisplayName(b)}</div>
                <div className="disc-brief-item-meta">
                  {b.active === false ? 'Paused' : 'Monitoring'}
                  {b.lastCheckedAt ? ` · ${timeAgo(b.lastCheckedAt)}` : ''}
                  {b.bestScore ? ` · best ${b.bestScore}%` : ''}
                </div>
              </button>
              <div className="disc-brief-item-actions">
                <button
                  type="button"
                  className="app-btn app-btn--ghost"
                  style={{ padding: '4px 8px', fontSize: 11 }}
                  onClick={() => {
                    setActiveBriefId(b.id);
                    setActiveId(b.id);
                    showToast('Brief active for Analyse', briefDisplayName(b));
                    refreshSide();
                  }}
                  title="Use this brief when analysing a listing URL"
                >
                  Use
                </button>
                <button type="button" className="app-btn app-btn--ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => { toggleBrief(b.id); refreshSide(); }}>
                  {b.active === false ? 'Resume' : 'Pause'}
                </button>
                <button type="button" className="app-btn app-btn--ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => { deleteBrief(b.id); refreshSide(); }}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <AppPage
      eyebrow="Property sourcing"
      title="Discover"
      subtitle="Describe what you want to buy. Valora searches live UK listings, analyses a shortlist, and ranks honest fits — not keyword leftovers."
      art={<IlluDiscover className="app-illu app-illu--header" />}
      aside={aside}
      actions={(
        <Link to="/analyse" viewTransition className="app-btn app-btn--ghost">
          Analyse a listing
        </Link>
      )}
    >
      <div className="disc-stat-strip">
        <AppStat
          accent="green"
          label="Portal pool"
          value={result?.resultCount != null ? result.resultCount.toLocaleString() : '—'}
          hint="Live listings found"
          icon="∿"
        />
        <AppStat
          accent="blue"
          label="Analysed"
          value={result?.analysedCount ?? '—'}
          hint={result?.searchMeta?.shortlisted ? `Shortlisted ${result.searchMeta.shortlisted}` : 'Full pipeline'}
          icon="◎"
        />
        <AppStat
          accent="amber"
          label="Fits"
          value={result?.opportunities?.length ?? '—'}
          hint={result?.filteredOut ? `${result.filteredOut} filtered out` : 'Match ≥ 35%'}
          icon="✦"
        />
      </div>

      {unreadAlerts.length > 0 && (
        <div className="app-panel" style={{ marginBottom: 16 }}>
          <div className="app-panel-head">
            <div className="app-panel-title">New matches</div>
            <span className="app-chip">{unreadAlerts.length}</span>
          </div>
          <div className="app-panel-body disc-alert-row">
            {unreadAlerts.slice(0, 5).map((a) => (
              <button
                key={a.id}
                type="button"
                className="app-card app-card--clickable"
                onClick={() => {
                  markAlertRead(a.id);
                  refreshSide();
                  if (a.propertyId) navigate(`/analyse/${a.propertyId}`, { viewTransition: true });
                }}
              >
                <div className="app-card-title" style={{ fontSize: 13 }}>
                  {a.score}% match · {a.location}
                </div>
                <div className="app-card-meta">
                  {a.briefName || a.briefQuery || 'Investment Brief'}
                  {a.listedAt ? ` · listed ${timeAgo(a.listedAt)}` : ''}
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      <div className="app-search-block app-search-block--green">
        <label className="app-search-label" htmlFor="discover-query">Investment Brief</label>
        <textarea
          id="discover-query"
          className="app-search-input"
          rows={3}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) runSearch(); }}
          placeholder="e.g. 3 bed houses in Little Chalfont under £600k that need modernising"
          disabled={loading}
        />
        <div className="app-search-actions">
          <button
            type="button"
            className="app-btn app-btn--primary"
            onClick={() => runSearch()}
            disabled={loading || !query.trim()}
          >
            {loading ? 'Searching…' : 'Find opportunities'}
          </button>
          <button
            type="button"
            className="app-btn app-btn--ghost"
            onClick={saveCurrentBrief}
            disabled={!query.trim()}
          >
            Save Brief
          </button>
        </div>
        <div className="app-example-row">
          <span style={{ fontSize: 12, color: '#86868b' }}>Examples:</span>
          {EXAMPLE_BRIEFS.map((b) => (
            <button key={b.label} type="button" className="app-example-chip" onClick={() => setQuery(b.text)} disabled={loading}>
              {b.label}
            </button>
          ))}
        </div>
      </div>

      {loading && progress && (
        <div className="disc-progress">
          <div className="disc-progress-bar">
            <div
              className="disc-progress-fill"
              style={{
                width: progress.phase === 'done'
                  ? '100%'
                  : progress.phase === 'analyse' && progress.total
                    ? `${Math.round((progress.done / progress.total) * 100)}%`
                    : progress.phase === 'search' ? '35%' : '12%',
              }}
            />
          </div>
          <div className="disc-progress-text">
            {progress.message
              || (progress.phase === 'parse' && 'Understanding your brief…')
              || (progress.phase === 'search' && 'Searching live listings…')
              || (progress.phase === 'analyse' && 'Running investment analysis…')
              || 'Working…'}
          </div>
        </div>
      )}

      {result?.chips?.length > 0 && (
        <div className="app-panel" style={{ marginBottom: 16 }}>
          <div className="app-panel-body">
            <div style={{ fontSize: 12, fontWeight: 600, color: '#86868b', marginBottom: 8 }}>
              {result.briefName || 'Investment Brief'} — understood as
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {(result.chips.length ? result.chips : briefCriteria(result.intent)).map((chip) => (
                <span key={chip} className="app-chip">{chip}</span>
              ))}
            </div>
            {result.searchMeta?.location && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--v-muted, #86868b)' }}>
                Searching {result.searchMeta.location.displayName}
                {result.resultCount != null ? ` · ${result.resultCount.toLocaleString()} on portal` : ''}
                {result.analysedCount != null ? ` · analysed ${result.analysedCount}` : ''}
                {' · '}Hard filters only (beds / price / type) — strategy cues used for ranking
              </div>
            )}
          </div>
        </div>
      )}

      {!result && !loading && (
        <AppEmpty
          art={<IlluDiscover className="app-illu app-illu--empty" />}
          title="Search for investment opportunities"
          description="Write a clear brief: town, beds, budget, and strategy. Valora searches live listings with hard filters, then ranks renovation or rental fit honestly."
        />
      )}

      {result && !loading && result.opportunities.length === 0 && (
        <AppEmpty
          art={<IlluDiscover className="app-illu app-illu--empty" />}
          title={result.ok === false && result.analysedCount === 0 ? 'Couldn’t run this brief' : 'No tight fits for this brief'}
          description={result.error || 'Listings were found but none cleared your hard filters or match threshold. Widen beds/budget, or soften strategy wording.'}
        />
      )}

      {result?.opportunities?.length > 0 && (
        <div className="disc-results">
          <div className="disc-results-head">
            <strong>{filteredOpportunities.length}</strong>
            {filteredOpportunities.length !== result.opportunities.length
              ? ` of ${result.opportunities.length}`
              : ''} opportunities
            <span>
              {result.briefName ? ` · ${result.briefName}` : ''}
              {' · '}analysed {result.analysedCount}
            </span>
          </div>

          <div className="disc-filters" role="group" aria-label="Filter and sort results">
            <div className="disc-filters-primary">
              <label className="disc-filter">
                <span>Sort</span>
                <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>
                  {SORT_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </label>

              <label className="disc-filter">
                <span>Min score</span>
                <select value={filters.minScore} onChange={(e) => setFilter('minScore', e.target.value)}>
                  <option value="">Any</option>
                  <option value="50">50+</option>
                  <option value="60">60+</option>
                  <option value="70">70+</option>
                  <option value="80">80+</option>
                </select>
              </label>

              <label className="disc-filter">
                <span>Beds</span>
                <select value={filters.beds} onChange={(e) => setFilter('beds', e.target.value)}>
                  <option value="">Any</option>
                  <option value="1">1+</option>
                  <option value="2">2+</option>
                  <option value="3">3+</option>
                  <option value="4">4+</option>
                </select>
              </label>

              <label className="disc-filter">
                <span>Max £</span>
                <input
                  type="number"
                  inputMode="numeric"
                  min="0"
                  step="10000"
                  placeholder="Any"
                  value={filters.maxPrice}
                  onChange={(e) => setFilter('maxPrice', e.target.value)}
                />
              </label>

              <button
                type="button"
                className={`disc-filter-more${moreFilters ? ' is-open' : ''}`}
                onClick={() => setMoreFilters((v) => !v)}
                aria-expanded={moreFilters}
              >
                {moreFilters ? 'Less' : 'More filters'}
              </button>

              {filtersAreActive(filters) && (
                <button type="button" className="disc-filter-clear" onClick={clearFilters}>
                  Clear
                </button>
              )}
            </div>

            {moreFilters && (
              <div className="disc-filters-grid">
                <label className="disc-filter">
                  <span>Max beds</span>
                  <select value={filters.maxBeds} onChange={(e) => setFilter('maxBeds', e.target.value)}>
                    <option value="">Any</option>
                    <option value="1">1</option>
                    <option value="2">2</option>
                    <option value="3">3</option>
                    <option value="4">4</option>
                    <option value="5">5</option>
                    <option value="6">6</option>
                  </select>
                </label>

                <label className="disc-filter">
                  <span>Type</span>
                  <select value={filters.propertyType} onChange={(e) => setFilter('propertyType', e.target.value)}>
                    <option value="">Any</option>
                    {propertyTypes.map((t) => (
                      <option key={t} value={t}>{t.charAt(0).toUpperCase() + t.slice(1)}</option>
                    ))}
                  </select>
                </label>

                <label className="disc-filter">
                  <span>Condition</span>
                  <select value={filters.condition} onChange={(e) => setFilter('condition', e.target.value)}>
                    <option value="">Any</option>
                    <option value="Poor">Poor</option>
                    <option value="Fair">Fair</option>
                    <option value="Good">Good</option>
                    <option value="Unknown">Unknown</option>
                  </select>
                </label>

                <label className="disc-filter">
                  <span>Min price £</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="10000"
                    placeholder="Any"
                    value={filters.minPrice}
                    onChange={(e) => setFilter('minPrice', e.target.value)}
                  />
                </label>

                <label className="disc-filter">
                  <span>Min yield %</span>
                  <input
                    type="number"
                    inputMode="decimal"
                    min="0"
                    step="0.5"
                    placeholder="Any"
                    value={filters.minYield}
                    onChange={(e) => setFilter('minYield', e.target.value)}
                  />
                </label>

                <label className="disc-filter">
                  <span>Min sq ft</span>
                  <input
                    type="number"
                    inputMode="numeric"
                    min="0"
                    step="50"
                    placeholder="Any"
                    value={filters.minSqft}
                    onChange={(e) => setFilter('minSqft', e.target.value)}
                  />
                </label>

                <label className="disc-filter disc-filter--check">
                  <input
                    type="checkbox"
                    checked={filters.cashFlowPositive}
                    onChange={(e) => setFilter('cashFlowPositive', e.target.checked)}
                  />
                  <span>Positive cash flow</span>
                </label>
              </div>
            )}
          </div>

          {filteredOpportunities.length === 0 ? (
            <AppEmpty
              title="No results match these filters"
              description="Try lowering the min score/yield, widening bedrooms, or clearing filters."
            />
          ) : (
            filteredOpportunities.map((item) => (
              <OpportunityCard
                key={item.property.id}
                item={item}
                onOpen={() => openProperty(item.property)}
              />
            ))
          )}
        </div>
      )}
    </AppPage>
  );
}
