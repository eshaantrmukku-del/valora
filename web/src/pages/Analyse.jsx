import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import AppPage, { AppCard, AppEmpty, AppStat } from '../components/AppPage';
import { IlluAnalyse } from '../components/AppIllustrations';
import PropertyReport from '../components/PropertyReport';
import PropertyChat from '../components/PropertyChat';
import AssumptionsPanel from '../components/analyse/AssumptionsPanel';
import { useApi } from '../hooks/useApi';
import { useApp, getActiveBriefId, setActiveBriefId } from '../context/AppContext';
import { analysisToLegacy } from '../lib/adapters';
import { api, emitStoreChange, gbp } from '../lib/api';

function timeAgo(iso) {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function AnalysisDetail({ id }) {
  const navigate = useNavigate();
  const {
    togglePortfolio,
    shareReport,
    exportReportJson,
    removeAnalysis,
    analyseProperty,
    showToast,
    loading,
  } = useApp();
  const [poll, setPoll] = useState(null);
  const { data, error, loading: fetching, reload } = useApi(`/api/analyses/${id}`, { pollMs: poll });
  const analysis = data?.analysis;
  const pending = analysis?.narrativeStatus === 'pending';
  useEffect(() => setPoll(pending ? 3000 : null), [pending]);
  const propertyInfo = useApi(analysis ? `/api/properties/${analysis.propertyId}` : null);
  const briefs = useApi('/api/briefs');
  const [otherBrief, setOtherBrief] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const property = useMemo(() => (analysis ? analysisToLegacy(analysis) : null), [analysis]);

  if (fetching && !analysis) {
    return (
      <AppPage title="Loading analysis…">
        <div className="auth-loading">
          <div className="auth-loading-spinner" />
        </div>
      </AppPage>
    );
  }
  if (error || !property) {
    return (
      <AppPage
        title="Analysis not found"
        subtitle={error?.message || 'This report does not exist or belongs to another account.'}
      >
        <AppEmpty
          art={<IlluAnalyse className="app-illu app-illu--empty" />}
          title="Nothing here"
          description="Reports are private to the account that created them."
          actionTo="/analyse"
          actionLabel="Back to Analyse"
        />
      </AppPage>
    );
  }

  const saved = Boolean(propertyInfo.data?.saved);
  const otherAnalyses = (propertyInfo.data?.analyses || []).filter((a) => a.id !== analysis.id);

  const regenerate = async () => {
    try {
      await api(`/api/analyses/${id}/narrative`, { method: 'POST' });
      reload(true);
    } catch (err) {
      showToast('Could not regenerate', err.message);
    }
  };

  const recalc = async (inputs, provenance) => {
    try {
      await api(`/api/analyses/${id}/inputs`, { method: 'PUT', body: { inputs, provenance } });
      emitStoreChange();
      showToast('Recalculated', 'Figures updated from your assumptions.');
    } catch (err) {
      showToast(
        'Could not recalculate',
        err.details?.[0] ? `${err.message} ${err.details[0].path}: ${err.details[0].message}` : err.message,
      );
    }
  };

  const doDelete = async () => {
    if (await removeAnalysis(property.id)) navigate('/analyse', { viewTransition: true });
  };

  return (
    <AppPage
      title={property.name}
      subtitle={`${property.location} · ${property.strategy} · Match ${property.score}/100 · ${property.confidence}% of criteria assessable`}
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="app-btn app-btn--ghost"
            onClick={() => navigate('/analyse', { viewTransition: true })}
          >
            ← All analyses
          </button>
          <button
            type="button"
            className={`app-btn ${saved ? 'app-btn--primary' : 'app-btn--ghost'}`}
            onClick={() => togglePortfolio(property.propertyId, saved, analysis.briefId)}
          >
            {saved ? 'Saved ✓' : 'Save'}
          </button>
          <Link to={`/compare?add=${property.propertyId}`} viewTransition className="app-btn app-btn--ghost">
            Compare
          </Link>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => shareReport(property.id)}>
            Copy link
          </button>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => exportReportJson(property)}>
            Export
          </button>
          {confirmDelete ? (
            <>
              <button type="button" className="app-btn app-btn--primary" onClick={doDelete}>
                Confirm delete
              </button>
              <button
                type="button"
                className="app-btn app-btn--ghost"
                onClick={() => setConfirmDelete(false)}
              >
                Cancel
              </button>
            </>
          ) : (
            <button type="button" className="app-btn app-btn--ghost" onClick={() => setConfirmDelete(true)}>
              Delete
            </button>
          )}
        </div>
      }
    >
      {property.narrativeStatus === 'pending' && (
        <div className="notice-banner" role="status">
          Writing the AI summary from the analysed data… figures below are already final.
        </div>
      )}
      {property.narrativeStatus === 'not_configured' && (
        <div className="notice-banner">
          AI summary unavailable: no AI provider is configured. All figures, scores and evidence below are
          calculated without AI.
        </div>
      )}
      {property.narrativeStatus === 'failed' && (
        <div className="notice-banner notice-banner--error">
          AI summary failed: {property.narrativeError}.{' '}
          <button type="button" className="app-btn app-btn--ghost" onClick={regenerate}>
            Try again
          </button>
        </div>
      )}
      {property.narrativeStale && (
        <div className="notice-banner notice-banner--warn">
          Assumptions changed since the AI summary was written.{' '}
          <button type="button" className="app-btn app-btn--ghost" onClick={regenerate}>
            Regenerate summary
          </button>
        </div>
      )}
      {property.groundingWarnings.length > 0 && (
        <div className="notice-banner notice-banner--warn">
          <strong>Check these AI statements:</strong>
          <ul style={{ margin: '6px 0 0 18px' }}>
            {property.groundingWarnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {property.strategyKey === 'flip' ? (
        <div className="app-stat-grid" style={{ marginBottom: 16 }}>
          <AppStat
            accent="amber"
            label="Works est."
            value={property.flip ? gbp(property.flip.works) : '—'}
            hint={property.flip ? 'Planning assumption, not a quote' : 'Needs floor area or budget'}
            icon="▦"
          />
          <AppStat
            accent="blue"
            label="Resale (comps median)"
            value={property.flip ? gbp(property.flip.gdv) : '—'}
            hint="Assumption — Land Registry median"
            icon="◆"
          />
          <AppStat
            accent={property.flip?.uplift > 0 ? 'green' : 'amber'}
            label="Net profit (base)"
            value={property.flip ? gbp(property.flip.uplift) : '—'}
            hint={
              property.flip?.upliftPct != null
                ? `${property.flip.upliftPct}% on total cost`
                : 'Missing inputs'
            }
            icon="↑"
          />
        </div>
      ) : (
        <div className="app-stat-grid" style={{ marginBottom: 16 }}>
          <AppStat
            accent="blue"
            label="Mortgage / mo"
            value={property.deal?.monthlyMortgage != null ? gbp(property.deal.monthlyMortgage) : '—'}
            hint={
              property.deal
                ? `${property.deal.depositPct}% deposit @ ${property.deal.interestRate ?? '—'}%`
                : 'Price unknown'
            }
            icon="£"
          />
          <AppStat
            accent={property.deal?.monthlyCashFlow >= 0 ? 'green' : 'amber'}
            label="Cash flow / mo"
            value={property.deal?.monthlyCashFlow != null ? gbp(property.deal.monthlyCashFlow) : '—'}
            hint={property.rental ? 'After mortgage & operating costs' : 'No rental evidence'}
            icon="%"
          />
          <AppStat
            accent="teal"
            label={property.deal?.stampDutyLabel || 'Transaction tax'}
            value={property.deal?.stampDuty != null ? gbp(property.deal.stampDuty) : '—'}
            hint="Estimate — dated rules"
            icon="▤"
          />
        </div>
      )}

      <PropertyReport property={property} />

      <AssumptionsPanel analysis={analysis} property={property} onRecalculate={recalc} />

      <div className="app-panel" style={{ marginTop: 16 }}>
        <div className="app-panel-head">
          <div className="app-panel-title">Compare strategies for this property</div>
        </div>
        <div className="app-panel-body">
          <p style={{ fontSize: 13, color: 'var(--muted)', marginTop: 0 }}>
            The property’s facts stay the same; the brief changes the weighting and emphasis.
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <select
              className="app-search-input"
              style={{ minHeight: 'auto', maxWidth: 320 }}
              value={otherBrief}
              onChange={(e) => setOtherBrief(e.target.value)}
              aria-label="Brief to analyse with"
            >
              <option value="">Default (general screening)</option>
              {(briefs.data?.briefs || []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              className="app-btn app-btn--primary"
              disabled={loading}
              onClick={() => analyseProperty(property.propertyId, otherBrief || null)}
            >
              Analyse with this strategy
            </button>
          </div>
          {otherAnalyses.length > 0 && (
            <div className="app-card-list" style={{ marginTop: 12 }}>
              {otherAnalyses.map((a) => (
                <AppCard
                  key={a.id}
                  title={a.briefName || 'Default analysis'}
                  meta={`${a.objective.replace(/_/g, ' ')} · ${timeAgo(a.createdAt)}`}
                  score={a.matchScore}
                  onClick={() => navigate(`/analyse/${a.id}`, { viewTransition: true })}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      <PropertyChat property={property} />
    </AppPage>
  );
}

function AnalyseHome() {
  const navigate = useNavigate();
  const { runAnalysis, openAnalysisModal, loading } = useApp();
  const [url, setUrl] = useState('');
  const [briefId, setBriefId] = useState(() => getActiveBriefId());
  const analyses = useApi('/api/analyses');
  const briefs = useApi('/api/briefs');
  const prefs = useApi('/api/preferences');
  const list = analyses.data?.analyses || [];
  const p = prefs.data?.preferences;

  const submit = (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || loading) return;
    runAnalysis(trimmed);
    setUrl('');
  };

  const aside = (
    <div className="app-stat-grid" style={{ gridTemplateColumns: '1fr' }}>
      <AppStat accent="blue" label="Analyses" value={list.length} hint="In your account" icon="⬡" />
      <AppStat accent="indigo" label="Briefs" value={briefs.data?.briefs?.length ?? 0} icon="◎" />
      <AppStat
        accent="teal"
        label="Target yield"
        value={p?.targetGrossYieldPct != null ? `${p.targetGrossYieldPct}%` : 'Not set'}
        hint={p?.budgetMax ? `Budget ${gbp(p.budgetMax)}` : 'Set in Settings'}
        icon="%"
      />
    </div>
  );

  return (
    <AppPage
      eyebrow="Property analysis"
      title="Analyse"
      subtitle="Analyse any property against your strategy: from a provider listing link, pasted listing text, a brochure, or your own figures."
      art={<IlluAnalyse className="app-illu app-illu--header" />}
      aside={aside}
      actions={
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/compare" viewTransition className="app-btn app-btn--ghost">
            Compare
          </Link>
          <Link to="/tools" viewTransition className="app-btn app-btn--ghost">
            Tools
          </Link>
        </div>
      }
    >
      <form className="app-search-block app-search-block--accent" onSubmit={submit}>
        <label className="app-search-label" htmlFor="analyse-url">
          Listing URL
        </label>
        <div className="app-search-row">
          <input
            id="analyse-url"
            className="app-search-input"
            style={{ minHeight: 'auto' }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://… (listing from a connected provider)"
            disabled={loading}
          />
          <button type="submit" className="app-btn app-btn--primary" disabled={!url.trim() || loading}>
            {loading ? 'Analysing…' : 'Analyse'}
          </button>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 10 }}>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => openAnalysisModal('text')}>
            Paste listing text
          </button>
          <button
            type="button"
            className="app-btn app-btn--ghost"
            onClick={() => openAnalysisModal('upload')}
          >
            Upload brochure
          </button>
          <button
            type="button"
            className="app-btn app-btn--ghost"
            onClick={() => openAnalysisModal('manual')}
          >
            Enter details manually
          </button>
        </div>
        <label className="app-search-label" htmlFor="analyse-brief" style={{ marginTop: 14 }}>
          Analyse using
        </label>
        <select
          id="analyse-brief"
          className="app-search-input"
          style={{ minHeight: 'auto', width: '100%' }}
          value={briefId}
          onChange={(e) => {
            setBriefId(e.target.value);
            setActiveBriefId(e.target.value || null);
          }}
        >
          <option value="">Default analysis (general screening)</option>
          {(briefs.data?.briefs || []).map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--v-muted)' }}>
          Choose an Investment Brief to adapt the report — renovation briefs emphasise works and uplift;
          rental briefs emphasise yield and cash flow.
        </p>
      </form>

      <div className="app-panel">
        <div className="app-panel-head">
          <div className="app-panel-title">Recent analyses</div>
        </div>
        <div className="app-panel-body">
          {analyses.error && (
            <div className="notice-banner notice-banner--error">
              {analyses.error.message}{' '}
              <button type="button" className="app-btn app-btn--ghost" onClick={() => analyses.reload()}>
                Retry
              </button>
            </div>
          )}
          {analyses.loading && !list.length ? (
            <p style={{ color: 'var(--muted)' }}>Loading…</p>
          ) : list.length === 0 ? (
            <AppEmpty
              art={<IlluAnalyse className="app-illu app-illu--empty" />}
              title="No analyses yet"
              description="Analyse a property above, or open one from Discover."
            />
          ) : (
            <div className="app-card-list">
              {list.map((r) => (
                <AppCard
                  key={r.id}
                  title={r.address || r.postcode || 'Untitled property'}
                  meta={`${r.briefName || 'Default'} · ${timeAgo(r.createdAt)}`}
                  score={r.matchScore}
                  onClick={() => navigate(`/analyse/${r.id}`, { viewTransition: true })}
                >
                  {r.askingPrice != null && <span className="app-chip">{gbp(r.askingPrice)}</span>}
                  <span className="app-chip">{r.confidence}% assessable</span>
                  {r.narrativeStatus === 'generated' && <span className="app-chip">AI summary</span>}
                </AppCard>
              ))}
            </div>
          )}
        </div>
      </div>
    </AppPage>
  );
}

export default function Analyse() {
  const { id } = useParams();
  return id ? <AnalysisDetail key={id} id={id} /> : <AnalyseHome />;
}
