import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { api, AUTH_EXPIRED_EVENT, getToken, setToken } from './api';
import type { AuthUser } from './types';

interface AuthCtxValue {
  user: AuthUser | null;
  setUser: (user: AuthUser | null) => void;
  loading: boolean;
}

const AuthCtx = createContext<AuthCtxValue>({ user: null, setUser: () => {}, loading: true });

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthCtx);

/** 统一后台登录态：进入时校验 token，401 时自动登出 */
export function AdminAuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) {
      setLoading(false);
      return;
    }
    api<{ user: AuthUser }>('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => {
        setToken(null);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handler = () => setUser(null);
    window.addEventListener(AUTH_EXPIRED_EVENT, handler);
    return () => window.removeEventListener(AUTH_EXPIRED_EVENT, handler);
  }, []);

  return <AuthCtx.Provider value={{ user, setUser, loading }}>{children}</AuthCtx.Provider>;
}
