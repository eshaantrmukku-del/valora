import { Link, useNavigate } from 'react-router-dom';
import AppPage, { AppCard, AppEmpty, AppStat, AppPathwayCard } from '../components/AppPage';
import {
  IlluAnalyse,
  IlluCompare,
  IlluDiscover,
  IlluIntel,
  IlluOverview,
  IlluPortfolio,
  PATHWAY_ACTIONS,
} from '../components/AppIllustrations';
import { getProperty } from '../data/properties';
import { getPortfolioIds, getProfile, getRecent } from '../lib/storage';
import { getProjects } from '../lib/projects';
import { greeting } from '../lib/utils';
import { useStore } from '../hooks/useStore';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  useStore();
  const navigate = useNavigate();
  const { openAnalysisModal } = useApp();
  const { user } = useAuth();
  const recent = getRecent();
  const portfolio = getPortfolioIds();
  const projects = getProjects();

  const profile = getProfile();
  const displayName = profile.firstName?.trim() || user?.firstName?.trim() || null;

  const subtitle = [
    recent.length ? `${recent.length} analyses` : null,
    portfolio.length ? `${portfolio.length} saved` : null,
    projects.length ? `${projects.length} projects` : null,
  ].filter(Boolean).join(' · ') || 'Pick a path below — same colourful workspace as the rest of Valora.';

  return (
    <AppPage
      eyebrow="Workspace"
      title={displayName ? `${greeting()}, ${displayName}` : greeting()}
      subtitle={subtitle}
      art={<IlluOverview className="app-illu app-illu--header" />}
      actions={(
        <>
          <button type="button" className="app-btn app-btn--ghost" onClick={openAnalysisModal}>Quick analyse</button>
          <Link viewTransition to="/analyse" className="app-btn app-btn--primary">Open Analyse</Link>
        </>
      )}
    >
      <div className="app-pathway-grid">
        {PATHWAY_ACTIONS.map(({ key, title, desc, cta, to, Illu, tone }) => (
          <AppPathwayCard
            key={key}
            title={title}
            desc={desc}
            cta={cta}
            to={to}
            tone={tone}
            art={<Illu />}
          />
        ))}
      </div>

      <div className="app-stat-grid">
        <AppStat accent="blue" label="Analyses" value={recent.length} hint="In this browser" icon="⬡" />
        <AppStat accent="amber" label="Portfolio" value={portfolio.length} hint="Saved properties" icon="▤" />
        <AppStat accent="teal" label="Projects" value={projects.length} hint="Organised folders" icon="◎" />
      </div>

      <div className="app-dash-split">
        <div className="app-panel">
          <div className="app-panel-head">
            <div className="app-panel-title">Recent analyses</div>
            {recent.length > 0 && (
              <Link viewTransition to="/analyse" className="app-panel-link">View all</Link>
            )}
          </div>
          <div className="app-panel-body">
            {recent.length === 0 ? (
              <AppEmpty
                art={<IlluAnalyse className="app-illu app-illu--empty" />}
                title="No analyses yet"
                description="Paste a property URL to generate your first colourful report."
                actionTo="/analyse"
                actionLabel="Start analysing"
              />
            ) : (
              <div className="app-card-list">
                {recent.slice(0, 5).map((r) => {
                  const p = getProperty(r.id);
                  return (
                    <AppCard
                      key={r.id}
                      title={r.name}
                      meta={p?.location || r.location || '—'}
                      score={r.score}
                      tone="blue"
                      onClick={() => navigate(`/analyse/${r.id}`, { viewTransition: true })}
                    />
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="app-panel">
          <div className="app-panel-head">
            <div className="app-panel-title">More tools</div>
          </div>
          <div className="app-panel-body app-card-list">
            {[
              { title: 'Compare deals', meta: 'Side-by-side metrics', to: '/compare', Illu: IlluCompare, tone: 'indigo' },
              { title: 'Area intelligence', meta: 'Postcode market reports', to: '/area-intel', Illu: IlluIntel, tone: 'teal' },
              { title: 'Discover briefs', meta: 'Match your criteria', to: '/discover', Illu: IlluDiscover, tone: 'green' },
              { title: 'Portfolio', meta: 'Track saved properties', to: '/portfolio', Illu: IlluPortfolio, tone: 'amber' },
            ].map(({ title, meta, to, Illu, tone }) => (
              <Link key={to} to={to} viewTransition className={`app-card app-card--clickable app-card--${tone}`} style={{ textDecoration: 'none' }}>
                <div className="app-card-head">
                  <div className="app-card-head-main">
                    <div className="app-card-icon app-card-icon--art"><Illu className="app-illu app-illu--thumb" /></div>
                    <div>
                      <div className="app-card-title">{title}</div>
                      <div className="app-card-meta">{meta}</div>
                    </div>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      </div>

      {portfolio.length > 0 && (
        <div className="app-panel" style={{ marginTop: 16 }}>
          <div className="app-panel-head">
            <div className="app-panel-title">Portfolio snapshot</div>
            <Link viewTransition to="/portfolio" className="app-panel-link">View portfolio</Link>
          </div>
          <div className="app-panel-body app-card-list">
            {portfolio.slice(0, 4).map(({ id }) => {
              const p = getProperty(id);
              if (!p) return null;
              return (
                <AppCard
                  key={id}
                  title={p.name}
                  meta={`${p.location} · ${p.rental?.grossYield} yield`}
                  score={p.score}
                  tone="amber"
                  onClick={() => navigate(`/analyse/${id}`, { viewTransition: true })}
                />
              );
            })}
          </div>
        </div>
      )}
    </AppPage>
  );
}
