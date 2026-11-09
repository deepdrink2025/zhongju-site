import { useEffect, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import Icon from '../components/Icon';
import { company } from '../data/company';
import { CardCreatePanel } from '../components/CardCreatePanel';
import AdminCardList from '../components/AdminCardList';
import { clearAuth, getAuth, login, type Role } from '../utils/cardAuth';
import { IS_SERVER_MODE } from '../utils/cardStore';

type Tab = 'create' | 'list';

function ConsoleTopBar({
  role,
  onLogout,
}: {
  role: Role | null;
  onLogout?: () => void;
}) {
  return (
    <div className="border-b border-neutral-200/80 bg-white/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between px-4">
        <Link to="/" className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-500 text-sm font-bold text-white">
            聚
          </span>
          <span className="font-bold text-neutral-900">{company.brandText}</span>
          <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs font-medium text-neutral-500">
            名片控制台
          </span>
          {role === 'admin' && (
            <span className="rounded-full bg-brand-50 px-2 py-0.5 text-xs font-medium text-brand-600">
              管理员
            </span>
          )}
        </Link>
        <div className="flex items-center gap-2">
          {onLogout && (
            <button
              type="button"
              onClick={onLogout}
              className="rounded-full px-3 py-1.5 text-sm font-medium text-neutral-400 transition hover:text-neutral-900"
            >
              退出
            </button>
          )}
          <Link
            to="/"
            className="flex items-center gap-1 rounded-full border border-neutral-200 px-3 py-1.5 text-sm font-medium text-neutral-600 transition hover:border-neutral-900 hover:text-neutral-900"
          >
            <Icon name="back" className="h-4 w-4" />
            返回官网
          </Link>
        </div>
      </div>
    </div>
  );
}

/** 统一登录门禁：业务员/管理员口令均可，登录后按角色显示功能 */
function ConsoleGate({ onUnlock }: { onUnlock: (role: Role) => void }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError('');
    setBusy(true);
    const res = await login(code);
    setBusy(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    onUnlock(res.role);
  };

  return (
    <div className="flex min-h-screen flex-col bg-neutral-100">
      <ConsoleTopBar role={null} />
      <main className="flex flex-1 items-center justify-center px-4 py-12">
        <form
          onSubmit={handleSubmit}
          className="w-full max-w-sm rounded-3xl bg-white p-8 text-center shadow-card-hover"
        >
          <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-500 text-white shadow-glow-brand">
            <Icon name="shield" className="h-7 w-7" />
          </span>
          <h1 className="mt-4 text-xl font-extrabold text-neutral-900">名片控制台</h1>
          <p className="mt-2 text-sm text-neutral-500">
            输入公司内部口令，业务员与管理员共用此入口
          </p>
          <input
            type="password"
            value={code}
            onChange={(e) => {
              setCode(e.target.value);
              setError('');
            }}
            placeholder="访问口令"
            autoFocus
            className="mt-6 w-full rounded-xl border border-neutral-200 bg-white px-4 py-3 text-center text-base tracking-widest outline-none transition placeholder:text-neutral-400 focus:border-brand-400"
          />
          {error && <p className="mt-3 text-sm text-red-500">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="mt-5 w-full rounded-full bg-neutral-900 px-6 py-3 text-base font-bold text-white transition hover:bg-neutral-700 disabled:opacity-60"
          >
            {busy ? '验证中…' : '进入'}
          </button>
          <p className="mt-4 text-xs leading-relaxed text-neutral-400">
            业务员口令：生成自己的名片
            <br />
            管理员口令：额外可管理全部名片
          </p>
        </form>
      </main>
    </div>
  );
}

/**
 * 名片控制台 /admin
 * - 业务员登录：仅「名片生成」
 * - 管理员登录：额外「名片管理」（全量列表、停用/删除）
 * - 不在官网导航展示，noindex 禁止收录
 */
export default function CardConsole() {
  const [role, setRole] = useState<Role | null>(() => {
    if (!IS_SERVER_MODE) return 'admin'; // 本地模式：直接可用（仅本机数据）
    return getAuth()?.role ?? null;
  });
  // 支持 /admin?tab=list 直达管理页（无权限时回到生成页）
  const [tab, setTab] = useState<Tab>(() =>
    new URLSearchParams(window.location.search).get('tab') === 'list' ? 'list' : 'create'
  );

  useEffect(() => {
    if (tab === 'list' && role !== 'admin') setTab('create');
  }, [tab, role]);

  useEffect(() => {
    const meta = document.createElement('meta');
    meta.name = 'robots';
    meta.content = 'noindex, nofollow';
    document.head.appendChild(meta);
    return () => {
      meta.remove();
    };
  }, []);

  if (!role) return <ConsoleGate onUnlock={setRole} />;

  return (
    <div className="flex min-h-screen flex-col bg-neutral-100">
      <ConsoleTopBar
        role={role}
        onLogout={
          IS_SERVER_MODE
            ? () => {
                clearAuth();
                setRole(null);
              }
            : undefined
        }
      />

      {/* Tab 切换 */}
      <div className="border-b border-neutral-200/80 bg-white/60">
        <div className="mx-auto flex max-w-5xl gap-1 px-4">
          {(
            [
              ['create', '名片生成'],
              ...(role === 'admin' ? [['list', '名片管理'] as [Tab, string]] : []),
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`relative px-4 py-3 text-sm font-semibold transition ${
                tab === key ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
              }`}
            >
              {label}
              {tab === key && (
                <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-brand-500" />
              )}
            </button>
          ))}
        </div>
      </div>

      {tab === 'create' ? <CardCreatePanel /> : <AdminCardList />}
    </div>
  );
}
