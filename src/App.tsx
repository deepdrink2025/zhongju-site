import { useEffect, type ReactNode } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import CardPage from './pages/CardPage';
import { AdminAuthProvider, useAuth } from './admin/auth';
import AdminLayout from './admin/components/Layout';
import Login from './admin/pages/Login';
import Dashboard from './admin/pages/Dashboard';
import Cards from './admin/pages/Cards';
import Contracts from './admin/pages/Contracts';
import ContractDetail from './admin/pages/ContractDetail';
import Users from './admin/pages/Users';
import type { Role } from './admin/types';

/** 路由切换时滚动到页面顶部（锚点滚动由组件内部处理） */
function ScrollToTop(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

/** 后台登录守卫：未登录跳登录页，角色不符回工作台 */
function Protected({ children, roles }: { children: ReactNode; roles?: Role[] }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-400">
        正在校验登录状态…
      </div>
    );
  }
  if (!user) return <Navigate to="/admin/login" replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to="/admin" replace />;
  return <AdminLayout>{children}</AdminLayout>;
}

/** 已登录时不再展示登录页 */
function LoginRoute() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/admin" replace />;
  return <Login />;
}

export default function App() {
  return (
    <AdminAuthProvider>
      <ScrollToTop />
      <Routes>
        {/* 对外站点与公开名片页 */}
        <Route path="/" element={<Home />} />
        <Route path="/card" element={<CardPage />} />
        <Route path="/card/:id" element={<CardPage />} />

        {/* 统一后台：/admin/*，三端共用一个 users 账号体系 */}
        <Route path="/admin/login" element={<LoginRoute />} />
        <Route
          path="/admin"
          element={
            <Protected>
              <Dashboard />
            </Protected>
          }
        />
        <Route
          path="/admin/cards"
          element={
            <Protected roles={['admin']}>
              <Cards />
            </Protected>
          }
        />
        <Route
          path="/admin/contracts"
          element={
            <Protected>
              <Contracts />
            </Protected>
          }
        />
        <Route
          path="/admin/contracts/:id"
          element={
            <Protected>
              <ContractDetail />
            </Protected>
          }
        />
        <Route
          path="/admin/users"
          element={
            <Protected roles={['admin', 'contract_admin']}>
              <Users />
            </Protected>
          }
        />

        <Route path="*" element={<Home />} />
      </Routes>
    </AdminAuthProvider>
  );
}
