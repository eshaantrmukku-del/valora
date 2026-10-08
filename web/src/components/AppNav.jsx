import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';
import { NavGlyph } from './AppIllustrations';
import { useApi } from '../hooks/useApi';

const TABS = [
  { to: '/analyse', label: 'Analyse', icon: 'analyse', match: (p) => p.startsWith('/analyse') },
  { to: '/discover', label: 'Discover', icon: 'discover', match: (p) => p.startsWith('/discover') },
  { to: '/compare', label: 'Compare', icon: 'compare', match: (p) => p.startsWith('/compare') },
  { to: '/portfolio', label: 'Portfolio', icon: 'portfolio', match: (p) => p.startsWith('/portfolio') },
  { to: '/area-intel', label: 'Intel', icon: 'intel', match: (p) => p.startsWith('/area-intel') },
  { to: '/tools', label: 'Tools', icon: 'tools', match: (p) => p.startsWith('/tools') },
  { to: '/assistant', label: 'Assistant', icon: 'assistant', match: (p) => p.startsWith('/assistant') },
  { to: '/dashboard', label: 'Overview', icon: 'dashboard', match: (p) => p.startsWith('/dashboard') },
];

export default function AppNav() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const notes = useApi('/api/notifications', { pollMs: 60_000 });
  const unread = notes.data?.unread || 0;

  const onLogout = async () => {
    await logout();
    setOpen(false);
    navigate('/', { replace: true, viewTransition: true });
  };

  const initials = ((user?.firstName?.[0] || '') + (user?.lastName?.[0] || '') || user?.email?.[0] || 'U').toUpperCase();

  return (
    <header className="app-nav">
      <div className="app-nav-top">
        <Link to="/" viewTransition className="app-nav-brand" onClick={() => setOpen(false)}>
          <img className="app-nav-logo" src="/valora-logo-mark.jpg" alt="" aria-hidden="true" />
          Valora
        </Link>

        <div className="app-nav-right">
          <Link to="/analyse" viewTransition className="app-nav-cta" onClick={() => setOpen(false)}>
            <span className="app-nav-cta-icon" aria-hidden="true">+</span>
            New analysis
          </Link>
          <Link to="/settings#alerts" viewTransition className="app-nav-cta" style={{ background: 'transparent', color: 'inherit', boxShadow: 'none' }} aria-label={`Alerts${unread ? `, ${unread} unread` : ''}`} onClick={() => setOpen(false)}>
            Alerts{unread ? ` (${unread})` : ''}
          </Link>
          <div className="app-nav-user">
            <Link to="/settings" viewTransition className="app-nav-account" aria-label="Account" onClick={() => setOpen(false)}>
              <span className="app-nav-initials">{initials}</span>
            </Link>
            <button type="button" className="app-nav-logout" onClick={onLogout}>
              Sign out
            </button>
          </div>
          <button type="button" className="app-nav-menu" aria-label="Open menu" onClick={() => setOpen(!open)}>
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </div>

      <nav className="app-nav-tabs" aria-label="Main sections">
        {TABS.map(({ to, label, icon, match }) => (
          <Link
            key={to}
            to={to}
            viewTransition
            className={`app-nav-tab${match(pathname) ? ' app-nav-tab--active' : ''}`}
            onClick={() => setOpen(false)}
          >
            <NavGlyph name={icon} />
            {label}
          </Link>
        ))}
      </nav>

      {open && (
        <div className="app-nav-drawer">
          {TABS.map(({ to, label, icon, match }) => (
            <Link
              key={to}
              to={to}
              viewTransition
              className={`app-nav-drawer-link${match(pathname) ? ' is-active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <NavGlyph name={icon} />
              {label}
            </Link>
          ))}
          <Link to="/settings" viewTransition className="app-nav-drawer-link" onClick={() => setOpen(false)}>
            Settings
          </Link>
          <button type="button" className="app-nav-drawer-link" onClick={onLogout}>
            Sign out
          </button>
        </div>
      )}
    </header>
  );
}
