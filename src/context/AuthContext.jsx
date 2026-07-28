import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  getCurrentUser,
  isLoggedIn,
  logout as authLogout,
  signIn as authSignIn,
  signUp as authSignUp,
} from '../lib/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => getCurrentUser());
  const [ready, setReady] = useState(false);

  const refresh = useCallback(() => {
    setUser(getCurrentUser());
    setReady(true);
  }, []);

  useEffect(() => {
    refresh();
    const onAuth = () => refresh();
    window.addEventListener('valora-auth-change', onAuth);
    window.addEventListener('storage', onAuth);
    return () => {
      window.removeEventListener('valora-auth-change', onAuth);
      window.removeEventListener('storage', onAuth);
    };
  }, [refresh]);

  const signIn = useCallback(async (payload) => {
    const result = await authSignIn(payload);
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const signUp = useCallback(async (payload) => {
    const result = await authSignUp(payload);
    if (result.ok) setUser(result.user);
    return result;
  }, []);

  const logout = useCallback(() => {
    authLogout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user,
    ready,
    isAuthenticated: Boolean(user) || isLoggedIn(),
    signIn,
    signUp,
    logout,
    refresh,
  }), [user, ready, signIn, signUp, logout, refresh]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
