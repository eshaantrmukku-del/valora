import { Link, useNavigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';
import { useAuth } from '../context/AuthContext';

function IlluAnalyse() {
  return (
    <svg className="vx-path-art" viewBox="0 0 280 180" aria-hidden="true">
      <ellipse cx="140" cy="158" rx="90" ry="10" fill="#dbeafe" />
      <rect x="48" y="78" width="72" height="70" rx="8" fill="#93c5fd" />
      <rect x="58" y="90" width="20" height="18" rx="3" fill="#fff" />
      <rect x="86" y="90" width="20" height="18" rx="3" fill="#fff" />
      <rect x="58" y="116" width="20" height="18" rx="3" fill="#fff" />
      <rect x="86" y="116" width="20" height="18" rx="3" fill="#fff" />
      <path d="M48 78h72l-10-22H58z" fill="#1d4ed8" />
      <rect x="150" y="54" width="88" height="100" rx="14" fill="#0f172a" />
      <rect x="160" y="68" width="68" height="44" rx="8" fill="#38bdf8" />
      <rect x="166" y="122" width="28" height="8" rx="4" fill="#34d399" />
      <rect x="200" y="122" width="20" height="8" rx="4" fill="#fbbf24" />
      <circle cx="210" cy="40" r="18" fill="#fcd34d" />
      <path d="M70 150c12-28 28-40 44-40s28 18 40 40" fill="#fb923c" />
      <circle cx="92" cy="98" r="14" fill="#fdba74" />
      <circle cx="132" cy="96" r="14" fill="#fda4af" />
      <rect x="78" y="112" width="28" height="36" rx="10" fill="#2563eb" />
      <rect x="118" y="110" width="28" height="38" rx="10" fill="#0d9488" />
    </svg>
  );
}

function IlluDiscover() {
  return (
    <svg className="vx-path-art" viewBox="0 0 280 180" aria-hidden="true">
      <ellipse cx="140" cy="158" rx="95" ry="10" fill="#dcfce7" />
      <rect x="168" y="48" width="56" height="100" rx="6" fill="#60a5fa" />
      <rect x="176" y="60" width="14" height="14" rx="2" fill="#fff" opacity="0.9" />
      <rect x="198" y="60" width="14" height="14" rx="2" fill="#fff" opacity="0.9" />
      <rect x="176" y="84" width="14" height="14" rx="2" fill="#fff" opacity="0.9" />
      <rect x="198" y="84" width="14" height="14" rx="2" fill="#fff" opacity="0.9" />
      <rect x="176" y="108" width="14" height="14" rx="2" fill="#fff" opacity="0.9" />
      <rect x="198" y="108" width="14" height="14" rx="2" fill="#fff" opacity="0.9" />
      <rect x="92" y="70" width="70" height="78" rx="8" fill="#fb7185" />
      <rect x="104" y="88" width="18" height="22" rx="3" fill="#fff7ed" />
      <rect x="132" y="88" width="18" height="22" rx="3" fill="#fff7ed" />
      <rect x="118" y="120" width="20" height="28" rx="3" fill="#7c2d12" />
      <path d="M92 70h70l-12-24H104z" fill="#be123c" />
      <circle cx="72" cy="120" r="22" fill="#22c55e" />
      <circle cx="58" cy="132" r="16" fill="#16a34a" />
      <circle cx="248" cy="120" r="18" fill="#4ade80" />
      <rect x="40" y="40" width="36" height="50" rx="4" fill="#38bdf8" />
      <rect x="46" y="48" width="10" height="10" rx="2" fill="#e0f2fe" />
      <rect x="60" y="48" width="10" height="10" rx="2" fill="#e0f2fe" />
      <rect x="46" y="64" width="10" height="10" rx="2" fill="#e0f2fe" />
      <rect x="60" y="64" width="10" height="10" rx="2" fill="#e0f2fe" />
    </svg>
  );
}

function IlluInvest() {
  return (
    <svg className="vx-path-art" viewBox="0 0 280 180" aria-hidden="true">
      <ellipse cx="140" cy="158" rx="90" ry="10" fill="#ffedd5" />
      <rect x="168" y="96" width="70" height="50" rx="6" fill="#93c5fd" />
      <path d="M168 96h70l-12-20H180z" fill="#1d4ed8" />
      <rect x="180" y="108" width="14" height="14" rx="2" fill="#fff" />
      <rect x="204" y="108" width="14" height="14" rx="2" fill="#fff" />
      <circle cx="70" cy="120" r="26" fill="#86efac" />
      <circle cx="95" cy="128" r="18" fill="#4ade80" />
      <path d="M118 146V70h12v76z" fill="#92400e" />
      <path d="M118 70h12l28 18v12l-28-16-12-2z" fill="#92400e" />
      <rect x="88" y="72" width="72" height="44" rx="8" fill="#2563eb" />
      <path d="M112 94l12-8 12 8v18H112z" fill="#fff" />
      <circle cx="124" cy="98" r="5" fill="#fb7185" />
      <path d="M40 146h200" stroke="#fdba74" strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

const PATHWAYS = [
  {
    title: 'Analyse a listing',
    desc: 'Paste a Rightmove, Zoopla, or OnTheMarket URL and get yields, rent estimates, and an investment score in seconds.',
    cta: 'Start analysing',
    to: '/analyse',
    art: <IlluAnalyse />,
  },
  {
    title: 'Discover deals',
    desc: 'Describe your brief in plain English — Valora matches it against properties you’ve already analysed.',
    cta: 'Find matches',
    to: '/discover',
    art: <IlluDiscover />,
  },
  {
    title: 'Build a portfolio',
    desc: 'Save the best opportunities, track status from watching to owned, and compare deals side by side.',
    cta: 'See your options',
    to: '/portfolio',
    art: <IlluInvest />,
  },
];

const FEATURES = [
  { title: 'Instant analysis', desc: 'Results in seconds.', tone: 'blue' },
  { title: 'UK market data', desc: 'Regional benchmarks.', tone: 'teal' },
  { title: 'Investment score', desc: 'AI-powered scoring.', tone: 'amber' },
  { title: 'Private workspace', desc: 'Sign in to unlock.', tone: 'rose' },
];

const CHECKS = [
  'Gross & Net Yield',
  'Rental Income Estimate',
  'Investment Score',
  'Market Comparison',
  'Risk Assessment',
];

export default function Landing() {
  const { runAnalysis } = useApp();
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();

  const gate = (to) => (isAuthenticated ? to : '/login');
  const gateState = (to) => (isAuthenticated ? undefined : { from: to });

  const onHeroSubmit = (e) => {
    e.preventDefault();
    const url = e.target.url.value.trim();
    if (!url) return;
    if (!isAuthenticated) {
      sessionStorage.setItem('valora_pending_url', url);
      navigate('/login', { state: { from: '/analyse' }, viewTransition: true });
      return;
    }
    runAnalysis(url);
  };

  return (
    <div className="vx">
      <div className="vx-bg" aria-hidden="true" />

      <section className="vx-hero">
        <div className="vx-badge">
          <span className="vx-badge-spark" aria-hidden="true">✦</span>
          AI-powered property analytics
        </div>

        <h1 className="vx-title">
          Find value <em>before</em> the market does.
        </h1>

        <p className="vx-sub">
          Paste a UK listing URL. Get yields, rental estimates,
          <br />
          and an investment score in seconds.
        </p>

        <form className="vx-form" onSubmit={onHeroSubmit}>
          <span className="vx-form-icon" aria-hidden="true">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M10 14a4 4 0 0 0 5.66 0l2.83-2.83a4 4 0 0 0-5.66-5.66L11.5 6.83" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              <path d="M14 10a4 4 0 0 0-5.66 0L5.5 12.83a4 4 0 1 0 5.66 5.66L12.5 17.17" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </span>
          <input
            name="url"
            type="url"
            className="vx-input"
            placeholder="https://www.rightmove.co.uk/properties/…"
            required
            autoComplete="off"
          />
          <button type="submit" className="vx-analyse-btn">
            Analyse property
            <span aria-hidden="true">→</span>
          </button>
        </form>

        <p className="vx-trust">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M12 3 5 6v5c0 5 3 8.5 7 10 4-1.5 7-5 7-10V6l-7-3Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
          </svg>
          Sign in required for full workspace access
        </p>
      </section>

      <section className="vx-pathways">
        <div className="vx-pathways-grid">
          {PATHWAYS.map((p) => (
            <article key={p.title} className="vx-path-card">
              <div className="vx-path-illu">{p.art}</div>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
              <Link
                to={gate(p.to)}
                state={gateState(p.to)}
                viewTransition
                className="vx-path-btn"
              >
                {p.cta}
              </Link>
            </article>
          ))}
        </div>
      </section>

      <section className="vx-features">
        {FEATURES.map((f) => (
          <div key={f.title} className={`vx-feature vx-feature--${f.tone}`}>
            <div className="vx-feature-icon" aria-hidden="true" />
            <div>
              <h3>{f.title}</h3>
              <p>{f.desc}</p>
            </div>
          </div>
        ))}
      </section>

      <section className="vx-preview" id="insights">
        <div className="vx-preview-panel">
          <div className="vx-preview-copy">
            <div className="vx-preview-tag">
              <span className="vx-dot" aria-hidden="true" />
              Analysis preview
            </div>
            <h2>Investment insights that matter.</h2>
            <p>
              Every report surfaces the numbers investors actually use — yields, rent, score, and risk — without the spreadsheet grind.
            </p>
            <ul className="vx-checks">
              {CHECKS.map((c) => (
                <li key={c}>
                  <span className="vx-check" aria-hidden="true">✓</span>
                  {c}
                </li>
              ))}
            </ul>
          </div>

          <article className="vx-card">
            <div className="vx-card-media">
              <img
                src="https://images.unsplash.com/photo-1564013799919-ab600027ffc6?auto=format&fit=crop&w=1200&q=80"
                alt="UK terraced houses"
              />
              <div className="vx-card-loc">Manchester, M14</div>
              <button type="button" className="vx-card-heart" aria-label="Save">
                ♡
              </button>
            </div>

            <div className="vx-card-metrics">
              <div>
                <div className="vx-metric-label">Gross Yield</div>
                <div className="vx-metric-value vx-metric-value--good">7.2%</div>
                <div className="vx-metric-sub vx-metric-sub--good">Excellent</div>
              </div>
              <div>
                <div className="vx-metric-label">Est. Rent (PCM)</div>
                <div className="vx-metric-value">£1,150</div>
                <div className="vx-metric-sub">± £50</div>
              </div>
              <div className="vx-metric-score">
                <div className="vx-metric-label">Investment Score</div>
                <div className="vx-ring" style={{ '--p': 85 }}>
                  <span>85</span>
                </div>
                <div className="vx-metric-sub vx-metric-sub--good">Very Strong</div>
              </div>
              <div>
                <div className="vx-metric-label">Net Yield</div>
                <div className="vx-metric-value vx-metric-value--good">5.6%</div>
                <div className="vx-metric-sub vx-metric-sub--good">Excellent</div>
              </div>
            </div>

            <Link
              to={gate('/analyse')}
              state={gateState('/analyse')}
              viewTransition
              className="vx-card-cta"
            >
              View full analysis
              <span aria-hidden="true">→</span>
            </Link>
          </article>
        </div>
      </section>

      <section className="vx-how" id="how">
        <div className="vx-how-head">
          <h2>How it works</h2>
          <p>Three steps from listing URL to investment thesis.</p>
        </div>
        <div className="vx-how-grid">
          {[
            ['01', 'Paste a listing', 'Drop in any Rightmove, Zoopla, or OnTheMarket URL.', 'blue'],
            ['02', 'Review the report', 'Yields, rents, risks, strategy, and a clear score.', 'teal'],
            ['03', 'Save & compare', 'Track properties, briefs, and areas in one workspace.', 'amber'],
          ].map(([n, t, d, tone]) => (
            <div key={n} className={`vx-how-card vx-how-card--${tone}`}>
              <div className="vx-how-n">{n}</div>
              <h3>{t}</h3>
              <p>{d}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="vx-pricing" id="pricing">
        <div className="vx-pricing-inner">
          <h2>Start free. Upgrade when you scale.</h2>
          <p>Create an account to unlock Analyse, Discover, Portfolio, and more.</p>
          <div className="vx-pricing-actions">
            <Link
              to={gate('/analyse')}
              state={gateState('/analyse')}
              viewTransition
              className="vx-analyse-btn"
            >
              {isAuthenticated ? 'Open Analyse →' : 'Sign in to Analyse →'}
            </Link>
            <Link
              to={isAuthenticated ? '/discover' : '/signup'}
              state={isAuthenticated ? undefined : { from: '/discover' }}
              viewTransition
              className="vx-ghost-btn"
            >
              {isAuthenticated ? 'Explore Discover' : 'Create account'}
            </Link>
          </div>
        </div>
      </section>

      <footer className="vx-footer">
        <div className="vx-footer-inner">
          <Link to="/" className="vx-logo">
            <img className="vx-logo-image" src="/valora-logo-mark.jpg" alt="" aria-hidden="true" />
            Valora
          </Link>
          <p>Illustrative estimates only. Verify figures on the original listing.</p>
          <div className="vx-footer-links">
            <Link to={gate('/analyse')} state={gateState('/analyse')} viewTransition>Analyse</Link>
            <Link to={gate('/discover')} state={gateState('/discover')} viewTransition>Discover</Link>
            <Link to={gate('/portfolio')} state={gateState('/portfolio')} viewTransition>Portfolio</Link>
            <Link to={gate('/settings')} viewTransition>Account</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
