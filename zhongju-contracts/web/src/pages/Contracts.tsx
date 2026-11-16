import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, getToken } from '../api';
import Modal from '../components/Modal';
import ContractForm from '../components/ContractForm';
import { CONTRACT_TYPES, STATUS_COLORS, fmtDate, fmtMoney, canSeeMoney } from '../types';
import type { CategoryStat, Contract, DimStat, StatsResponse } from '../types';
import { useAuth } from '../App';

function statusOptions(isAdmin: boolean): [string, string][] {
  const opts: [string, string][] = [
    ['', '全部状态'],
    ['active', '生效中'],
    ['expiring', '即将到期（30 天内）'],
    ['expired', '已到期'],
    ['renewed', '已续签'],
    ['terminated', '已终止'],
  ];
  if (isAdmin) opts.push(['deleted', '已删除（回收站）']);
  return opts;
}

const OVERVIEW_ITEMS: { key: keyof StatsResponse['overview']; label: string; tone: string }[] = [
  { key: 'active', label: '在履行', tone: 'text-emerald-600' },
  { key: 'signed_this_month', label: '本月新签', tone: 'text-sky-600' },
  { key: 'expiring', label: '30 天内到期', tone: 'text-amber-600' },
  { key: 'expired', label: '已到期', tone: 'text-red-600' },
];

const DIM_TABS: { key: 'by_customer' | 'by_entity' | 'by_owner'; label: string }[] = [
  { key: 'by_customer', label: '按客户' },
  { key: 'by_entity', label: '按我方签约主体' },
  { key: 'by_owner', label: '按业务负责人' },
];

function Dashboard({ showMoney }: { showMoney: boolean }) {
  const [cats, setCats] = useState<CategoryStat[]>([]);
  const [overview, setOverview] = useState<StatsResponse['overview'] | null>(null);
  const [dims, setDims] = useState<Pick<StatsResponse, 'by_customer' | 'by_entity' | 'by_owner'> | null>(null);
  const [dimTab, setDimTab] = useState<'by_customer' | 'by_entity' | 'by_owner'>('by_customer');

  useEffect(() => {
    api<StatsResponse>('/contracts/stats')
      .then((d) => {
        setCats(d.categories);
        setOverview(d.overview);
        setDims({ by_customer: d.by_customer, by_entity: d.by_entity, by_owner: d.by_owner });
      })
      .catch(() => {});
  }, []);

  const colors = ['bg-brand-600', 'bg-amber-500', 'bg-slate-600'];
  const rows: DimStat[] | undefined = dims?.[dimTab];
  const dimTotal = rows?.reduce((s, r) => s + r.total, 0) ?? 0;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {(overview ? OVERVIEW_ITEMS : []).map((o) => (
          <div key={o.key} className="card">
            <div className="text-sm text-slate-500">{o.label}</div>
            <div className={`mt-1 text-3xl font-bold tabular-nums ${o.tone}`}>{overview![o.key]}</div>
            <div className="mt-1 text-xs text-slate-400">共 {overview!.total} 份合同</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {cats.map((c, i) => (
          <div key={c.key} className="card">
            <div className="flex items-center gap-2">
              <span className={`h-3 w-3 rounded-full ${colors[i % colors.length]}`} />
              <span className="text-sm font-medium text-slate-600">{c.label}</span>
            </div>
            <div className="mt-2 flex items-baseline gap-3">
              <span className="text-3xl font-bold tabular-nums">{c.total}</span>
              <span className="text-xs text-slate-400">份（在履行 {c.active}）</span>
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">
              {c.types
                .filter((t) => t.total > 0)
                .map((t) => (
                  <span key={t.type} className="rounded bg-slate-100 px-2 py-0.5 text-xs text-slate-600">
                    {t.type} {t.total}
                  </span>
                ))}
              {!c.types.some((t) => t.total > 0) && <span className="text-xs text-slate-300">暂无</span>}
            </div>
          </div>
        ))}
      </div>

      {rows && (
        <div className="card">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            {DIM_TABS.map((t) => (
              <button
                key={t.key}
                className={`rounded-full px-3 py-1 text-sm ${dimTab === t.key ? 'bg-brand-600 font-medium text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                onClick={() => setDimTab(t.key)}
              >
                {t.label}
              </button>
            ))}
            <span className="ml-auto text-xs text-slate-400">共 {dimTotal} 份（已删除合同不计入）</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[480px] text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-4">{DIM_TABS.find((t) => t.key === dimTab)!.label.replace('按', '')}</th>
                  <th className="py-2 pr-4 text-right">合同数</th>
                  <th className="py-2 pr-4 text-right">在履行</th>
                  {showMoney && (
                    <th className="py-2 text-right">
                      金额合计（元）
                      <span className="ml-1 font-normal text-slate-400">※</span>
                    </th>
                  )}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.dim} className="border-b border-slate-100">
                    <td className="py-2 pr-4 text-slate-700">{r.dim}</td>
                    <td className="py-2 pr-4 text-right tabular-nums">{r.total}</td>
                    <td className="py-2 pr-4 text-right tabular-nums text-emerald-600">{r.active}</td>
                    {showMoney && (
                      <td className="py-2 text-right tabular-nums">
                        {fmtMoney(r.amount_sum ?? 0)}
                        {r.amount_other ? (
                          <span className="ml-1 text-xs text-slate-400">+{r.amount_other} 份单价类</span>
                        ) : null}
                      </td>
                    )}
                  </tr>
                ))}
                {!rows.length && (
                  <tr>
                    <td colSpan={showMoney ? 4 : 3} className="py-6 text-center text-slate-400">
                      暂无数据
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          {showMoney && (
            <p className="mt-2 text-xs text-slate-400">
              ※ 仅统计单位为「元」的固定总额；元/时/人 等单价类金额需乘以人数与周期，不直接相加（以「N 份单价类」提示）。
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default function ContractsPage() {
  const { user } = useAuth();
  const canAdd = user!.role === 'admin' || user!.role === 'staff';
  const showMoney = canSeeMoney(user!.role);

  const [data, setData] = useState<{ total: number; contracts: Contract[] }>({ total: 0, contracts: [] });
  const [q, setQ] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [owners, setOwners] = useState<{ id: number; name: string }[]>([]);
  const [ownerId, setOwnerId] = useState('');
  const [error, setError] = useState('');
  const [exporting, setExporting] = useState(false);

  const fetchList = useCallback(async () => {
    setError('');
    try {
      const params = new URLSearchParams({ page: String(page), page_size: '20' });
      if (q) params.set('q', q);
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (ownerId) params.set('owner_id', ownerId);
      const d = await api<{ total: number; contracts: Contract[]; pages?: number }>(`/contracts?${params}`);
      setData(d);
      setPages(Math.max(1, Math.ceil(d.total / 20)));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [q, type, status, ownerId, page]);

  // 负责人列表加载失败时自动重试（每次渲染后检查，拿到数据即停止）
  useEffect(() => {
    if (owners.length) return;
    api<{ owners: { id: number; name: string }[] }>('/owners')
      .then((d) => setOwners(d.owners))
      .catch(() => {});
  });

  async function exportContracts() {
    setExporting(true);
    try {
      const params = new URLSearchParams();
      if (q) params.set('q', q);
      if (type) params.set('type', type);
      if (status) params.set('status', status);
      if (ownerId) params.set('owner_id', ownerId);
      const token = getToken();
      const res = await fetch(`/api/contract/contracts/export?${params}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
      });
      if (!res.ok) throw new Error('导出失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `合同台账_${new Date().toISOString().slice(0, 10)}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setExporting(false);
    }
  }

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  return (
    <div className="space-y-4">
      <Dashboard showMoney={showMoney} />

      <div className="flex flex-wrap items-center gap-2">
        <input
          className="input max-w-xs"
          placeholder="搜索合同名称 / 编号 / 单位"
          value={q}
          onChange={(e) => {
            setPage(1);
            setQ(e.target.value);
          }}
        />
        <select
          className="select max-w-[10rem]"
          value={type}
          onChange={(e) => {
            setPage(1);
            setType(e.target.value);
          }}
        >
          <option value="">全部类型</option>
          {CONTRACT_TYPES.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select
          className="select max-w-[12rem]"
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value);
          }}
        >
          {statusOptions(user!.role === 'admin').map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select
          className="select max-w-[10rem]"
          value={ownerId}
          onChange={(e) => {
            setPage(1);
            setOwnerId(e.target.value);
          }}
        >
          <option value="">全部负责人</option>
          {owners.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name}
            </option>
          ))}
        </select>
        {showMoney && (
          <button className="btn-plain" disabled={exporting} onClick={exportContracts}>
            {exporting ? '导出中…' : '⬇ 导出 Excel'}
          </button>
        )}
        {canAdd && (
          <button className="btn-primary ml-auto" onClick={() => setShowCreate(true)}>
            ＋ 新增合同
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}

      <div className="overflow-x-auto rounded-xl bg-white shadow-sm">
        <table className="w-full min-w-[900px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
              <th className="px-4 py-3">编号</th>
              <th className="px-4 py-3">合同名称</th>
              <th className="px-4 py-3">类型</th>
              <th className="px-4 py-3">对方单位</th>
              <th className="px-4 py-3">负责人</th>
              <th className="px-4 py-3">生效 ~ 到期</th>
              {showMoney && <th className="px-4 py-3 text-right">金额</th>}
              <th className="px-4 py-3">状态</th>
              <th className="px-4 py-3 text-right">操作</th>
            </tr>
          </thead>
          <tbody>
            {data.contracts.map((c) => (
              <tr key={c.id} className="border-b border-slate-100 hover:bg-slate-50">
                <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-slate-500">
                  <Link className="hover:text-brand-600" to={`/contracts/${c.id}`}>
                    {c.code}
                  </Link>
                </td>
                <td className="px-4 py-3">
                  <Link className="font-medium hover:text-brand-600" to={`/contracts/${c.id}`}>
                    {c.name}
                  </Link>
                </td>
                <td className="px-4 py-3 text-slate-600">{c.type}</td>
                <td className="px-4 py-3 text-slate-600">{c.customer_name}</td>
                <td className="px-4 py-3 text-slate-600">{c.owner_name ?? '—'}</td>
                <td className="whitespace-nowrap px-4 py-3 text-slate-600">
                  {fmtDate(c.start_date)} ~ {fmtDate(c.end_date)}
                </td>
                {showMoney && (
                  <td className="whitespace-nowrap px-4 py-3 text-right tabular-nums">
                    {fmtMoney(c.amount)}
                    {c.amount_unit ? <span className="ml-1 text-xs text-slate-400">{c.amount_unit}</span> : null}
                  </td>
                )}
                <td className="px-4 py-3">
                  <span className={`badge ${STATUS_COLORS[c.display_status] ?? ''}`}>{c.display_status}</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <Link className="btn-plain" to={`/contracts/${c.id}`}>
                    详情
                  </Link>
                </td>
              </tr>
            ))}
            {!data.contracts.length && (
              <tr>
                <td colSpan={showMoney ? 9 : 8} className="px-4 py-10 text-center text-slate-400">
                  {error ? '加载失败' : '暂无合同，点击右上角「新增合同」开始录入'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-slate-500">
        <span>共 {data.total} 份合同</span>
        <div className="flex items-center gap-2">
          <button className="btn-plain" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            上一页
          </button>
          <span>
            {page} / {pages}
          </span>
          <button className="btn-plain" disabled={page >= pages} onClick={() => setPage(page + 1)}>
            下一页
          </button>
        </div>
      </div>

      {showCreate && (
        <Modal title="新增合同" onClose={() => setShowCreate(false)} wide>
          <ContractForm
            initial={null}
            onDone={() => {
              setShowCreate(false);
              fetchList();
            }}
            onCancel={() => setShowCreate(false)}
          />
        </Modal>
      )}
    </div>
  );
}
