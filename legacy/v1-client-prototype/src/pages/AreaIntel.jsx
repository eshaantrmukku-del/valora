import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import AppPage, { AppEmpty, AppStat } from '../components/AppPage';
import { IlluIntel } from '../components/AppIllustrations';
import AreaReportView from '../components/AreaReportView';
import { generateAreaReport } from '../lib/areaReport';
import { deleteAreaReport, getAreaReport, listAreaReports, saveAreaReport } from '../lib/storage';
import { useStore } from '../hooks/useStore';

const POPULAR = ['M1', 'LS6', 'S6', 'B15', 'E14', 'CF10'];

export default function AreaIntel() {
  useStore();
  const [params, setParams] = useSearchParams();
  const initial = params.get('q') || '';
  const [query, setQuery] = useState(initial);
  const [report, setReport] = useState(initial ? getAreaReport(initial) || generateAreaReport(initial) : null);
  const [analysing, setAnalysing] = useState(false);

  const savedReports = listAreaReports().slice(0, 8);

  useEffect(() => {
    const q = params.get('q');
    if (q) {
      setQuery(q);
      const existing = getAreaReport(q);
      const r = existing || generateAreaReport(q);
      if (!existing) saveAreaReport(q, r);
      setReport(r);
    }
  }, [params]);

  const runSearch = async (raw) => {
    const q = (raw ?? query).trim();
    if (!q) return;
    setAnalysing(true);
    await new Promise((r) => setTimeout(r, 180));
    const r = generateAreaReport(q);
    saveAreaReport(q, r);
    setReport(r);
    setQuery(q);
    setParams({ q });
    setAnalysing(false);
  };

  const onSearch = (e) => {
    e.preventDefault();
    runSearch();
  };

  const aside = (
    <>
      <div className="app-stat-grid" style={{ gridTemplateColumns: '1fr' }}>
        <AppStat accent="teal" label="Recent areas" value={savedReports.length} hint="Cached in this browser" icon="∿" />
      </div>
      {savedReports.length > 0 && (
        <div className="app-panel">
          <div className="app-panel-head">
            <div className="app-panel-title">Recent searches</div>
          </div>
          <div className="app-panel-body app-card-list">
            {savedReports.map((r) => (
              <div key={r.postcode} className="app-card" style={{ display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <button
                  type="button"
                  className="app-card app-card--clickable"
                  style={{ flex: 1, boxShadow: 'none', border: 'none', padding: 0 }}
                  onClick={() => {
                    setQuery(r.postcode);
                    setParams({ q: r.postcode });
                    setReport(r);
                  }}
                >
                  <div className="app-card-title">{r.postcode}</div>
                  <div className="app-card-meta">{r.areaName || r.subtitle || 'Area report'}{r.yieldPct ? ` · ${r.yieldPct} yield` : ''}</div>
                </button>
                <button
                  type="button"
                  className="app-btn app-btn--ghost"
                  style={{ padding: '6px 10px', fontSize: 12 }}
                  onClick={() => {
                    deleteAreaReport(r.postcode);
                    if (report?.postcode === r.postcode) {
                      setReport(null);
                      setParams({});
                    }
                  }}
                >
                  ✕
                </button>
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
      subtitle="Postcode and district reports from UK regional baselines — yields, growth, demand, and commentary."
      art={<IlluIntel className="app-illu app-illu--header" />}
      aside={aside}
    >
      <form className="app-search-block app-search-block--teal" onSubmit={onSearch} style={{ display: 'flex', gap: 12, alignItems: 'center', padding: 16 }}>
        <input
          type="text"
          className="app-search-input"
          style={{ minHeight: 'auto', flex: 1 }}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="e.g. S6, Manchester M1, LS6"
          disabled={analysing}
        />
        <button type="submit" className="app-btn app-btn--primary" disabled={analysing}>
          {analysing ? 'Loading…' : 'Search'}
        </button>
      </form>

      <div className="app-example-row" style={{ marginBottom: 20 }}>
        <span style={{ fontSize: 12, color: '#86868b' }}>Popular:</span>
        {POPULAR.map((pc) => (
          <button
            key={pc}
            type="button"
            className="app-example-chip"
            onClick={() => runSearch(pc)}
          >
            {pc}
          </button>
        ))}
      </div>

      {report && !analysing ? (
        <AreaReportView report={report} />
      ) : !analysing && (
        <AppEmpty
          art={<IlluIntel className="app-illu app-illu--empty" />}
          title="Search a postcode or district"
          description="Enter an outcode (S6), full postcode (M1 4BT), or city — Valora builds a market report from regional baselines."
        />
      )}
    </AppPage>
  );
}
