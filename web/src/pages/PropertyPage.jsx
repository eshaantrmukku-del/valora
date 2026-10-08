import { Link, useParams, useSearchParams } from 'react-router';
import AppPage, { AppCard, AppEmpty } from '../components/AppPage';
import { PROPERTY_TYPE_LABELS } from '../../../shared/brief';
import { FACT_SOURCE_LABELS } from '../../../shared/property';
import { useApi } from '../hooks/useApi';
import { useApp } from '../context/AppContext';
import { gbp } from '../lib/api';
import { providerLabel } from '../lib/adapters';

const FIELDS = [
  ['askingPrice', 'Asking price', gbp],
  ['propertyType', 'Type', (v) => PROPERTY_TYPE_LABELS[v] || v],
  ['bedrooms', 'Bedrooms'],
  ['bathrooms', 'Bathrooms'],
  ['floorAreaSqm', 'Floor area (m²)'],
  ['tenure', 'Tenure'],
  ['epcRating', 'EPC'],
  ['postcode', 'Postcode'],
  ['district', 'Local authority'],
];

export default function PropertyPage() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { analyseProperty, togglePortfolio, loading } = useApp();
  const { data, error } = useApi(`/api/properties/${id}`);
  if (error)
    return (
      <AppPage title="Property not found">
        <AppEmpty
          title="Not available"
          description={error.message}
          actionTo="/discover"
          actionLabel="Back to Discover"
        />
      </AppPage>
    );
  if (!data) return <AppPage title="Loading…" />;
  const { property: p, listings, analyses, saved } = data;
  const f = p.facts;
  return (
    <AppPage
      title={f.address || f.postcode || 'Property'}
      subtitle={p.isPrivate ? 'Your private record' : 'Listing data from a connected provider'}
      actions={
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="app-btn app-btn--primary"
            disabled={loading}
            onClick={() => analyseProperty(p.id, params.get('brief'))}
          >
            Analyse
          </button>
          <button
            type="button"
            className="app-btn app-btn--ghost"
            onClick={() => togglePortfolio(p.id, Boolean(saved), params.get('brief'))}
          >
            {saved ? 'Saved ✓' : 'Save'}
          </button>
          <Link className="app-btn app-btn--ghost" to={`/compare?add=${p.id}`}>
            Compare
          </Link>
        </div>
      }
    >
      <div className="app-panel">
        <div className="app-panel-head">
          <div className="app-panel-title">Facts and where they come from</div>
        </div>
        <div className="app-panel-body table-scroll">
          <table className="assumption-table">
            <tbody>
              {FIELDS.map(([k, label, fmt]) => (
                <tr key={k}>
                  <td>{label}</td>
                  <td>
                    {f[k] == null ? (
                      <span style={{ color: 'var(--muted)' }}>Unknown</span>
                    ) : fmt ? (
                      fmt(f[k])
                    ) : (
                      String(f[k])
                    )}
                  </td>
                  <td>
                    {p.factOrigins[k] ? (
                      <span className="prov-tag">
                        {FACT_SOURCE_LABELS[p.factOrigins[k].source]} · {p.factOrigins[k].label}
                      </span>
                    ) : (
                      ''
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {f.description && (
            <p style={{ fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 12 }}>
              <strong>Listing description (agent’s claim):</strong> {f.description.slice(0, 2000)}
            </p>
          )}
        </div>
      </div>
      {listings.length > 0 && (
        <div className="app-panel" style={{ marginTop: 16 }}>
          <div className="app-panel-head">
            <div className="app-panel-title">Listings</div>
          </div>
          <div className="app-panel-body app-card-list">
            {listings.map((l) => (
              <div key={l.id} className="app-card">
                <div className="app-card-title">
                  {providerLabel(l.provider)} · {gbp(l.askingPrice)} · {l.status}
                </div>
                <div className="app-card-meta">
                  First seen {new Date(l.firstSeenAt).toLocaleDateString('en-GB')} · last checked{' '}
                  {new Date(l.lastCheckedAt).toLocaleString('en-GB')}
                </div>
                {l.url && (
                  <a href={l.url} target="_blank" rel="noopener noreferrer">
                    Open original listing ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
      <div className="app-panel" style={{ marginTop: 16 }}>
        <div className="app-panel-head">
          <div className="app-panel-title">Your analyses</div>
        </div>
        <div className="app-panel-body app-card-list">
          {analyses.length === 0 ? (
            <p style={{ fontSize: 13 }}>Not analysed yet.</p>
          ) : (
            analyses.map((a) => (
              <Link key={a.id} to={`/analyse/${a.id}`} style={{ textDecoration: 'none' }}>
                <AppCard
                  title={a.briefName || 'Default analysis'}
                  meta={new Date(a.createdAt).toLocaleString('en-GB')}
                  score={a.matchScore}
                />
              </Link>
            ))
          )}
        </div>
      </div>
    </AppPage>
  );
}
