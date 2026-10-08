import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import {
  fetchCurrentUser,
  logout as authLogout,
  signIn as authSignIn,
  signUp as authSignUp,
} from '../lib/auth';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setUser(await fetchCurrentUser());
    } catch {
      setUser(null);
    } finally {
      setReady(true);
    }
  }, []);

  useEffect(() => {
    refresh();
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

  const logout = useCallback(async () => {
    await authLogout();
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, ready, isAuthenticated: Boolean(user), signIn, signUp, logout, refresh }),
    [user, ready, signIn, signUp, logout, refresh],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
