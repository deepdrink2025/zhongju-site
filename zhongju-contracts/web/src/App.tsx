import { createContext, useContext, useEffect, useState } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { api, getToken, setToken } from './api';
import type { AuthUser } from './types';
import Layout from './components/Layout';
import Login from './pages/Login';
import ContractsPage from './pages/Contracts';
import ContractDetail from './pages/ContractDetail';
import UsersPage from './pages/Users';

const AuthCtx = createContext<{ user: AuthUser | null; setUser: (u: AuthUser | null) => void }>({
  user: null,
  setUser: () => {},
});

// eslint-disable-next-line react-refresh/only-export-components
export const useAuth = () => useContext(AuthCtx);

export default function App() {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(!!getToken());

  useEffect(() => {
    if (!getToken()) return;
    api<{ user: AuthUser }>('/auth/me')
      .then((d) => setUser(d.user))
      .catch(() => setToken(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="grid min-h-screen place-items-center text-slate-500">加载中…</div>;
  }

  return (
    <AuthCtx.Provider value={{ user, setUser }}>
      {!user ? (
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : (
        <Layout>
          <Routes>
            <Route path="/" element={<ContractsPage />} />
            <Route path="/contracts/:id" element={<ContractDetail />} />
            <Route path="/users" element={user.role === 'admin' ? <UsersPage /> : <Navigate to="/" replace />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Layout>
      )}
    </AuthCtx.Provider>
  );
}
