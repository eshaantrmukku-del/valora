import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { api } from '../lib/api';

export function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    try {
      const r = await api('/api/auth/password-reset/request', { method: 'POST', body: { email } });
      setState(r.emailConfigured ? 'sent' : 'no-email');
    } catch (err) {
      setState(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-brand"><img className="auth-logo" src="/valora-logo-lockup.jpg" alt="Valora — Find value before the market does" /></Link>
        <h1>Reset your password</h1>
        {state === 'sent' ? (
          <p className="auth-sub">If an account exists for {email}, we’ve emailed a reset link. It expires in one hour.</p>
        ) : state === 'no-email' ? (
          <p className="auth-sub">Password reset emails aren’t enabled on this Valora server yet. Please contact the administrator to reset your password.</p>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>Email<input type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required /></label>
            {state && <div className="auth-error">{state}</div>}
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : 'Send reset link'}</button>
          </form>
        )}
        <p className="auth-switch"><Link to="/login">Back to sign in</Link></p>
      </div>
    </div>
  );
}

export function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const token = params.get('token') || '';
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/api/auth/password-reset/confirm', { method: 'POST', body: { token, password } });
      navigate('/login', { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="auth-page">
      <div className="auth-card">
        <Link to="/" className="auth-brand"><img className="auth-logo" src="/valora-logo-lockup.jpg" alt="Valora — Find value before the market does" /></Link>
        <h1>Choose a new password</h1>
        {!token ? (
          <p className="auth-sub">This link is missing its reset token. Request a new link.</p>
        ) : (
          <form className="auth-form" onSubmit={submit}>
            <label>New password<input type="password" minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" required /></label>
            {error && <div className="auth-error">{error}</div>}
            <button type="submit" className="auth-submit" disabled={busy}>{busy ? 'Please wait…' : 'Set password'}</button>
          </form>
        )}
        <p className="auth-switch"><Link to="/forgot-password">Request a new link</Link></p>
      </div>
    </div>
  );
}
