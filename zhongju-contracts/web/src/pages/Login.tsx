import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, setToken } from '../api';
import type { AuthUser } from '../types';
import { useAuth } from '../App';

export default function Login() {
  const { setUser } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const d = await api<{ token: string; user: AuthUser }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password }),
      });
      setToken(d.token);
      setUser(d.user);
      navigate('/');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid min-h-screen place-items-center bg-slate-100 px-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-md">
        <h1 className="mb-1 text-center text-xl font-bold text-brand-700">中聚人力 · 合同管理</h1>
        <p className="mb-6 text-center text-xs text-slate-400">内部系统，请使用公司分配的账号登录</p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="label">登录名</label>
            <input
              className="input"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
            />
          </div>
          <div>
            <label className="label">密码</label>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          </div>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button className="btn-primary w-full justify-center" disabled={busy || !username || !password}>
            {busy ? '登录中…' : '登 录'}
          </button>
        </form>
      </div>
    </div>
  );
}
