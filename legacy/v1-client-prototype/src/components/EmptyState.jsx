import { Link } from 'react-router-dom';

export default function EmptyState({ icon, title, description, action, actionLabel, actionTo, onAction }) {
  const actionEl = action
    || (actionTo && <Link to={actionTo} className="empty-state-btn">{actionLabel}</Link>)
    || (onAction && <button type="button" className="empty-state-btn" onClick={onAction}>{actionLabel}</button>);

  return (
    <div className="empty-state">
      {icon && <div className="empty-state-icon">{icon}</div>}
      <h3 className="empty-state-title">{title}</h3>
      {description && <p className="empty-state-desc">{description}</p>}
      {actionEl}
    </div>
  );
}
