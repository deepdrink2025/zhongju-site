import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link, NavLink, useNavigate } from 'react-router-dom';
import { api } from '../api';
import { ROLE_LABELS, LOGIN_ROLES } from '../types';
import { useAuth } from '../ContractsApp';
import Modal from './Modal';

function ChangePasswordModal({ onClose }: { onClose: () => void }) {
  const [oldPw, setOldPw] = useState('');
  const [newPw, setNewPw] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    setMsg('');
    try {
      await api('/auth/password', {
        method: 'POST',
        body: JSON.stringify({ old_password: oldPw, new_password: newPw }),
      });
      alert('密码修改成功');
      onClose();
    } catch (e) {
      setMsg((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Modal title="修改密码" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">原密码</label>
          <input type="password" className="input" value={oldPw} onChange={(e) => setOldPw(e.target.value)} />
        </div>
        <div>
          <label className="label">新密码（至少 8 位）</label>
          <input type="password" className="input" value={newPw} onChange={(e) => setNewPw(e.target.value)} />
        </div>
        {msg && <p className="text-sm text-red-600">{msg}</p>}
        <button className="btn-primary" disabled={busy || !oldPw || newPw.length < 8} onClick={submit}>
          保存
        </button>
      </div>
    </Modal>
  );
}

export default function Layout({ children }: { children: ReactNode }) {
  const { user, setUser } = useAuth();
  const navigate = useNavigate();
  const [showPw, setShowPw] = useState(false);
  if (!user) return null;

  async function logout() {
    try {
      await api('/auth/logout', { method: 'POST' });
    } catch {
      /* 忽略 */
    }
    setUser(null);
    navigate('/contracts/login');
  }

  const link = (to: string, label: string) => (
    <NavLink
      key={to}
      to={to}
      end={to === '/contracts'}
      className={({ isActive }) =>
        `rounded-lg px-3 py-1.5 text-sm font-medium ${isActive ? 'bg-ct-600 text-white' : 'text-slate-600 hover:bg-slate-100'}`
      }
    >
      {label}
    </NavLink>
  );

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1600px] flex-wrap items-center gap-3 px-4 py-3">
          <Link to="/contracts" className="text-base font-bold text-ct-700">
            中聚人力 · 合同管理
          </Link>
          <nav className="flex items-center gap-1">
            {link('/contracts', '合同台账')}
            {LOGIN_ROLES.includes(user.role) && link('/contracts/users', '用户与业务人员')}
          </nav>
          <div className="ml-auto flex items-center gap-3 text-sm">
            <span className="text-slate-500">
              {user.name}（{ROLE_LABELS[user.role]}）
            </span>
            <button className="btn-plain" onClick={() => setShowPw(true)}>
              修改密码
            </button>
            <button className="btn-plain" onClick={logout}>
              退出
            </button>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-[1600px] px-4 py-6">{children}</main>
      {showPw && <ChangePasswordModal onClose={() => setShowPw(false)} />}
    </div>
  );
}
