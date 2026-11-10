/**
 * 名片管理列表（管理员/本地模式预览用）
 * 不含门禁与顶栏，由控制台按角色挂载
 */
import { useCallback, useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { copyText } from '../utils/clipboard';
import {
  cardUrlOfCode,
  listAllCardsAsync,
  removeCardAsync,
  setCardStatusAsync,
  assignCardOwnerAsync,
  type CardRecord,
} from '../utils/cardStore';

type StatusFilter = 'all' | 'active' | 'disabled';

function formatTime(ts: number): string {
  if (!ts) return '—';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export default function AdminCardList() {
  const [items, setItems] = useState<CardRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [keyword, setKeyword] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [busyCode, setBusyCode] = useState<string | null>(null);
  const [toast, setToast] = useState('');
  const [ownerCard, setOwnerCard] = useState<CardRecord | null>(null);
  const [ownerCode, setOwnerCode] = useState('');
  const [query, setQuery] = useState('');
  const [offset, setOffset] = useState(0);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ total: 0, active: 0, disabled: 0 });
  const requestVersion = useRef(0);
  const pageSize = 50;

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setQuery(keyword.trim());
      setOffset(0);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [keyword]);

  const showToast = (msg: string) => {
    setToast(msg);
    window.setTimeout(() => setToast(''), 2000);
  };

  const load = useCallback(async () => {
    const version = ++requestVersion.current;
    setLoading(true);
    setError('');
    const res = await listAllCardsAsync({
      keyword: query,
      status: statusFilter,
      offset,
      limit: pageSize,
    });
    if (version !== requestVersion.current) return;
    if (res.ok) {
      setItems(res.items);
      setTotal(res.total);
      setCounts(res.counts);
      if (offset > 0 && offset >= res.total)
        setOffset(Math.max(0, Math.ceil(res.total / pageSize) - 1) * pageSize);
    } else setError(res.error);
    setLoading(false);
  }, [query, statusFilter, offset]);

  useEffect(() => {
    load();
    return () => {
      requestVersion.current++;
    };
  }, [load]);

  const handleCopy = async (text: string, msg: string) => {
    const ok = await copyText(text);
    showToast(ok ? msg : '复制失败，请手动复制');
  };

  const handleToggle = async (card: CardRecord) => {
    setBusyCode(card.shortCode);
    const next = card.status === 'active' ? 'disabled' : 'active';
    const ok = await setCardStatusAsync(card.shortCode, next);
    setBusyCode(null);
    if (ok) {
      await load();
      showToast(next === 'disabled' ? '已停用，客户打开会看到停用提示' : '已恢复启用');
    } else {
      showToast('操作失败，请重试');
    }
  };

  const handleDelete = async (card: CardRecord) => {
    if (!window.confirm(`确定删除「${card.name}」的名片吗？删除后短链立即失效且无法恢复。`)) return;
    setBusyCode(card.shortCode);
    const ok = await removeCardAsync(card.shortCode);
    setBusyCode(null);
    if (ok) {
      await load();
      showToast('名片已删除');
    } else {
      showToast('删除失败，请重试');
    }
  };

  return (
    <>
      <div className="mx-auto w-full max-w-5xl px-4 py-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-neutral-900">全部名片</h1>
            <p className="mt-1 text-sm text-neutral-500">
              共 {counts.total} 张 · 正常 {counts.active} · 停用 {counts.disabled}
            </p>
          </div>
          <button
            type="button"
            onClick={load}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-full border border-neutral-300 px-4 py-2 text-sm font-semibold text-neutral-700 transition hover:border-neutral-900 disabled:opacity-60"
          >
            <Icon name="cog" className="h-4 w-4" />
            {loading ? '刷新中…' : '刷新'}
          </button>
        </div>

        {/* 筛选 */}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:items-center">
          <input
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索姓名 / 手机号 / 短码 / 部门"
            className="w-full rounded-xl border border-neutral-200 bg-white px-4 py-2.5 text-sm text-neutral-900 outline-none transition placeholder:text-neutral-400 focus:border-brand-400 sm:max-w-sm"
          />
          <div className="flex gap-2">
            {(
              [
                ['all', '全部'],
                ['active', '正常'],
                ['disabled', '已停用'],
              ] as Array<[StatusFilter, string]>
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => {
                  setStatusFilter(key);
                  setOffset(0);
                }}
                className={`rounded-full px-4 py-2 text-sm font-semibold transition ${
                  statusFilter === key
                    ? 'bg-neutral-900 text-white'
                    : 'border border-neutral-200 bg-white text-neutral-600 hover:border-neutral-400'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {error && (
          <p className="mt-6 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</p>
        )}

        {/* 列表 */}
        <div className="mt-6 space-y-3">
          {loading && items.length === 0 && (
            <div className="rounded-2xl bg-white p-8 text-center text-sm text-neutral-400 shadow-card">
              加载中…
            </div>
          )}

          {!loading && items.length === 0 && !error && (
            <div className="rounded-2xl bg-white p-12 text-center shadow-card">
              <p className="text-neutral-400">
                {counts.total === 0 && !query
                  ? '还没有名片，先去「名片生成」创建第一张'
                  : '没有匹配的名片'}
              </p>
            </div>
          )}

          {items.map((card) => (
            <div
              key={card.shortCode}
              className={`flex flex-col gap-4 rounded-2xl bg-white p-5 shadow-card sm:flex-row sm:items-center ${
                card.status === 'disabled' ? 'opacity-70' : ''
              }`}
            >
              <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-brand-500 text-lg font-bold text-white">
                {card.name.charAt(0)}
              </span>

              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-bold text-neutral-900">{card.name}</p>
                  <span className="rounded-full bg-neutral-100 px-2 py-0.5 text-xs text-neutral-500">
                    {card.title || '业务顾问'}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      card.status === 'active'
                        ? 'bg-lime/20 text-lime-600'
                        : 'bg-neutral-200 text-neutral-500'
                    }`}
                  >
                    {card.status === 'active' ? '正常' : '已停用'}
                  </span>
                </div>
                <p className="tnum mt-1 text-sm text-neutral-500">
                  {card.phone}
                  {card.department ? ` · ${card.department}` : ''}
                </p>
                <p className="tnum mt-0.5 truncate text-xs text-neutral-400">
                  /card/{card.shortCode} · {formatTime(card.createdAt)}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                <a
                  href={`/admin?edit=${encodeURIComponent(card.shortCode)}`}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-neutral-700"
                >
                  编辑
                </a>
                <button
                  type="button"
                  onClick={() => {
                    setOwnerCard(card);
                    setOwnerCode('');
                  }}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-neutral-700"
                >
                  分配归属
                </button>
                <a
                  href={cardUrlOfCode(card.shortCode)}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-neutral-700 transition hover:border-neutral-900"
                >
                  打开
                </a>
                <button
                  type="button"
                  onClick={() => handleCopy(cardUrlOfCode(card.shortCode), '名片链接已复制')}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-neutral-700 transition hover:border-neutral-900"
                >
                  复制链接
                </button>
                <button
                  type="button"
                  onClick={() => handleToggle(card)}
                  disabled={busyCode === card.shortCode}
                  className="rounded-full border border-neutral-200 px-3 py-1.5 text-neutral-700 transition hover:border-neutral-900 disabled:opacity-50"
                >
                  {card.status === 'active' ? '停用' : '启用'}
                </button>
                <button
                  type="button"
                  onClick={() => handleDelete(card)}
                  disabled={busyCode === card.shortCode}
                  className="rounded-full px-3 py-1.5 text-neutral-300 transition hover:text-red-500 disabled:opacity-50"
                >
                  删除
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="mt-6 flex items-center justify-between gap-3 text-sm text-neutral-500">
          <span>
            共 {total} 条匹配 · 第 {Math.floor(offset / pageSize) + 1}/
            {Math.max(1, Math.ceil(total / pageSize))} 页
          </span>
          <div className="flex gap-3">
            <button
              type="button"
              disabled={loading || offset === 0}
              className="disabled:opacity-30"
              onClick={() => setOffset(Math.max(0, offset - pageSize))}
            >
              上一页
            </button>
            <button
              type="button"
              disabled={loading || offset + pageSize >= total}
              className="disabled:opacity-30"
              onClick={() => setOffset(offset + pageSize)}
            >
              下一页
            </button>
          </div>
        </div>
      </div>

      {ownerCard && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-white p-6">
            <h2 className="font-bold">分配「{ownerCard.name}」的管理归属</h2>
            <p className="mt-3 text-sm text-neutral-500">
              填写本人提供的恢复码。保存后，该恢复码的持有人可修改和删除这张名片。
            </p>
            <input
              type="password"
              autoComplete="off"
              maxLength={32}
              value={ownerCode}
              onChange={(e) => setOwnerCode(e.target.value.trim().toLowerCase())}
              placeholder="32 位恢复码"
              className="mt-4 w-full rounded-lg border p-3"
            />
            <div className="mt-4 flex justify-end gap-4">
              <button type="button" onClick={() => setOwnerCard(null)}>
                取消
              </button>
              <button
                type="button"
                disabled={!/^[a-f0-9]{32}$/.test(ownerCode) || !!busyCode}
                onClick={async () => {
                  setBusyCode(ownerCard.shortCode);
                  const ok = await assignCardOwnerAsync(ownerCard.shortCode, ownerCode);
                  setBusyCode(null);
                  if (ok) {
                    setOwnerCard(null);
                    setOwnerCode('');
                    showToast('归属已更新');
                    await load();
                  } else showToast('分配失败，请重试');
                }}
                className="text-brand-600 disabled:opacity-30"
              >
                保存归属
              </button>
            </div>
          </div>
        </div>
      )}
      {toast && (
        <div className="fixed left-1/2 top-20 z-[60] -translate-x-1/2 rounded-full bg-neutral-900 px-5 py-2.5 text-sm text-white shadow-lg">
          <span className="flex items-center gap-2">
            <Icon name="check" className="h-4 w-4 text-lime-400" />
            {toast}
          </span>
        </div>
      )}
    </>
  );
}
