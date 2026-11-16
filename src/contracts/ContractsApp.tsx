import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, getToken, setToken } from './api';
import { LOGIN_ROLES } from './types';
import type { AuthUser } from './types';
import Layout from './components/Layout';
import Login from './pages/Login';
import ContractsPage from './pages/Contracts';
import ContractDetail from './pages/ContractDetail';
import UsersPage from './pages/Users';

/**
 * 合同管理模块：独立账号体系（与官网名片口令登录互不相干），
 * 挂载在主站路由 /contracts/* 下。
 */
const AuthCtx = createContext<{ user: AuthUser | null; setUser: (u: AuthUser | null) => void }>({
  user: null,
  setUser: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthCtx);

export default function ContractsApp() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  // 保持与原独立版一致的观感：17px 基准字号 + 浅灰页面底色。
  // 只在本模块挂载期间生效，离开（如返回官网）立即还原，不影响官网布局。
  useEffect(() => {
    const root = document.documentElement;
    const prevFontSize = root.style.fontSize;
    root.style.fontSize = '17px';
    document.body.classList.add('ct-body');
    return () => {
      root.style.fontSize = prevFontSize;
      document.body.classList.remove('ct-body');
    };
  }, []);

  useEffect(() => {
    if (!getToken()) return;
    api<{ user: AuthUser }>('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid min-h-screen place-items-center bg-slate-100 text-slate-500">加载中…</div>;
  }

  return (
    <AuthCtx.Provider value={{ user, setUser }}>
      {!user ? (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/contracts/login" replace />} />
        </Routes>
      ) : (
        <Layout>
          <Routes>
            <Route path="/" element={<ContractsPage />} />
            <Route path="/:id" element={<ContractDetail />} />
            <Route
              path="/users"
              element={LOGIN_ROLES.includes(user.role) ? <UsersPage /> : <Navigate to="/contracts" replace />}
            />
            <Route path="*" element={<Navigate to="/contracts" replace />} />
          </Routes>
        </Layout>
      )}
    </AuthCtx.Provider>
  );
}
