import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import AppPage, { AppCard, AppEmpty, AppStat } from '../components/AppPage';
import { IlluAnalyse } from '../components/AppIllustrations';
import PropertyReport from '../components/PropertyReport';
import PropertyChat from '../components/PropertyChat';
import { getProperty, saveCustom } from '../data/properties';
import { getRecent, getBriefs, getActiveBriefId, setActiveBriefId } from '../lib/storage';
import {
  createProject,
  GENERAL_PROJECT_ID,
  getProjects,
} from '../lib/projects';
import { getInvestorPrefs } from '../lib/investor';
import { useStore } from '../hooks/useStore';
import { useApp } from '../context/AppContext';
import { parseIntent } from '../lib/discover/parseIntent';
import { nameInvestmentBrief } from '../lib/discover/investmentBrief';

function timeAgo(ts) {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

export default function Analyse() {
  useStore();
  const { id } = useParams();
  const navigate = useNavigate();
  const prefs = getInvestorPrefs();
  const {
    runAnalysis,
    isInPortfolio,
    togglePortfolio,
    shareReport,
    exportReportJson,
    removeAnalysis,
    portfolioVersion,
    loading,
  } = useApp();

  const [url, setUrl] = useState('');
  const [projectId, setProjectId] = useState(GENERAL_PROJECT_ID);
  const [newProjectName, setNewProjectName] = useState('');
  const [showNewProject, setShowNewProject] = useState(false);
  const [briefs] = useState(() => getBriefs());
  const [briefId, setBriefId] = useState(() => getActiveBriefId() || '');

  void portfolioVersion;
  const projects = getProjects();
  const recent = getRecent();
  const storedProperty = id ? getProperty(id) : null;
  const [sharedProperty, setSharedProperty] = useState(null);
  const property = storedProperty || sharedProperty;
  const saved = property ? isInPortfolio(property.id) : false;

  useEffect(() => {
    if (!id || storedProperty) {
      setSharedProperty(null);
      return;
    }
    const hash = window.location.hash || '';
    const m = hash.match(/share=([^&]+)/);
    if (!m) return;
    try {
      const json = decodeURIComponent(escape(atob(m[1])));
      const parsed = JSON.parse(json);
      if (parsed?.id) {
        saveCustom(parsed);
        setSharedProperty(parsed);
      }
    } catch {
      /* ignore bad share payload */
    }
  }, [id, storedProperty]);

  const filteredRecent = useMemo(
    () => recent.filter((r) => (r.projectId || GENERAL_PROJECT_ID) === projectId),
    [recent, projectId],
  );

  const submit = (e) => {
    e.preventDefault();
    const trimmed = url.trim();
    if (!trimmed || loading) return;
    runAnalysis(trimmed, projectId);
    setUrl('');
  };

  const createProj = (e) => {
    e.preventDefault();
    const p = createProject(newProjectName);
    if (p) {
      setProjectId(p.id);
      setNewProjectName('');
      setShowNewProject(false);
    }
  };

  const handleDelete = () => {
    if (!property) return;
    if (!window.confirm('Delete this analysis?')) return;
    removeAnalysis(property.id);
    navigate('/analyse', { viewTransition: true });
  };

  if (property) {
    return (
      <AppPage
        title={property.name}
        subtitle={`${property.location} · Score ${property.score} · ${property.rental?.grossYield} yield`}
        actions={(
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="app-btn app-btn--ghost" onClick={() => navigate('/analyse', { viewTransition: true })}>
              ← All analyses
            </button>
            <button type="button" className={`app-btn ${saved ? 'app-btn--primary' : 'app-btn--ghost'}`} onClick={() => togglePortfolio(property.id)}>
              {saved ? 'Saved' : 'Save'}
            </button>
            <Link to="/compare" viewTransition className="app-btn app-btn--ghost">Compare</Link>
            <button type="button" className="app-btn app-btn--ghost" onClick={() => shareReport(property.id)}>Share</button>
            <button type="button" className="app-btn app-btn--ghost" onClick={() => exportReportJson(property)}>Export</button>
            <button type="button" className="app-btn app-btn--ghost" onClick={handleDelete}>Delete</button>
          </div>
        )}
      >
        {property.aiInsight && (
          <div className="app-panel" style={{ marginBottom: 16 }}>
            <div className="app-panel-body">
              <p style={{ marginBottom: 10 }}>{property.aiInsight.opening}</p>
              <p style={{ marginBottom: 10 }}>{property.aiInsight.yieldLine}</p>
              <p style={{ marginBottom: 10 }}>{property.aiInsight.strategyLine}</p>
              {property.aiInsight.valueLine && <p style={{ marginBottom: 10 }}>{property.aiInsight.valueLine}</p>}
              {property.aiInsight.conditionLine && <p style={{ marginBottom: 10 }}>{property.aiInsight.conditionLine}</p>}
              {property.aiInsight.prefsLine && <p>{property.aiInsight.prefsLine}</p>}
            </div>
          </div>
        )}
        {property.strategyKey === 'flip' && property.flip ? (
          <div className="app-stat-grid" style={{ marginBottom: 16 }}>
            <AppStat
              accent="amber"
              label="Works est."
              value={`£${property.flip.works.toLocaleString()}`}
              hint={property.condition?.overall ? `${property.condition.overall} condition` : 'Rule-based'}
              icon="▦"
            />
            <AppStat
              accent="blue"
              label="GDV (sold median)"
              value={property.flip.gdv ? `£${Math.round(property.flip.gdv / 1000)}k` : '—'}
              hint="Land Registry comps"
              icon="◆"
            />
            <AppStat
              accent={property.flip.uplift != null && property.flip.uplift > 0 ? 'green' : 'amber'}
              label="Uplift vs GDV"
              value={property.flip.uplift != null ? `£${property.flip.uplift.toLocaleString()}` : '—'}
              hint={property.flip.upliftPct != null ? `${property.flip.upliftPct}% on all-in cost` : 'After works'}
              icon="↑"
            />
          </div>
        ) : property.finance && (
          <div className="app-stat-grid" style={{ marginBottom: 16 }}>
            <AppStat accent="blue" label="Mortgage / mo" value={`£${Math.round(property.finance.monthlyPayment).toLocaleString()}`} hint={`${property.finance.depositPct}% deposit @ ${property.finance.interestRate}%`} icon="£" />
            <AppStat accent="teal" label="Loan" value={`£${Math.round(property.finance.loan / 1000)}k`} hint={`Deposit £${property.finance.deposit.toLocaleString()}`} icon="▤" />
            <AppStat
              accent={property.investorFit?.meetsYield ? 'green' : 'amber'}
              label="Vs your target"
              value={property.investorFit?.meetsYield ? 'On target' : 'Below'}
              hint={`${property.rental?.grossYield} vs ${property.investorFit?.targetYield}%`}
              icon="%"
            />
          </div>
        )}
        <PropertyReport property={property} />
        <PropertyChat property={property} />

        <form className="app-search-block" onSubmit={submit} style={{ marginTop: 20 }}>
          <label className="app-search-label" htmlFor="analyse-more">Analyse another listing</label>
          <div className="app-search-row">
            <input
              id="analyse-more"
              className="app-search-input"
              style={{ minHeight: 'auto' }}
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Paste another Rightmove, Zoopla, or OTM URL…"
              disabled={loading}
            />
            <button type="submit" className="app-btn app-btn--primary" disabled={!url.trim() || loading}>
              Analyse
            </button>
          </div>
        </form>
      </AppPage>
    );
  }

  if (id && !property) {
    return (
      <AppPage title="Analysis not found" subtitle="This report isn’t in this browser — paste a share link with embedded data, or analyse the listing again.">
        <AppEmpty
          art={<IlluAnalyse className="app-illu app-illu--empty" />}
          title="Nothing here"
          description="Analyses are stored locally unless opened from a share link."
          actionTo="/analyse"
          actionLabel="Back to Analyse"
        />
      </AppPage>
    );
  }

  const aside = (
    <>
      <div className="app-stat-grid" style={{ gridTemplateColumns: '1fr' }}>
        <AppStat accent="blue" label="Analyses" value={recent.length} hint="In this browser" icon="⬡" />
        <AppStat accent="indigo" label="Projects" value={projects.length} icon="◎" />
        <AppStat accent="teal" label="Target yield" value={`${prefs.targetYield}%`} hint={`Budget £${Number(prefs.maxBudget).toLocaleString()}`} icon="%" />
      </div>

      <div className="app-panel">
        <div className="app-panel-head">
          <div className="app-panel-title">Projects</div>
        </div>
        <div className="app-panel-body" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`app-card app-card--clickable${projectId === p.id ? ' app-card--active' : ''}`}
              onClick={() => setProjectId(p.id)}
            >
              <div className="app-card-title" style={{ fontSize: 13 }}>{p.emoji} {p.name}</div>
              <div className="app-card-meta">
                {recent.filter((r) => (r.projectId || GENERAL_PROJECT_ID) === p.id).length} analyses
              </div>
            </button>
          ))}
          {showNewProject ? (
            <form onSubmit={createProj} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <input
                value={newProjectName}
                onChange={(e) => setNewProjectName(e.target.value)}
                placeholder="Project name"
                className="app-search-input"
                style={{ minHeight: 'auto' }}
                autoFocus
              />
              <div style={{ display: 'flex', gap: 8 }}>
                <button type="submit" className="app-btn app-btn--primary">Create</button>
                <button type="button" className="app-btn app-btn--ghost" onClick={() => setShowNewProject(false)}>Cancel</button>
              </div>
            </form>
          ) : (
            <button type="button" className="app-btn app-btn--ghost" onClick={() => setShowNewProject(true)}>
              + New project
            </button>
          )}
        </div>
      </div>
    </>
  );

  return (
    <AppPage
      eyebrow="Live listings"
      title="Analyse"
      subtitle="Paste a listing URL for yields, strategy, and an investment score — same workspace as the rest of Valora."
      art={<IlluAnalyse className="app-illu app-illu--header" />}
      aside={aside}
      actions={(
        <div style={{ display: 'flex', gap: 8 }}>
          <Link to="/compare" viewTransition className="app-btn app-btn--ghost">Compare</Link>
          <Link to="/tools" viewTransition className="app-btn app-btn--ghost">Tools</Link>
        </div>
      )}
    >
      <form className="app-search-block app-search-block--accent" onSubmit={submit}>
        <label className="app-search-label" htmlFor="analyse-url">Listing URL</label>
        <div className="app-search-row">
          <input
            id="analyse-url"
            className="app-search-input"
            style={{ minHeight: 'auto' }}
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            placeholder="https://www.rightmove.co.uk/properties/…"
            disabled={loading}
          />
          <button type="submit" className="app-btn app-btn--primary" disabled={!url.trim() || loading}>
            {loading ? 'Analysing…' : 'Analyse'}
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
          <option value="">Default analysis</option>
          {briefs.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name || nameInvestmentBrief(b.filters || parseIntent(b.query), b.query)}
            </option>
          ))}
        </select>
        <p style={{ marginTop: 10, fontSize: 12, color: 'var(--v-muted)' }}>
          Choose an Investment Brief to adapt the report — renovation briefs emphasise works and uplift; rental briefs emphasise yield and cash flow.
        </p>
      </form>

      <div className="app-panel">
        <div className="app-panel-head">
          <div className="app-panel-title">
            Recent{projectId !== GENERAL_PROJECT_ID ? ` · ${projects.find((p) => p.id === projectId)?.name || 'Project'}` : ''}
          </div>
        </div>
        <div className="app-panel-body">
          {filteredRecent.length === 0 ? (
            <AppEmpty
              art={<IlluAnalyse className="app-illu app-illu--empty" />}
              title="No analyses in this project yet"
              description="Paste a listing URL above. New reports land here and in your selected project."
            />
          ) : (
            <div className="app-card-list">
              {filteredRecent.map((r) => {
                const p = getProperty(r.id);
                return (
                  <AppCard
                    key={r.id}
                    title={r.name || 'Untitled analysis'}
                    meta={`${p?.location || r.location || '—'} · ${r.time ? timeAgo(r.time) : ''}`}
                    score={p?.score ?? r.score}
                    onClick={() => navigate(`/analyse/${r.id}`, { viewTransition: true })}
                  >
                    {p?.rental?.grossYield && <span className="app-chip">{p.rental.grossYield} yield</span>}
                    {p?.strategy && <span className="app-chip">{p.strategy}</span>}
                    {p?.price != null && <span className="app-chip">£{p.price.toLocaleString()}</span>}
                  </AppCard>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </AppPage>
  );
}
