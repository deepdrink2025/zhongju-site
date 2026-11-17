import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, contractApi } from '../api';
import { useAuth } from '../auth';
import type { StatsResponse } from '../types';

interface Quota {
  used: number;
  limit: number;
  remaining: number;
}

export default function Dashboard() {
  const { user } = useAuth();
  const [quota, setQuota] = useState<Quota | null>(null);
  const [myCards, setMyCards] = useState<number | null>(null);
  const [allCards, setAllCards] = useState<{ total: number; active: number; disabled: number } | null>(null);
  const [stats, setStats] = useState<StatsResponse | null>(null);

  useEffect(() => {
    const tasks: Promise<unknown>[] = [];
    if (user?.role === 'admin') {
      tasks.push(
        api<{ quota: Quota }>('/quota')
          .then((d) => setQuota(d.quota))
          .catch(() => setQuota(null)),
        api<{ total: number }>('/cards/mine?limit=1')
          .then((d) => setMyCards(d.total))
          .catch(() => setMyCards(null)),
        api<{ counts: { total: number; active: number; disabled: number } }>('/cards?limit=1')
          .then((d) => setAllCards(d.counts))
          .catch(() => setAllCards(null))
      );
    }
    tasks.push(
      contractApi<StatsResponse>('/contracts/stats')
        .then(setStats)
        .catch(() => setStats(null))
    );
    void Promise.allSettled(tasks);
  }, [user]);

  const card = (label: string, value: string, hint?: string) => (
    <div className="rounded-xl bg-white p-5 shadow-sm">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-400">{hint}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-bold text-slate-900">工作台</h1>
        <p className="mt-1 text-sm text-slate-500">
          {user?.name}，欢迎回来。名片与合同已统一到本后台，右上角可修改密码。
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {quota && card('今日名片配额', `${quota.used} / ${quota.limit}`, `剩余 ${quota.remaining} 张`)}
        {myCards !== null && card('我的名片', String(myCards), '本人创建并管理')}
        {allCards && card('全部名片', String(allCards.total), `正常 ${allCards.active} · 停用 ${allCards.disabled}`)}
        {stats &&
          card('合同总数', String(stats.overview.total), `生效中 ${stats.overview.active} · 30 天内到期 ${stats.overview.expiring}`)}
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        {user?.role === 'admin' && (
          <Link to="/admin/cards" className="rounded-xl bg-white p-5 shadow-sm transition hover:shadow-md">
            <p className="font-semibold text-slate-900">名片管理</p>
            <p className="mt-1 text-sm text-slate-500">生成专属名片、编辑资料、管理短链与二维码</p>
          </Link>
        )}
        <Link to="/admin/contracts" className="rounded-xl bg-white p-5 shadow-sm transition hover:shadow-md">
          <p className="font-semibold text-slate-900">合同管理</p>
          <p className="mt-1 text-sm text-slate-500">合同台账、续签、终止与附件归档</p>
        </Link>
        {(user?.role === 'admin' || user?.role === 'contract_admin') && (
          <Link to="/admin/users" className="rounded-xl bg-white p-5 shadow-sm transition hover:shadow-md">
            <p className="font-semibold text-slate-900">用户管理</p>
            <p className="mt-1 text-sm text-slate-500">登录账号与角色（主管理员 / 合同管理员）</p>
          </Link>
        )}
      </div>
    </div>
  );
}
