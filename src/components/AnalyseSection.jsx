import { useNavigate } from 'react-router-dom';
import { getRecent } from '../lib/utils';
import { useApp } from '../context/AppContext';

export default function AnalyseSection({ id = 'analyse', embedded = false }) {
  const navigate = useNavigate();
  const { runAnalysis } = useApp();
  const recent = getRecent();

  const onSubmit = (e) => {
    e.preventDefault();
    const url = e.target.url.value.trim();
    if (url) runAnalysis(url);
  };

  return (
    <section className={`analyse-section${embedded ? ' analyse-section--embedded' : ''}`} id={id || undefined}>
      <div className="analyse-section-inner">
        {!embedded && (
          <div className="analyse-section-head">
            <h2>Analyse a listing</h2>
            <p>Paste a Rightmove, Zoopla, or OnTheMarket URL to build an investment report.</p>
          </div>
        )}

        <form className="hero-analyse-form" onSubmit={onSubmit}>
          <div className="hero-analyse-input-wrap">
            <input
              name="url"
              type="url"
              placeholder="https://www.rightmove.co.uk/properties/…"
              required
              autoComplete="off"
            />
            <button type="submit" className="ac-button hero-analyse-btn">Analyse</button>
          </div>
          <p className="analyse-disclaimer">Live title and price when available · yields and scores are estimates.</p>
        </form>

        {recent.length > 0 && (
          <div className="analyse-recent-block">
            <div className="analyse-recent-title">Recent analyses</div>
            <div className="analyse-recent-grid">
              {recent.slice(0, 4).map((r) => (
                <button key={r.id} type="button" className="analyse-recent-card" onClick={() => navigate(`/analyse/${r.id}`)}>
                  <span className="arc-name">{r.name}</span>
                  <span className="arc-score">{r.score}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
