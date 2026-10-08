import { Link, useNavigate } from 'react-router';
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
import { greeting } from '../lib/utils';
import { useApi } from '../hooks/useApi';
import { gbp } from '../lib/api';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

export default function Dashboard() {
  const navigate = useNavigate();
  const { openAnalysisModal } = useApp();
  const { user } = useAuth();
  const { data, error, reload } = useApi('/api/dashboard');
  const counts = data?.counts || { saved: 0, briefs: 0, analyses: 0, newMatches7d: 0 };
  const recent = data?.recentAnalyses || [];
  const displayName = user?.firstName?.trim() || null;

  const subtitle =
    [
      counts.analyses ? `${counts.analyses} analyses` : null,
      counts.saved ? `${counts.saved} saved` : null,
      counts.briefs ? `${counts.briefs} briefs` : null,
    ]
      .filter(Boolean)
      .join(' · ') ||
    'Start by describing an investment goal in Discover, or analyse a property you already have in mind.';

  return (
    <AppPage
      eyebrow="Workspace"
      title={displayName ? `${greeting()}, ${displayName}` : greeting()}
      subtitle={subtitle}
      art={<IlluOverview className="app-illu app-illu--header" />}
      actions={
        <>
          <button type="button" className="app-btn app-btn--ghost" onClick={() => openAnalysisModal()}>
            Quick analyse
          </button>
          <Link viewTransition to="/analyse" className="app-btn app-btn--primary">
            Open Analyse
          </Link>
        </>
      }
    >
      <div className="app-pathway-grid">
        {PATHWAY_ACTIONS.map(({ key, title, desc, cta, to, Illu, tone }) => (
          <AppPathwayCard key={key} title={title} desc={desc} cta={cta} to={to} tone={tone} art={<Illu />} />
        ))}
      </div>

      {error && (
        <div className="notice-banner notice-banner--error">
          {error.message}{' '}
          <button type="button" className="app-btn app-btn--ghost" onClick={() => reload()}>
            Retry
          </button>
        </div>
      )}
      <div className="app-stat-grid">
        <AppStat accent="blue" label="Analyses" value={counts.analyses} hint="In your account" icon="⬡" />
        <AppStat accent="amber" label="Saved" value={counts.saved} hint="Saved properties" icon="▤" />
        <AppStat accent="teal" label="Briefs" value={counts.briefs} hint="Investment briefs" icon="◎" />
        <AppStat accent="green" label="New matches" value={counts.newMatches7d} hint="Last 7 days" icon="◆" />
      </div>

      {data?.alerts?.length > 0 && (
        <div className="app-panel" style={{ marginBottom: 16 }}>
          <div className="app-panel-head">
            <div className="app-panel-title">Recent alerts</div>
            <Link viewTransition to="/notifications" className="app-panel-link">
              All alerts
            </Link>
          </div>
          <div className="app-panel-body app-card-list">
            {data.alerts.map((a) => (
              <AppCard
                key={a.id}
                title={a.title}
                meta={`${a.body} · ${new Date(a.createdAt).toLocaleString('en-GB')}`}
                tone="green"
                onClick={a.link ? () => navigate(a.link) : undefined}
              />
            ))}
          </div>
        </div>
      )}

      <div className="app-dash-split">
        <div className="app-panel">
          <div className="app-panel-head">
            <div className="app-panel-title">Recent analyses</div>
            {recent.length > 0 && (
              <Link viewTransition to="/analyse" className="app-panel-link">
                View all
              </Link>
            )}
          </div>
          <div className="app-panel-body">
            {recent.length === 0 ? (
              <AppEmpty
                art={<IlluAnalyse className="app-illu app-illu--empty" />}
                title="No analyses yet"
                description="Analyse a property to see strategy-aware scores, evidence and financials."
                actionTo="/analyse"
                actionLabel="Start analysing"
              />
            ) : (
              <div className="app-card-list">
                {recent.slice(0, 5).map((r) => (
                  <AppCard
                    key={r.id}
                    title={r.address || 'Untitled property'}
                    meta={r.briefName || 'Default analysis'}
                    score={r.matchScore}
                    tone="blue"
                    onClick={() => navigate(`/analyse/${r.id}`, { viewTransition: true })}
                  />
                ))}
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
              {
                title: 'Compare deals',
                meta: 'Side-by-side metrics',
                to: '/compare',
                Illu: IlluCompare,
                tone: 'indigo',
              },
              {
                title: 'Area intelligence',
                meta: 'Postcode market reports',
                to: '/area-intel',
                Illu: IlluIntel,
                tone: 'teal',
              },
              {
                title: 'Discover briefs',
                meta: 'Match your criteria',
                to: '/discover',
                Illu: IlluDiscover,
                tone: 'green',
              },
              {
                title: 'Portfolio',
                meta: 'Track saved properties',
                to: '/portfolio',
                Illu: IlluPortfolio,
                tone: 'amber',
              },
            ].map(({ title, meta, to, Illu, tone }) => (
              <Link
                key={to}
                to={to}
                viewTransition
                className={`app-card app-card--clickable app-card--${tone}`}
                style={{ textDecoration: 'none' }}
              >
                <div className="app-card-head">
                  <div className="app-card-head-main">
                    <div className="app-card-icon app-card-icon--art">
                      <Illu className="app-illu app-illu--thumb" />
                    </div>
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

      {data?.briefs?.length > 0 && (
        <div className="app-panel" style={{ marginTop: 16 }}>
          <div className="app-panel-head">
            <div className="app-panel-title">Investment briefs</div>
            <Link viewTransition to="/discover" className="app-panel-link">
              Open Discover
            </Link>
          </div>
          <div className="app-panel-body app-card-list">
            {data.briefs.map((b) => (
              <AppCard
                key={b.id}
                title={b.name}
                meta={`${b.objective.replace(/_/g, ' ')} · ${b.status}`}
                tone="green"
                onClick={() => navigate(`/discover?brief=${b.id}`, { viewTransition: true })}
              />
            ))}
          </div>
        </div>
      )}

      {data?.portfolio && (
        <div className="app-panel" style={{ marginTop: 16 }}>
          <div className="app-panel-head">
            <div className="app-panel-title">Portfolio snapshot</div>
            <Link viewTransition to="/portfolio" className="app-panel-link">
              View portfolio
            </Link>
          </div>
          <div className="app-panel-body">
            <div className="app-stat-grid">
              <AppStat accent="blue" label="Properties" value={data.portfolio.assetCount} icon="▤" />
              <AppStat
                accent="teal"
                label="Recorded valuation"
                value={data.portfolio.totalValuation != null ? gbp(data.portfolio.totalValuation) : '—'}
                hint={data.portfolio.valuationCoverage}
                icon="◆"
              />
              <AppStat
                accent={data.portfolio.monthlyNetCashFlow >= 0 ? 'green' : 'amber'}
                label="Net cash flow / mo"
                value={gbp(data.portfolio.monthlyNetCashFlow)}
                hint="From your recorded figures"
                icon="£"
              />
            </div>
          </div>
        </div>
      )}
    </AppPage>
  );
}
