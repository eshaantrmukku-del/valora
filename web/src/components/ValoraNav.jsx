import { useState } from 'react';
import { Link } from 'react-router';
import { useAuth } from '../context/AuthContext';

const LINKS = [
  { href: '/', label: 'Home', internal: true },
  { href: '#how', label: 'How it works' },
  { href: '#pricing', label: 'Pricing' },
  { href: '#insights', label: 'Insights' },
];

export default function ValoraNav() {
  const [open, setOpen] = useState(false);
  const { isAuthenticated, user, logout } = useAuth();

  return (
    <>
      <nav className="vx-nav" aria-label="Global">
        <div className="vx-nav-inner">
          <Link to="/" viewTransition className="vx-logo" onClick={() => setOpen(false)}>
            <img className="vx-logo-image" src="/valora-logo-mark.jpg" alt="" aria-hidden="true" />
            Valora
          </Link>

          <div className="vx-nav-links">
            {LINKS.map((l) =>
              l.internal ? (
                <Link
                  key={l.label}
                  to={l.href}
                  viewTransition
                  className="vx-nav-link is-active"
                  onClick={() => setOpen(false)}
                >
                  {l.label}
                </Link>
              ) : (
                <a key={l.label} href={l.href} className="vx-nav-link" onClick={() => setOpen(false)}>
                  {l.label}
                </a>
              ),
            )}
          </div>

          {isAuthenticated ? (
            <div className="vx-nav-authed">
              <Link to="/dashboard" viewTransition className="vx-nav-cta" onClick={() => setOpen(false)}>
                Open workspace
              </Link>
              <button
                type="button"
                className="vx-signin"
                onClick={() => {
                  logout();
                  setOpen(false);
                }}
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link to="/login" viewTransition className="vx-signin" onClick={() => setOpen(false)}>
              <svg width="15" height="15" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <circle cx="8" cy="5.5" r="2.5" stroke="currentColor" strokeWidth="1.4" />
                <path
                  d="M3 13.5c.7-2.3 2.5-3.5 5-3.5s4.3 1.2 5 3.5"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                />
              </svg>
              Sign in
            </Link>
          )}

          <button type="button" className="vx-menu" aria-label="Menu" onClick={() => setOpen(!open)}>
            {open ? 'Close' : 'Menu'}
          </button>
        </div>
      </nav>

      {open && (
        <div className="vx-drawer">
          {LINKS.map((l) =>
            l.internal ? (
              <Link key={l.label} to={l.href} viewTransition onClick={() => setOpen(false)}>
                {l.label}
              </Link>
            ) : (
              <a key={l.label} href={l.href} onClick={() => setOpen(false)}>
                {l.label}
              </a>
            ),
          )}
          {isAuthenticated ? (
            <>
              <Link to="/dashboard" viewTransition onClick={() => setOpen(false)}>
                Workspace{user?.firstName ? ` · ${user.firstName}` : ''}
              </Link>
              <button
                type="button"
                onClick={() => {
                  logout();
                  setOpen(false);
                }}
              >
                Sign out
              </button>
            </>
          ) : (
            <>
              <Link to="/login" viewTransition onClick={() => setOpen(false)}>
                Sign in
              </Link>
              <Link to="/signup" viewTransition onClick={() => setOpen(false)}>
                Create account
              </Link>
            </>
          )}
        </div>
      )}
    </>
  );
}
