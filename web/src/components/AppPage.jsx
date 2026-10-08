import { Link } from 'react-router';

export default function AppPage({ title, subtitle, actions, children, aside, eyebrow, art }) {
  return (
    <div className="app-page">
      <header className="app-page-header">
        <div className="app-page-header-text">
          {eyebrow && <div className="app-page-eyebrow">{eyebrow}</div>}
          <div className="app-page-title-row">
            {art && <div className="app-page-art">{art}</div>}
            <div>
              <h1 className="app-page-title">{title}</h1>
              {subtitle && <p className="app-page-subtitle">{subtitle}</p>}
            </div>
          </div>
        </div>
        {actions && <div className="app-page-actions">{actions}</div>}
      </header>
      <div className={`app-page-body${aside ? ' app-page-body--split' : ''}`}>
        {aside && <aside className="app-page-aside">{aside}</aside>}
        <div className="app-page-content">{children}</div>
      </div>
    </div>
  );
}

export function AppStat({ label, value, hint, accent = 'blue', icon }) {
  return (
    <div className={`app-stat app-stat--${accent}`}>
      {icon && <div className="app-stat-icon" aria-hidden="true">{icon}</div>}
      <div className="app-stat-label">{label}</div>
      <div className="app-stat-value">{value}</div>
      {hint && <div className="app-stat-hint">{hint}</div>}
    </div>
  );
}

export function AppCard({ title, meta, children, onClick, score, active, icon, tone }) {
  const Tag = onClick ? 'button' : 'div';
  return (
    <Tag
      type={onClick ? 'button' : undefined}
      className={`app-card${onClick ? ' app-card--clickable' : ''}${active ? ' app-card--active' : ''}${tone ? ` app-card--${tone}` : ''}`}
      onClick={onClick}
    >
      <div className="app-card-head">
        <div className="app-card-head-main">
          {icon && <div className="app-card-icon" aria-hidden="true">{icon}</div>}
          <div>
            <div className="app-card-title">{title}</div>
            {meta && <div className="app-card-meta">{meta}</div>}
          </div>
        </div>
        {score != null && (
          <div className={`app-card-score${score >= 80 ? ' high' : score >= 65 ? ' mid' : ' low'}`}>{score}</div>
        )}
      </div>
      {children && <div className="app-card-body">{children}</div>}
    </Tag>
  );
}

export function AppEmpty({ title, description, actionLabel, actionTo, onAction, art }) {
  const action = actionTo ? (
    <Link to={actionTo} viewTransition className="app-empty-action">{actionLabel}</Link>
  ) : onAction ? (
    <button type="button" className="app-empty-action" onClick={onAction}>{actionLabel}</button>
  ) : null;

  return (
    <div className="app-empty">
      {art && <div className="app-empty-art">{art}</div>}
      <h3 className="app-empty-title">{title}</h3>
      <p className="app-empty-desc">{description}</p>
      {action}
    </div>
  );
}

export function AppPathwayCard({ title, desc, cta, to, art, tone = 'blue', onClick }) {
  const inner = (
    <>
      <div className="app-pathway-art">{art}</div>
      <h3 className="app-pathway-title">{title}</h3>
      <p className="app-pathway-desc">{desc}</p>
      <span className="app-pathway-cta">{cta}</span>
    </>
  );

  if (onClick) {
    return (
      <button type="button" className={`app-pathway app-pathway--${tone}`} onClick={onClick}>
        {inner}
      </button>
    );
  }

  return (
    <Link to={to} viewTransition className={`app-pathway app-pathway--${tone}`}>
      {inner}
    </Link>
  );
}
