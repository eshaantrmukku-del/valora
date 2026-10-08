import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import AppPage, { AppEmpty, AppStat } from '../components/AppPage';
import { IlluDiscover } from '../components/AppIllustrations';
import BriefEditor from '../components/discover/BriefEditor';
import { PROPERTY_TYPE_LABELS } from '../../../shared/brief';
import { useApi } from '../hooks/useApi';
import { useApp, setActiveBriefId, getActiveBriefId } from '../context/AppContext';
import { api, emitStoreChange, gbp } from '../lib/api';
import { providerLabel } from '../lib/adapters';

const EXAMPLE_BRIEFS = [
  { label: 'Manchester renovation', text: 'I want a three-bedroom house in Manchester under £500,000. Ideally it needs modernising, has a good-sized plot and might be suitable for an extension. I want to increase its value through renovation.' },
  { label: 'Long-term rental', text: 'Find properties in Leeds suitable for long-term rental with reliable tenant demand and positive monthly cash flow, under £250k.' },
  { label: 'Buy, improve, sell', text: 'Find houses in Birmingham under £280k that could be renovated and resold at a profit.' },
  { label: 'Chilterns value-add', text: '3 bed houses in Little Chalfont under £600k needing modernising with a large garden' },
];

const DEFAULT_FILTERS = { sort: 'match-desc', minScore: '', beds: '', maxBeds: '', minPrice: '', maxPrice: '', minYield: '', propertyType: '', cashFlowPositive: false, minConfidence: '' };

const SORT_OPTIONS = [
  { value: 'match-desc', label: 'Match ↓' },
  { value: 'confidence-desc', label: 'Confidence ↓' },
  { value: 'price-asc', label: 'Price ↑' },
  { value: 'price-desc', label: 'Price ↓' },
  { value: 'yield-desc', label: 'Yield ↓' },
  { value: 'cashflow-desc', label: 'Cash flow ↓' },
  { value: 'beds-desc', label: 'Beds ↓' },
];

function timeAgo(iso) {
  if (!iso) return null;
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 48) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

function applyResultFilters(results, f) {
  let list = results.filter((r) => {
    const x = r.facts;
    const m = r.ranking.metrics;
    if (f.minScore !== '' && r.matchScore < Number(f.minScore)) return false;
    if (f.minConfidence !== '' && r.confidence < Number(f.minConfidence)) return false;
    if (f.beds !== '' && (x.bedrooms == null || x.bedrooms < Number(f.beds))) return false;
    if (f.maxBeds !== '' && (x.bedrooms == null || x.bedrooms > Number(f.maxBeds))) return false;
    if (f.minPrice !== '' && (x.askingPrice == null || x.askingPrice < Number(f.minPrice))) return false;
    if (f.maxPrice !== '' && (x.askingPrice == null || x.askingPrice > Number(f.maxPrice))) return false;
    if (f.minYield !== '' && (m.grossYieldPct == null || m.grossYieldPct < Number(f.minYield))) return false;
    if (f.propertyType && x.propertyType !== f.propertyType) return false;
    if (f.cashFlowPositive && (m.monthlyCashFlow == null || m.monthlyCashFlow < 0)) return false;
    return true;
  });
  const [key, dir] = f.sort.split('-');
  const mult = dir === 'asc' ? 1 : -1;
  const val = (r) => {
    switch (key) {
      case 'price': return r.facts.askingPrice ?? (dir === 'asc' ? Infinity : -Infinity);
      case 'yield': return r.ranking.metrics.grossYieldPct ?? -Infinity;
      case 'cashflow': return r.ranking.metrics.monthlyCashFlow ?? -Infinity;
      case 'beds': return r.facts.bedrooms ?? -1;
      case 'confidence': return r.confidence;
      default: return r.matchScore;
    }
  };
  list = [...list].sort((a, b) => (val(a) === val(b) ? b.matchScore - a.matchScore : (val(a) - val(b)) * mult));
  return list;
}

function filtersAreActive(filters) {
  return Object.entries(filters).some(([k, v]) => (k === 'sort' ? v !== DEFAULT_FILTERS.sort : k === 'cashFlowPositive' ? Boolean(v) : v !== '' && v != null));
}

function OpportunityCard({ item, objective, onOpen, onSave, onDismiss, onCompare, onReport }) {
  const p = item.facts;
  const r = item.ranking;
  const m = r.metrics;
  const isRefurb = objective === 'renovation_value_add' || objective === 'renovation_resale';
  const matchTone = item.matchScore >= 80 ? 'excellent' : item.matchScore >= 65 ? 'good' : item.matchScore >= 50 ? 'fair' : 'weak';
  const checks = [
    ...r.constraints.filter((c) => c.status === 'pass').slice(0, 3).map((c) => ({ ok: true, text: c.description })),
    ...r.constraints.filter((c) => c.status === 'unknown').slice(0, 2).map((c) => ({ warn: true, text: `${c.description}: unconfirmed` })),
  ];
  const condition = r.components.find((c) => c.key === 'conditionOpportunity');
  const title = [p.bedrooms != null ? (p.bedrooms === 0 ? 'Studio' : `${p.bedrooms} Bed`) : 'Beds unknown', p.propertyType ? PROPERTY_TYPE_LABELS[p.propertyType] : 'Property'].join(' ');
  const [reporting, setReporting] = useState(false);
  const [reportText, setReportText] = useState('');

  return (
    <div className="disc-card" style={{ cursor: 'default' }}>
      <div className="disc-card-score" data-rating={matchTone}>
        <span className="disc-card-score-num">{item.matchScore}</span>
        <span className="disc-card-score-den">/100 match</span>
      </div>
      <div className="disc-card-body">
        <div className="disc-card-top">
          <div>
            <button type="button" className="disc-card-title" style={{ all: 'unset', cursor: 'pointer', fontWeight: 600 }} onClick={onOpen}>
              {title}{isRefurb ? ' · Renovation' : ''}{p.floorAreaSqm ? ` · ${p.floorAreaSqm} m²` : ''}
            </button>
            <div className="disc-card-loc">{p.address || p.outcode || 'Address not supplied'}{p.postcode ? ` · ${p.postcode}` : ''}</div>
          </div>
          <div className="disc-card-price">{p.askingPrice != null ? gbp(p.askingPrice) : 'Price unknown'}</div>
        </div>
        <div className="disc-card-metrics">
          {isRefurb ? (
            <>
              <div><div className="disc-m-label">Improvement</div><div className="disc-m-val">{condition?.score != null ? `${condition.score}/100` : 'Unknown'}</div></div>
              <div><div className="disc-m-label">Price vs sold</div><div className="disc-m-val" style={{ color: m.discountToComparablesPct > 0 ? 'var(--green, #16a34a)' : undefined }}>{m.discountToComparablesPct == null ? 'No comps' : m.discountToComparablesPct >= 0 ? `${m.discountToComparablesPct}% below` : `${-m.discountToComparablesPct}% above`}</div></div>
              <div><div className="disc-m-label">Comparables</div><div className="disc-m-val">{m.comparableCount || '—'}</div></div>
              <div><div className="disc-m-label">Net profit est.</div><div className="disc-m-val" style={{ color: m.estimatedNetProfit == null ? undefined : m.estimatedNetProfit > 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)' }}>{m.estimatedNetProfit != null ? gbp(m.estimatedNetProfit) : '—'}</div></div>
            </>
          ) : (
            <>
              <div><div className="disc-m-label">Gross yield</div><div className="disc-m-val disc-m-val--green">{m.grossYieldPct != null ? `${m.grossYieldPct}%` : '—'}</div></div>
              <div><div className="disc-m-label">Cash flow</div><div className="disc-m-val" style={{ color: m.monthlyCashFlow == null ? undefined : m.monthlyCashFlow >= 0 ? 'var(--green, #16a34a)' : 'var(--red, #dc2626)' }}>{m.monthlyCashFlow != null ? `${gbp(m.monthlyCashFlow)}/mo` : '—'}</div></div>
              <div><div className="disc-m-label">Price vs sold</div><div className="disc-m-val">{m.discountToComparablesPct == null ? 'No comps' : `${m.discountToComparablesPct >= 0 ? '−' : '+'}${Math.abs(m.discountToComparablesPct)}%`}</div></div>
              <div><div className="disc-m-label">Confidence</div><div className="disc-m-val">{item.confidence}% · {r.confidenceLabel}</div></div>
            </>
          )}
        </div>
        <p style={{ fontSize: 12.5, color: 'var(--muted)', margin: '8px 0 0' }}>{r.summary}</p>
        {r.highlights.slice(0, 2).map((h) => <p key={h} style={{ fontSize: 12.5, margin: '4px 0 0' }}>✓ {h}</p>)}
        {r.concerns.slice(0, 2).map((h) => <p key={h} style={{ fontSize: 12.5, margin: '4px 0 0', color: 'var(--amber)' }}>⚠ {h}</p>)}
        <div className="disc-card-foot">
          <div className="disc-reasons">
            {checks.map((c) => (
              <span key={c.text} className={`disc-chip${c.ok ? ' disc-chip--ok' : c.warn ? ' disc-chip--warn' : ' disc-chip--no'}`}>{c.ok ? '✓' : '⚠'} {c.text}</span>
            ))}
          </div>
          <div className="disc-meta">
            <span>{item.listing ? providerLabel(item.listing.provider) : 'Source unknown'}</span>
            {item.listing?.lastCheckedAt && <span>Checked {timeAgo(item.listing.lastCheckedAt)}</span>}
            {item.isNew && <span className="status-pill status-pill--ok">New</span>}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" className="app-btn app-btn--primary" onClick={onOpen}>View analysis</button>
          <button type="button" className="app-btn app-btn--ghost" onClick={onSave}>{item.saved ? 'Saved ✓' : 'Save'}</button>
          <button type="button" className="app-btn app-btn--ghost" onClick={onCompare}>Compare</button>
          {item.listing?.url ? (
            <a className="app-btn app-btn--ghost" href={item.listing.url} target="_blank" rel="noopener noreferrer">Open listing ↗</a>
          ) : (
            <span className="app-btn app-btn--ghost" aria-disabled="true" style={{ opacity: 0.55 }} title="The provider did not supply a listing link">No listing link</span>
          )}
          <button type="button" className="app-btn app-btn--ghost" onClick={onDismiss}>Dismiss</button>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => setReporting((v) => !v)}>Report data</button>
        </div>
        {reporting && (
          <form style={{ display: 'flex', gap: 6, marginTop: 8, flexWrap: 'wrap' }} onSubmit={(e) => { e.preventDefault(); if (reportText.trim().length >= 3) { onReport(reportText.trim()); setReporting(false); setReportText(''); } }}>
            <input className="app-search-input" style={{ minHeight: 'auto', flex: '1 1 240px' }} placeholder="What’s wrong? e.g. bedrooms should be 2" value={reportText} onChange={(e) => setReportText(e.target.value)} aria-label="Describe the incorrect data" />
            <button type="submit" className="app-btn app-btn--primary" disabled={reportText.trim().length < 3}>Send</button>
          </form>
        )}
      </div>
    </div>
  );
}

function BriefItem({ b, active, onRun, onEdit, onUse, onToggle, onDuplicate, onDelete, onMonitor }) {
  const [confirm, setConfirm] = useState(false);
  const mon = b.monitor;
  return (
    <div className={`disc-brief-item${active ? ' is-active' : ''}`}>
      <button type="button" className="disc-brief-item-main" onClick={onRun}>
        <div className="disc-brief-item-name">{b.name}</div>
        <div className="disc-brief-item-meta">
          {b.status === 'inactive' ? 'Inactive' : 'Active'}
          {mon?.active ? ` · Monitoring every ${mon.frequencyHours}h` : ' · Not monitored'}
          {mon?.lastRunAt ? ` · last check ${timeAgo(mon.lastRunAt)}` : ''}
        </div>
      </button>
      <div className="disc-brief-item-actions">
        {[
          ['Edit', onEdit, 'Edit the brief criteria'],
          ['Use', onUse, 'Use this brief when analysing a property'],
          [mon?.active ? 'Stop alerts' : 'Monitor', onMonitor, 'Re-run this brief on a schedule and alert you to new matches'],
          [b.status === 'inactive' ? 'Activate' : 'Deactivate', onToggle, ''],
          ['Copy', onDuplicate, 'Duplicate'],
        ].map(([label, fn, title]) => (
          <button key={label} type="button" className="app-btn app-btn--ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={fn} title={title}>{label}</button>
        ))}
        {confirm ? (
          <>
            <button type="button" className="app-btn app-btn--primary" style={{ padding: '4px 8px', fontSize: 11 }} onClick={onDelete}>Delete</button>
            <button type="button" className="app-btn app-btn--ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setConfirm(false)}>Keep</button>
          </>
        ) : (
          <button type="button" className="app-btn app-btn--ghost" style={{ padding: '4px 8px', fontSize: 11 }} onClick={() => setConfirm(true)} aria-label={`Delete ${b.name}`}>✕</button>
        )}
      </div>
      {mon?.lastError && <div style={{ fontSize: 11, color: 'var(--red)', padding: '0 10px 8px' }}>Last check failed: {mon.lastError}</div>}
    </div>
  );
}

export default function Discover() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { showToast, analyseProperty } = useApp();
  const briefsRes = useApi('/api/briefs');
  const integrations = useApi('/api/integrations');
  const briefs = briefsRes.data?.briefs || [];

  const [query, setQuery] = useState(() => params.get('q') || '');
  const [draft, setDraft] = useState(null); // { id?, name, criteria, interpreter, notice, originalRequest }
  const [interpreting, setInterpreting] = useState(false);
  const [run, setRun] = useState(null);
  const [results, setResults] = useState([]);
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [moreFilters, setMoreFilters] = useState(false);
  const [activeBriefId, setActiveId] = useState(() => getActiveBriefId());
  const pollRef = useRef(null);

  const listingProviders = (integrations.data?.providers || []).filter((p) => p.kind === 'listings' || p.kind === 'test');
  const anyListingProvider = listingProviders.some((p) => p.configured);

  const loadRun = useCallback(async (runId) => {
    clearTimeout(pollRef.current);
    try {
      const r = await api(`/api/search-runs/${runId}`);
      setRun(r.run);
      setResults(r.results);
      if (r.run.status === 'queued' || r.run.status === 'running') {
        pollRef.current = setTimeout(() => loadRun(runId), 1500);
      }
    } catch (err) {
      showToast('Could not load search', err.message);
    }
  }, [showToast]);

  useEffect(() => () => clearTimeout(pollRef.current), []);

  // Open a brief from ?brief=<id>: load it into the editor and show its latest results.
  const briefParam = params.get('brief');
  useEffect(() => {
    if (!briefParam) return;
    (async () => {
      try {
        const [{ brief }, { runs }] = await Promise.all([api(`/api/briefs/${briefParam}`), api(`/api/search-runs?briefId=${briefParam}`)]);
        setDraft({ id: brief.id, name: brief.name, criteria: brief.criteria, interpreter: brief.interpreter, originalRequest: brief.originalRequest, notice: null, status: brief.status });
        setQuery(brief.originalRequest || '');
        if (runs[0]) loadRun(runs[0].id);
        else {
          setRun(null);
          setResults([]);
        }
      } catch (err) {
        showToast('Could not open brief', err.message);
      }
    })();
  }, [briefParam, loadRun, showToast]);

  const filtered = useMemo(() => applyResultFilters(results, filters), [results, filters]);
  const propertyTypes = useMemo(() => [...new Set(results.map((r) => r.facts.propertyType).filter(Boolean))], [results]);
  const setFilter = (k, v) => setFilters((f) => ({ ...f, [k]: v }));

  const interpret = async (text = query) => {
    const t = (text || '').trim();
    if (t.length < 8) {
      showToast('Describe your goal', 'Add a little more detail — location, budget and strategy help most.');
      return;
    }
    setQuery(t);
    setInterpreting(true);
    try {
      const r = await api('/api/briefs/interpret', { method: 'POST', body: { request: t } });
      setDraft({ name: r.name, criteria: r.criteria, interpreter: r.interpreter, notice: r.notice, originalRequest: t });
      setRun(null);
      setResults([]);
      if (params.get('brief')) setParams({});
    } catch (err) {
      showToast('Could not interpret', err.message);
    } finally {
      setInterpreting(false);
    }
  };

  const saveDraft = async () => {
    if (!draft) return null;
    const body = { name: draft.name.trim() || 'Untitled brief', originalRequest: draft.originalRequest || null, criteria: draft.criteria, interpreter: draft.id ? draft.interpreter : draft.interpreter === 'ai' ? 'ai' : draft.interpreter, status: draft.status || 'active' };
    try {
      const r = draft.id
        ? await api(`/api/briefs/${draft.id}`, { method: 'PUT', body })
        : await api('/api/briefs', { method: 'POST', body });
      setDraft((d) => ({ ...d, id: r.brief.id, criteria: r.brief.criteria }));
      emitStoreChange();
      return r.brief;
    } catch (err) {
      const detail = err.details?.[0];
      showToast('Could not save brief', detail ? `${err.message} (${detail.path}: ${detail.message})` : err.message);
      return null;
    }
  };

  const startSearch = async ({ save }) => {
    if (!draft) return;
    let briefId = null;
    if (save) {
      const b = await saveDraft();
      if (!b) return;
      briefId = b.id;
      showToast('Brief saved', b.name);
    }
    try {
      const r = await api('/api/search-runs', {
        method: 'POST',
        body: { briefId, criteria: briefId ? null : draft.criteria, name: briefId ? null : draft.name, idempotencyKey: `${Date.now()}-${Math.random().toString(36).slice(2, 10)}` },
      });
      setRun(r.run);
      setResults([]);
      setFilters(DEFAULT_FILTERS);
      loadRun(r.run.id);
    } catch (err) {
      const detail = err.details?.[0];
      showToast('Search not started', detail ? detail.message : err.message);
    }
  };

  const briefAction = async (b, action) => {
    try {
      if (action === 'run') {
        setParams({ brief: b.id });
        const r = await api('/api/search-runs', { method: 'POST', body: { briefId: b.id, criteria: null, name: null, idempotencyKey: `${b.id}-${Date.now()}` } });
        setRun(r.run);
        setResults([]);
        loadRun(r.run.id);
      }
      if (action === 'edit') setParams({ brief: b.id });
      if (action === 'use') {
        setActiveBriefId(b.id);
        setActiveId(b.id);
        showToast('Brief active for Analyse', b.name);
      }
      if (action === 'toggle') await api(`/api/briefs/${b.id}`, { method: 'PATCH', body: { status: b.status === 'inactive' ? 'active' : 'inactive' } });
      if (action === 'duplicate') await api(`/api/briefs/${b.id}/duplicate`, { method: 'POST' });
      if (action === 'delete') {
        await api(`/api/briefs/${b.id}`, { method: 'DELETE' });
        if (draft?.id === b.id) setDraft(null);
        if (activeBriefId === b.id) setActiveBriefId(null);
      }
      if (action === 'monitor') {
        const on = !b.monitor?.active;
        await api(`/api/briefs/${b.id}/monitor`, { method: 'PUT', body: { active: on, frequencyHours: b.monitor?.frequencyHours || 24 } });
        showToast(on ? 'Monitoring on' : 'Monitoring paused', on ? 'Valora’s scheduler will re-run this brief every 24 hours and notify you of new matches and price changes.' : b.name);
      }
      emitStoreChange();
    } catch (err) {
      showToast('Action failed', err.message);
    }
  };

  const onSave = async (item) => {
    try {
      if (item.saved) await api(`/api/saved/${item.propertyId}`, { method: 'DELETE' });
      else await api('/api/saved', { method: 'POST', body: { propertyId: item.propertyId, briefId: run?.briefId || null } });
      setResults((rs) => rs.map((r) => (r.id === item.id ? { ...r, saved: !item.saved } : r)));
      emitStoreChange();
    } catch (err) {
      showToast('Could not save', err.message);
    }
  };
  const onDismiss = async (item) => {
    try {
      await api(`/api/search-results/${item.id}/dismiss`, { method: 'POST' });
      setResults((rs) => rs.filter((r) => r.id !== item.id));
      showToast('Dismissed', 'This property won’t appear in future searches. Undo in Settings.');
    } catch (err) {
      showToast('Could not dismiss', err.message);
    }
  };
  const onReport = async (item, message) => {
    try {
      await api(`/api/properties/${item.propertyId}/report`, { method: 'POST', body: { field: 'general', message } });
      showToast('Thanks — report recorded', 'We’ll review this listing’s data.');
    } catch (err) {
      showToast('Could not send report', err.message);
    }
  };

  const running = run && (run.status === 'queued' || run.status === 'running');

  const aside = (
    <div className="disc-brief-aside">
      <div className="disc-brief-aside-head">
        <div className="disc-brief-aside-title">Investment Briefs</div>
        <p className="disc-brief-aside-sub">Saved strategies. Click one to re-run it.</p>
      </div>
      {briefsRes.loading && !briefs.length ? (
        <p className="disc-brief-aside-empty">Loading…</p>
      ) : briefs.length === 0 ? (
        <p className="disc-brief-aside-empty">Describe a goal, review the brief, then save it here.</p>
      ) : (
        <div className="disc-brief-aside-list">
          {briefs.map((b) => (
            <BriefItem
              key={b.id}
              b={b}
              active={activeBriefId === b.id}
              onRun={() => briefAction(b, 'run')}
              onEdit={() => briefAction(b, 'edit')}
              onUse={() => briefAction(b, 'use')}
              onToggle={() => briefAction(b, 'toggle')}
              onDuplicate={() => briefAction(b, 'duplicate')}
              onDelete={() => briefAction(b, 'delete')}
              onMonitor={() => briefAction(b, 'monitor')}
            />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <AppPage
      eyebrow="Property sourcing"
      title="Discover"
      subtitle="Describe what you want to achieve. Valora turns it into a structured brief, searches connected live listing sources and ranks the results against your strategy."
      art={<IlluDiscover className="app-illu app-illu--header" />}
      aside={aside}
      actions={<Link to="/analyse" viewTransition className="app-btn app-btn--ghost">Analyse a listing</Link>}
    >
      {integrations.data && !anyListingProvider && (
        <div className="notice-banner notice-banner--warn">
          <strong>No live listing provider is connected.</strong> You can still write and save briefs, but searches won’t return listings until an administrator adds a PropertyData API key. Valora never shows invented listings. <Link to="/settings#integrations">See integrations</Link>
        </div>
      )}

      <div className="disc-stat-strip">
        <AppStat accent="green" label="Candidates" value={run ? run.candidateCount : '—'} hint="Listings retrieved" icon="∿" />
        <AppStat accent="blue" label="Ranked" value={run ? run.resultCount : '—'} hint="Passed hard requirements" icon="◎" />
        <AppStat accent="amber" label="Showing" value={run ? filtered.length : '—'} hint={filtersAreActive(filters) ? 'After your filters' : 'All results'} icon="✦" />
      </div>

      <div className="app-search-block app-search-block--green">
        <label className="app-search-label" htmlFor="discover-query">Your investment goal</label>
        <textarea
          id="discover-query"
          className="app-search-input"
          rows={3}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) interpret(); }}
          placeholder="e.g. A three-bedroom house in Manchester under £500,000 that needs modernising, with a good plot and potential to extend."
          disabled={interpreting}
        />
        <div className="app-search-actions">
          <button type="button" className="app-btn app-btn--primary" onClick={() => interpret()} disabled={interpreting || !query.trim()}>
            {interpreting ? 'Understanding…' : 'Interpret goal'}
          </button>
        </div>
        <div className="app-example-row">
          <span style={{ fontSize: 12, color: '#86868b' }}>Examples:</span>
          {EXAMPLE_BRIEFS.map((b) => (
            <button key={b.label} type="button" className="app-example-chip" onClick={() => setQuery(b.text)} disabled={interpreting}>{b.label}</button>
          ))}
        </div>
      </div>

      {draft?.criteria && (
        <div className="app-panel" style={{ marginBottom: 16 }}>
          <div className="app-panel-head">
            <div className="app-panel-title">{draft.id ? 'Investment Brief' : 'Interpreted brief — review before searching'}</div>
            <span className="panel-badge">{draft.interpreter === 'ai' ? 'Interpreted by AI' : draft.interpreter === 'rules' ? 'Rule-based parser' : 'Manual'}</span>
          </div>
          <div className="app-panel-body">
            {draft.notice && <div className="notice-banner">{draft.notice}</div>}
            {draft.criteria.clarificationQuestions.length > 0 && (
              <div className="notice-banner notice-banner--warn">
                <strong>Valora needs a little more detail:</strong>
                <ul style={{ margin: '6px 0 0 18px' }}>{draft.criteria.clarificationQuestions.map((q) => <li key={q}>{q}</li>)}</ul>
              </div>
            )}
            <BriefEditor
              name={draft.name}
              onNameChange={(name) => setDraft((d) => ({ ...d, name }))}
              criteria={draft.criteria}
              onChange={(criteria) => setDraft((d) => ({ ...d, criteria }))}
            />
            <div className="app-search-actions" style={{ marginTop: 16 }}>
              <button type="button" className="app-btn app-btn--primary" onClick={() => startSearch({ save: true })} disabled={running}>
                {draft.id ? 'Save changes & search' : 'Save brief & search'}
              </button>
              <button type="button" className="app-btn app-btn--ghost" onClick={() => startSearch({ save: false })} disabled={running}>Search without saving</button>
              <button type="button" className="app-btn app-btn--ghost" onClick={async () => { const b = await saveDraft(); if (b) showToast('Brief saved', b.name); }}>Save only</button>
            </div>
          </div>
        </div>
      )}

      {run && (
        <div className="disc-progress" role="status">
          <div className="disc-progress-bar">
            <div className="disc-progress-fill" style={{ width: running ? (run.status === 'queued' ? '12%' : '55%') : '100%' }} />
          </div>
          <div className="disc-progress-text">
            {run.stage || run.status} · {run.briefName}
            {run.finishedAt ? ` · finished ${timeAgo(run.finishedAt)}` : ''}
          </div>
          {run.providerStatus?.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
              {run.providerStatus.map((s) => (
                <span key={`${s.provider}-${s.message}`} className={`status-pill status-pill--${s.status === 'ok' ? 'ok' : s.status === 'failed' ? 'bad' : 'warn'}`} title={s.message}>
                  {s.provider}: {s.status === 'ok' ? `${s.count} listings` : s.status.replace('_', ' ')}
                </span>
              ))}
            </div>
          )}
          {run.error && <div className="notice-banner notice-banner--error" style={{ marginTop: 8 }}>{run.error}</div>}
          {run.status === 'partial' && <div className="notice-banner notice-banner--warn" style={{ marginTop: 8 }}>Some sources were unavailable; results come only from the sources that responded.</div>}
        </div>
      )}

      {!run && !draft && (
        <AppEmpty
          art={<IlluDiscover className="app-illu app-illu--empty" />}
          title="Search for investment opportunities"
          description="Describe your goal — location, budget, property and strategy. Valora shows you how it understood the brief before searching."
        />
      )}

      {run && !running && results.length === 0 && run.status !== 'failed' && (
        <AppEmpty art={<IlluDiscover className="app-illu app-illu--empty" />} title="No properties met this brief" description="Listings were checked but none passed the hard requirements. Try widening the budget, bedrooms, area or radius." />
      )}

      {results.length > 0 && (
        <div className="disc-results">
          <div className="disc-results-head">
            <strong>{filtered.length}</strong>
            {filtered.length !== results.length ? ` of ${results.length}` : ''} ranked properties
            <span>{run?.briefName ? ` · ${run.briefName}` : ''} · match score shows fit to your strategy, not likelihood of success</span>
          </div>

          <div className="disc-filters" role="group" aria-label="Filter and sort results">
            <div className="disc-filters-primary">
              <label className="disc-filter"><span>Sort</span>
                <select value={filters.sort} onChange={(e) => setFilter('sort', e.target.value)}>{SORT_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select>
              </label>
              <label className="disc-filter"><span>Min match</span>
                <select value={filters.minScore} onChange={(e) => setFilter('minScore', e.target.value)}><option value="">Any</option><option value="50">50+</option><option value="60">60+</option><option value="70">70+</option><option value="80">80+</option></select>
              </label>
              <label className="disc-filter"><span>Beds</span>
                <select value={filters.beds} onChange={(e) => setFilter('beds', e.target.value)}><option value="">Any</option><option value="1">1+</option><option value="2">2+</option><option value="3">3+</option><option value="4">4+</option></select>
              </label>
              <label className="disc-filter"><span>Max £</span>
                <input type="number" inputMode="numeric" min="0" step="10000" placeholder="Any" value={filters.maxPrice} onChange={(e) => setFilter('maxPrice', e.target.value)} />
              </label>
              <button type="button" className={`disc-filter-more${moreFilters ? ' is-open' : ''}`} onClick={() => setMoreFilters((v) => !v)} aria-expanded={moreFilters}>{moreFilters ? 'Less' : 'More filters'}</button>
              {filtersAreActive(filters) && <button type="button" className="disc-filter-clear" onClick={() => setFilters(DEFAULT_FILTERS)}>Clear</button>}
            </div>
            {moreFilters && (
              <div className="disc-filters-grid">
                <label className="disc-filter"><span>Max beds</span>
                  <select value={filters.maxBeds} onChange={(e) => setFilter('maxBeds', e.target.value)}><option value="">Any</option>{[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}</select>
                </label>
                <label className="disc-filter"><span>Type</span>
                  <select value={filters.propertyType} onChange={(e) => setFilter('propertyType', e.target.value)}><option value="">Any</option>{propertyTypes.map((t) => <option key={t} value={t}>{PROPERTY_TYPE_LABELS[t]}</option>)}</select>
                </label>
                <label className="disc-filter"><span>Min confidence</span>
                  <select value={filters.minConfidence} onChange={(e) => setFilter('minConfidence', e.target.value)}><option value="">Any</option><option value="45">Medium+</option><option value="75">High</option></select>
                </label>
                <label className="disc-filter"><span>Min price £</span>
                  <input type="number" inputMode="numeric" min="0" step="10000" placeholder="Any" value={filters.minPrice} onChange={(e) => setFilter('minPrice', e.target.value)} />
                </label>
                <label className="disc-filter"><span>Min yield %</span>
                  <input type="number" inputMode="decimal" min="0" step="0.5" placeholder="Any" value={filters.minYield} onChange={(e) => setFilter('minYield', e.target.value)} />
                </label>
                <label className="disc-filter disc-filter--check">
                  <input type="checkbox" checked={filters.cashFlowPositive} onChange={(e) => setFilter('cashFlowPositive', e.target.checked)} />
                  <span>Positive cash flow</span>
                </label>
              </div>
            )}
          </div>

          {filtered.length === 0 ? (
            <AppEmpty title="No results match these filters" description="Try lowering the minimum match or yield, or clear the filters." />
          ) : (
            filtered.map((item) => (
              <OpportunityCard
                key={item.id}
                item={item}
                objective={run?.criteria?.objective}
                onOpen={() => analyseProperty(item.propertyId, run?.briefId || null)}
                onSave={() => onSave(item)}
                onDismiss={() => onDismiss(item)}
                onCompare={() => navigate(`/compare?add=${item.propertyId}${run?.briefId ? `&brief=${run.briefId}` : ''}`)}
                onReport={(msg) => onReport(item, msg)}
              />
            ))
          )}
        </div>
      )}
    </AppPage>
  );
}
