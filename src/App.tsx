import { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Home from './pages/Home';
import CardPage from './pages/CardPage';
import CardConsole from './pages/CardConsole';

/** 路由切换时滚动到页面顶部（锚点滚动由组件内部处理） */
function ScrollToTop(): null {
  const { pathname } = useLocation();
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'auto' });
  }, [pathname]);
  return null;
}

export default function App() {
  return (
    <>
      <ScrollToTop />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/card" element={<CardPage />} />
        <Route path="/card/:id" element={<CardPage />} />
        {/* 内部控制台：名片生成 + 名片管理（按口令权限显示），不在官网导航展示 */}
        <Route path="/admin" element={<CardConsole />} />
        {/* 旧入口兼容：/create 已合并进控制台 */}
        <Route path="/create" element={<Navigate to="/admin" replace />} />
        <Route path="*" element={<Home />} />
      </Routes>
    </>
  );
}
