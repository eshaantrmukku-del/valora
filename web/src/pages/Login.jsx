import { useMemo, useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { useAuth } from '../context/AuthContext';

export default function Login() {
  const { isAuthenticated, signIn, signUp } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const from = location.state?.from || '/dashboard';
  const mode = useMemo(
    () => (location.pathname.includes('signup') ? 'signup' : 'login'),
    [location.pathname],
  );

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (isAuthenticated) {
    return <Navigate to={from} replace />;
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setBusy(true);
    const result =
      mode === 'signup'
        ? await signUp({ email, password, firstName, lastName })
        : await signIn({ email, password });
    setBusy(false);
    if (!result.ok) {
      setError(result.error || 'Something went wrong');
      return;
    }
    navigate(from, { replace: true, viewTransition: true });
  };

  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-brand">
          <img
            className="auth-logo"
            src="/valora-logo-lockup.jpg"
            alt="Valora — Find value before the market does"
          />
        </Link>
        <h1>{mode === 'signup' ? 'Create your account' : 'Sign in'}</h1>
        <p className="auth-sub">
          {mode === 'signup'
            ? 'Unlock Analyse, Portfolio, Discover, and the rest of your workspace.'
            : 'Sign in to access your Valora workspace.'}
        </p>

        <form className="auth-form" onSubmit={onSubmit}>
          {mode === 'signup' && (
            <div className="auth-row">
              <label>
                First name
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  autoComplete="given-name"
                />
              </label>
              <label>
                Last name
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  autoComplete="family-name"
                />
              </label>
            </div>
          )}
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              required
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
              required
              minLength={mode === 'signup' ? 10 : 1}
            />
          </label>

          {error && <div className="auth-error">{error}</div>}

          <button type="submit" className="auth-submit" disabled={busy}>
            {busy ? 'Please wait…' : mode === 'signup' ? 'Create account' : 'Sign in'}
          </button>
        </form>

        <p className="auth-switch">
          {mode === 'signup' ? (
            <>
              Already have an account?{' '}
              <Link to="/login" state={{ from }}>
                Sign in
              </Link>
            </>
          ) : (
            <>
              New here?{' '}
              <Link to="/signup" state={{ from }}>
                Create an account
              </Link>
            </>
          )}
        </p>
        {mode === 'login' && (
          <p className="auth-switch">
            <Link to="/forgot-password">Forgot your password?</Link>
          </p>
        )}
        <p className="auth-note">
          {mode === 'signup'
            ? 'Use at least 10 characters. Your data is private to your account.'
            : 'Your session is kept in a secure cookie on this device.'}
        </p>
      </div>
    </div>
  );
}
