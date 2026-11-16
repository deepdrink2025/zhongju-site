import { useCallback, useEffect, useState } from 'react';
import { api } from '../api';
import Modal from '../components/Modal';
import { ROLE_LABELS } from '../types';
import type { LoginLogRow, Role, UserRow } from '../types';
import { useAuth } from '../App';

const ROLES: Role[] = ['admin', 'finance', 'staff', 'viewer'];

function LoginLogsModal({ onClose }: { onClose: () => void }) {
  const [logs, setLogs] = useState<LoginLogRow[]>([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api<{ logs: LoginLogRow[] }>('/auth/login-logs')
      .then((d) => setLogs(d.logs))
      .catch((e) => setError((e as Error).message));
  }, []);

  return (
    <Modal title="登录日志（最近 100 条）" onClose={onClose} wide>
      {error && <p className="text-sm text-red-600">{error}</p>}
      {!error && !logs.length && <p className="text-sm text-slate-400">暂无记录</p>}
      {logs.length > 0 && (
        <div className="max-h-[60vh] overflow-y-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-3 py-2">时间</th>
                <th className="px-3 py-2">登录名</th>
                <th className="px-3 py-2">姓名</th>
                <th className="px-3 py-2">IP</th>
                <th className="px-3 py-2">结果</th>
              </tr>
            </thead>
            <tbody>
              {logs.map((l) => (
                <tr key={l.id} className="border-b border-slate-100">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-slate-500">{l.created_at?.slice(0, 19).replace('T', ' ')}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.username}</td>
                  <td className="px-3 py-2">{l.user_name ?? '—'}</td>
                  <td className="px-3 py-2 font-mono text-xs text-slate-500">{l.ip}</td>
                  <td className="px-3 py-2">
                    <span className={`badge ${l.success ? 'bg-emerald-100 text-emerald-700' : 'bg-red-100 text-red-700'}`}>
                      {l.success ? '成功' : '失败'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}

export default function UsersPage() {
  const { user } = useAuth();
  const [list, setList] = useState<UserRow[]>([]);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [showLoginLogs, setShowLoginLogs] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', role: 'staff' as Role, password: '' });
  const [busy, setBusy] = useState(false);

  const fetchList = useCallback(async () => {
    try {
      const d = await api<{ users: UserRow[] }>('/users');
      setList(d.users);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  async function create() {
    setBusy(true);
    try {
      await api('/users', { method: 'POST', body: JSON.stringify(form) });
      setCreating(false);
      setForm({ name: '', username: '', role: 'staff', password: '' });
      fetchList();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function patch(id: number, body: Record<string, unknown>, confirmMsg?: string) {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    try {
      await api(`/users/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
      fetchList();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function resetPw(u: UserRow) {
    const pw = window.prompt(`为「${u.name}」设置新密码（至少 8 位）：`);
    if (!pw) return;
    await patch(u.id, { password: pw });
    alert('密码已重置');
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center">
        <p className="text-sm text-slate-500">
          共 {list.length} 个账号。同一账号连续登录失败 {5} 次将被锁定 30 分钟。
        </p>
        <button className="btn-plain ml-auto" onClick={() => setShowLoginLogs(true)}>
          登录日志
        </button>
        <button className="btn-primary ml-2" onClick={() => setCreating(true)}>
          ＋ 新增账号
        </button>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[700px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-4 py-3">姓名</th>
              <th className="px-4 py-3">登录名</th>
              <th className="px-4 py-3">角色</th>
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3">创建时间</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {list.map((u) => (
              <tr key={u.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="px-4 py-3 font-medium">
                  {u.name}
                  {u.id === user!.id && <span className="ml-1 text-xs text-brand-600">（我）</span>}
                </td>
                <td className="px-4 py-3 font-mono text-xs text-slate-500">{u.username}</td>
                <td className="px-4 py-3">
                  <select
                    className="select w-auto min-w-[6rem] px-2 py-1 text-xs"
                    value={u.role}
                    disabled={u.id === user!.id}
                    onChange={(e) => patch(u.id, { role: e.target.value })}
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABELS[r]}
                      </option>
                    ))}
                  </select>
                </td>
                <td className="px-4 py-3">
                  <span className={`badge ${u.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-500'}`}>
                    {u.status === 'active' ? '启用' : '停用'}
                  </span>
                </td>
                <td className="px-4 py-3 text-xs text-slate-400">{u.created_at?.slice(0, 10)}</td>
                <td className="px-4 py-3 text-right">
                  <button className="btn-plain" onClick={() => resetPw(u)}>
                    重置密码
                  </button>
                  {u.id !== user!.id && (
                    <button
                      className="btn-plain ml-2"
                      onClick={() =>
                        patch(
                          u.id,
                          { status: u.status === 'active' ? 'disabled' : 'active' },
                          u.status === 'active' ? `确认停用「${u.name}」的账号？` : `确认启用「${u.name}」的账号？`
                        )
                      }
                    >
                      {u.status === 'active' ? '停用' : '启用'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showLoginLogs && <LoginLogsModal onClose={() => setShowLoginLogs(false)} />}

      {creating && (
        <Modal title="新增账号" onClose={() => setCreating(false)}>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">姓名 *</label>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </div>
              <div>
                <label className="label">登录名 *（3-30 位字母/数字/下划线）</label>
                <input className="input" value={form.username} onChange={(e) => setForm({ ...form, username: e.target.value })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">角色</label>
                <select className="select" value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {ROLE_LABELS[r]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">初始密码 *（至少 8 位）</label>
                <input className="input" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button className="btn-plain" onClick={() => setCreating(false)}>
                取消
              </button>
              <button className="btn-primary" disabled={busy || !form.name || !form.username || form.password.length < 8} onClick={create}>
                创建
              </button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
