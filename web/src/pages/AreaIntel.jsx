import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import AppPage, { AppEmpty, AppStat } from '../components/AppPage';
import { IlluIntel } from '../components/AppIllustrations';
import { api, gbp } from '../lib/api';

const POPULAR = ['M20', 'LS6', 'S6', 'B15', 'E14', 'CF10'];
const RECENT_KEY = 'valora_recent_areas';

function readRecent() {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]');
  } catch {
    return [];
  }
}
function writeRecent(list) {
  try {
    localStorage.setItem(RECENT_KEY, JSON.stringify(list.slice(0, 8)));
  } catch {
    /* convenience only */
  }
}

function AreaReport({ r }) {
  const s = r.sold;
  return (
    <div className="area-report-view">
      <div className="prototype-banner prototype-banner--live">
        Built from official and provider data retrieved {new Date(r.generatedAt).toLocaleString('en-GB')}. Every figure below names its source.
      </div>
      <div className="area-report-header">
        <h2>{r.place.label}{r.place.outcode && r.place.label !== r.place.outcode ? ` · ${r.place.outcode}` : ''}</h2>
        <p>{[r.place.district, r.place.country].filter(Boolean).join(', ') || 'Location details unavailable'}</p>
      </div>
      <div className="score-row">
        <div className="score-box">
          <div className="sb-num" style={{ color: 'var(--blue)' }}>{s?.median ? gbp(s.median) : '—'}</div>
          <div className="sb-label">Median sold price</div>
          <div className="sb-sub">{s ? `${s.count} sales · ${s.scope}` : 'Unavailable'}</div>
        </div>
        <div className="score-box">
          <div className="sb-num" style={{ color: s?.medianChange12m ? (s.medianChange12m.changePct >= 0 ? 'var(--green)' : 'var(--red)') : 'var(--muted)' }}>
            {s?.medianChange12m ? `${s.medianChange12m.changePct > 0 ? '+' : ''}${s.medianChange12m.changePct}%` : '—'}
          </div>
          <div className="sb-label">Median, last 12 months vs prior</div>
          <div className="sb-sub">{s?.medianChange12m ? `${s.medianChange12m.recentCount} vs ${s.medianChange12m.priorCount} sales` : 'Too few sales to compare'}</div>
        </div>
        <div className="score-box">
          <div className="sb-num" style={{ color: 'var(--amber)' }}>{r.rental?.monthlyAverage ? gbp(r.rental.monthlyAverage) : '—'}</div>
          <div className="sb-label">Average asking rent / month</div>
          <div className="sb-sub">{r.rental ? r.rental.scope : 'No rental data provider'}</div>
        </div>
      </div>

      {s && (
        <div className="section">
          <div className="section-title">Sold prices by type</div>
          <div className="area-metrics-grid">
            {s.byType.map((t) => (
              <div key={t.type} className="area-metric-card">
                <div className="area-metric-label">{t.type} · {t.count} sales</div>
                <div className="area-metric-val">{gbp(t.median)}</div>
              </div>
            ))}
            <div className="area-metric-card">
              <div className="area-metric-label">Middle 50% of sales</div>
              <div className="area-metric-val">{gbp(s.lowerQuartile)}–{gbp(s.upperQuartile)}</div>
            </div>
          </div>
          <p className="panel-footnote">{s.caveat} Source: {s.source}{s.newestSale ? ` · newest recorded sale ${s.newestSale}` : ''}.</p>
        </div>
      )}

      <div className="section">
        <div className="section-title">Planning designations</div>
        {r.planning == null ? (
          <p className="panel-footnote">Not checked.</p>
        ) : r.planning.length === 0 ? (
          <p className="panel-footnote">None recorded at this point. {r.planningNote} Coverage varies by council.</p>
        ) : (
          <ul className="pros-cons-list">
            {r.planning.map((c) => <li key={`${c.dataset}-${c.reference}`}><a href={c.sourceUrl} target="_blank" rel="noopener noreferrer">{c.dataset.replace(/-/g, ' ')}: {c.name}</a></li>)}
          </ul>
        )}
      </div>

      {r.unavailable.length > 0 && (
        <div className="section">
          <div className="section-title">Unavailable sources</div>
          <ul className="pros-cons-list">{r.unavailable.map((u) => <li key={u.source}>{u.source}: {u.reason}</li>)}</ul>
        </div>
      )}

      <div className="area-report-actions">
        <Link to="/discover" className="site-btn site-btn--primary">Find matching deals</Link>
        <Link to="/analyse" className="site-btn site-btn--ghost">Analyse a property</Link>
      </div>
    </div>
  );
}

export default function AreaIntel() {
  const [params, setParams] = useSearchParams();
  const [query, setQuery] = useState(params.get('q') || '');
  const [report, setReport] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [recent, setRecent] = useState(readRecent);

  const q = params.get('q');
  useEffect(() => {
    if (!q) return;
    setQuery(q);
    setLoading(true);
    setError(null);
    api(`/api/area?q=${encodeURIComponent(q)}`)
      .then((r) => {
        setReport(r);
        const next = [q, ...readRecent().filter((x) => x.toLowerCase() !== q.toLowerCase())];
        writeRecent(next);
        setRecent(next.slice(0, 8));
      })
      .catch((err) => {
        setReport(null);
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [q]);

  const runSearch = (raw) => {
    const v = (raw ?? query).trim();
    if (v.length < 2) return;
    setParams({ q: v });
  };

  const aside = (
    <>
      <div className="app-stat-grid" style={{ gridTemplateColumns: '1fr' }}>
        <AppStat accent="teal" label="Recent areas" value={recent.length} hint="On this device" icon="∿" />
      </div>
      {recent.length > 0 && (
        <div className="app-panel">
          <div className="app-panel-head"><div className="app-panel-title">Recent searches</div></div>
          <div className="app-panel-body app-card-list">
            {recent.map((r) => (
              <div key={r} className="app-card" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <button type="button" className="app-card app-card--clickable" style={{ flex: 1, boxShadow: 'none', border: 'none', padding: 0 }} onClick={() => runSearch(r)}>
                  <div className="app-card-title">{r}</div>
                </button>
                <button type="button" className="app-btn app-btn--ghost" style={{ padding: '6px 10px', fontSize: 12 }} aria-label={`Remove ${r}`} onClick={() => { const next = recent.filter((x) => x !== r); writeRecent(next); setRecent(next); }}>✕</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </>
  );

  return (
    <AppPage
      eyebrow="Market reports"
      title="Area intelligence"
      subtitle="Postcode, district and town reports from HM Land Registry sold prices, rental evidence and planning designations."
      art={<IlluIntel className="app-illu app-illu--header" />}
      aside={aside}
    >
      <form className="app-search-block app-search-block--teal" onSubmit={(e) => { e.preventDefault(); runSearch(); }} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16 }}>
        <input type="text" aria-label="Postcode, district or town" className="app-search-input" style={{ minHeight: 'auto', flex: 1 }} value={query} onChange={(e) => setQuery(e.target.value)} placeholder="e.g. S6, M20 2AB, Leeds" disabled={loading} />
        <button type="submit" className="app-btn app-btn--primary" disabled={loading}>{loading ? 'Loading…' : 'Search'}</button>
      </form>

      <div className="app-example-row" style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: '#86868b' }}>Popular:</span>
        {POPULAR.map((pc) => <button key={pc} type="button" className="app-example-chip" onClick={() => runSearch(pc)}>{pc}</button>)}
      </div>

      {error && <div className="notice-banner notice-banner--error">{error}</div>}
      {loading && <div className="notice-banner" role="status">Fetching sold prices, rents and planning data…</div>}
      {report && !loading ? (
        <AreaReport r={report} />
      ) : !loading && !error && (
        <AppEmpty art={<IlluIntel className="app-illu app-illu--empty" />} title="Search a postcode or district" description="Enter an outcode (S6), a full postcode (M1 4BT) or a town — Valora builds the report from live official data." />
      )}
    </AppPage>
  );
}
