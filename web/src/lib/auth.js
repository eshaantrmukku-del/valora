import { api } from './api';

function toUser(u) {
  if (!u) return null;
  const [firstName = '', ...rest] = (u.displayName || '').split(' ');
  return { id: u.id, email: u.email, displayName: u.displayName, firstName, lastName: rest.join(' '), onboardingCompleted: u.onboardingCompleted };
}

export async function fetchCurrentUser() {
  const r = await api('/api/auth/me');
  return toUser(r.user);
}

export async function signUp({ email, password, firstName = '', lastName = '' }) {
  try {
    const displayName = `${firstName} ${lastName}`.trim() || undefined;
    const r = await api('/api/auth/register', { method: 'POST', body: { email, password, displayName } });
    return { ok: true, user: toUser({ ...r.user, onboardingCompleted: false }) };
  } catch (err) {
    const fieldMsg = err.details?.[0]?.message;
    return { ok: false, error: err.code === 'validation_failed' && fieldMsg ? `${err.message} ${fieldMsg}` : err.message };
  }
}

export async function signIn({ email, password }) {
  try {
    await api('/api/auth/login', { method: 'POST', body: { email, password } });
    return { ok: true, user: await fetchCurrentUser() };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

export async function logout() {
  try {
    await api('/api/auth/logout', { method: 'POST' });
  } catch {
    /* session may already be gone */
  }
}
