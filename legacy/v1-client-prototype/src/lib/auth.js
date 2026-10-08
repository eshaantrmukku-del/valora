const USERS_KEY = 'valora_users';
const SESSION_KEY = 'valora_session';

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || '[]');
  } catch {
    return [];
  }
}

function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

async function hashPassword(password) {
  const data = new TextEncoder().encode(`valora:${password}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export function getSession() {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) || 'null');
  } catch {
    return null;
  }
}

export function isLoggedIn() {
  return Boolean(getSession()?.email);
}

export function getCurrentUser() {
  const session = getSession();
  if (!session?.email) return null;
  const user = readUsers().find((u) => u.email === session.email);
  if (!user) return null;
  return {
    email: user.email,
    firstName: user.firstName || '',
    lastName: user.lastName || '',
    createdAt: user.createdAt,
  };
}

function setSession(email) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ email, loggedInAt: Date.now() }));
  window.dispatchEvent(new Event('valora-auth-change'));
}

export function logout() {
  localStorage.removeItem(SESSION_KEY);
  window.dispatchEvent(new Event('valora-auth-change'));
}

export async function signUp({ email, password, firstName = '', lastName = '' }) {
  const cleaned = String(email || '').trim().toLowerCase();
  const pass = String(password || '');
  if (!cleaned || !cleaned.includes('@')) {
    return { ok: false, error: 'Enter a valid email address' };
  }
  if (pass.length < 6) {
    return { ok: false, error: 'Password must be at least 6 characters' };
  }
  const users = readUsers();
  if (users.some((u) => u.email === cleaned)) {
    return { ok: false, error: 'An account with this email already exists' };
  }
  const passwordHash = await hashPassword(pass);
  users.push({
    email: cleaned,
    passwordHash,
    firstName: String(firstName || '').trim(),
    lastName: String(lastName || '').trim(),
    createdAt: Date.now(),
  });
  writeUsers(users);
  setSession(cleaned);
  return { ok: true, user: getCurrentUser() };
}

export async function signIn({ email, password }) {
  const cleaned = String(email || '').trim().toLowerCase();
  const pass = String(password || '');
  if (!cleaned || !pass) {
    return { ok: false, error: 'Email and password are required' };
  }
  const user = readUsers().find((u) => u.email === cleaned);
  if (!user) {
    return { ok: false, error: 'No account found with that email' };
  }
  const passwordHash = await hashPassword(pass);
  if (passwordHash !== user.passwordHash) {
    return { ok: false, error: 'Incorrect password' };
  }
  setSession(cleaned);
  return { ok: true, user: getCurrentUser() };
}
