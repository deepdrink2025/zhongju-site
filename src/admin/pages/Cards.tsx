import { useState } from 'react';
import { CardCreatePanel } from '../../components/CardCreatePanel';
import AdminCardList from '../../components/AdminCardList';
import { useAuth } from '../auth';

type Tab = 'create' | 'all';

/** 名片管理：主管理员生成与管理全部名片（业务员已退出账号体系） */
export default function Cards() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('create');
  const canManageAll = user?.role === 'admin';

  return (
    <div>
      {canManageAll && (
        <div className="mb-4 flex gap-1 border-b border-slate-200">
          {(
            [
              ['create', '名片生成'],
              ['all', '全部名片'],
            ] as Array<[Tab, string]>
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setTab(key)}
              className={`relative px-4 py-2.5 text-sm font-semibold transition ${
                tab === key ? 'text-slate-900' : 'text-slate-400 hover:text-slate-600'
              }`}
            >
              {label}
              {tab === key && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-ct-600" />}
            </button>
          ))}
        </div>
      )}
      {canManageAll && tab === 'all' ? <AdminCardList /> : <CardCreatePanel />}
    </div>
  );
}
