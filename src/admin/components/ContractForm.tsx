import { useEffect, useState } from 'react';
import { contractApi as api } from '../api';
import Combobox from './Combobox';
import { CONTRACT_TYPES, INVOICE_TYPES, AMOUNT_UNITS, OUR_ENTITIES, RENEWAL_TYPES, SETTLE_TYPES, canSeeMoney, fmtSize, isInternalContract, defaultInvoiceType, DEFAULT_INTERNAL_INVOICE_TYPE } from '../types';
import type { Contract, Customer, UserRow } from '../types';
import { useAuth } from '../auth';
import { LOGIN_ROLES } from '../types';

type FormState = Record<string, string>;

function toForm(c: Contract | null): FormState {
  return {
    code: c?.code ?? '',
    name: c?.name ?? '',
    type: c?.type ?? CONTRACT_TYPES[0],
    our_entity: c?.our_entity ?? '',
    customer_name: c?.customer_name ?? '',
    owner_user_id: c ? String(c.owner_user_id) : '',
    amount: c?.amount != null ? String(c.amount) : '',
    amount_unit: c?.amount_unit ?? '元',
    invoice_type: c?.invoice_type ?? defaultInvoiceType(c?.type ?? CONTRACT_TYPES[0]),
    settle_type: c?.settle_type ?? '',
    headcount: c?.headcount != null ? String(c.headcount) : '',
    sign_date: c?.sign_date?.slice(0, 10) ?? '',
    start_date: c?.start_date?.slice(0, 10) ?? '',
    end_date: c?.end_date?.slice(0, 10) ?? '',
    renewal_type: c?.renewal_type ?? '',
    storage_location: c?.storage_location ?? '',
  };
}

export default function ContractForm({
  initial,
  contractId,
  onDone,
  onCancel,
}: {
  initial: Contract | null;
  contractId?: number;
  onDone: () => void;
  onCancel: () => void;
}) {
  const { user } = useAuth();
  const role = user!.role;
  const showMoney = canSeeMoney(role);
  const canManage = LOGIN_ROLES.includes(role);
  const [form, setForm] = useState<FormState>(() => toForm(initial));
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  // 内部管理类合同（合伙人合作协议 / 内部人员劳动合同）不涉及开票与金额
  const isInternal = isInternalContract(form.type);

  useEffect(() => {
    api<{ customers: Customer[] }>('/customers').then((d) => setCustomers(d.customers));
    if (canManage) {
      api<{ users: UserRow[] }>('/users').then((d) =>
        setUsers(d.users.filter((u) => u.status === 'active'))
      );
    }
  }, [canManage]);

  function set(key: string, value: string) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  /** 切换合同类型：切到内部管理类合同时，发票类型自动归到差额专票（切换回来时保留原选择） */
  function setType(type: string) {
    setForm((f) => ({
      ...f,
      type,
      invoice_type: isInternalContract(type) ? DEFAULT_INTERNAL_INVOICE_TYPE : f.invoice_type,
    }));
  }

  async function submit() {
    // 提交前前端必选校验，避免填一半就被服务端打回
    const missing: string[] = [];
    if (!form.name.trim()) missing.push('合同名称');
    if (!form.customer_name.trim()) missing.push('对方单位');
    if (canManage && !form.owner_user_id) missing.push('业务负责人');
    if (!form.sign_date) missing.push('签订日期');
    if (!form.start_date) missing.push('生效日期');
    if (!form.end_date) missing.push('到期日期');
    if (missing.length) {
      setError(`请填写必填项：${missing.join('、')}`);
      return;
    }
    if (form.start_date && form.end_date && form.end_date < form.start_date) {
      setError('到期日期不能早于生效日期');
      return;
    }
    setBusy(true);
    setError('');
    try {
      let targetId: number;
      const body = {
        code: form.code || null,
        name: form.name,
        type: form.type,
        our_entity: form.our_entity || null,
        customer_name: form.customer_name,
        owner_user_id: canManage ? Number(form.owner_user_id) || null : null,
        amount: showMoney && !isInternal && form.amount !== '' ? form.amount : null,
        amount_unit: showMoney && !isInternal ? form.amount_unit || null : null,
        invoice_type: isInternal ? DEFAULT_INTERNAL_INVOICE_TYPE : form.invoice_type,
        settle_type: form.settle_type || null,
        headcount: form.headcount !== '' ? form.headcount : null,
        sign_date: form.sign_date,
        start_date: form.start_date,
        end_date: form.end_date,
        renewal_type: form.renewal_type || null,
        storage_location: form.storage_location || null,
      };
      if (contractId) {
        await api(`/contracts/${contractId}`, { method: 'PUT', body: JSON.stringify(body) });
        targetId = contractId;
      } else {
        const d = await api<{ id: number }>('/contracts', { method: 'POST', body: JSON.stringify(body) });
        targetId = d.id;
      }
      const failed: string[] = [];
      for (const f of pendingFiles) {
        try {
          const fd = new FormData();
          fd.append('file', f);
          await api(`/contracts/${targetId}/files`, { method: 'POST', body: fd });
        } catch {
          failed.push(f.name);
        }
      }
      if (failed.length) alert(`合同已保存，但以下附件上传失败，可在详情页重试：\n${failed.join('\n')}`);
      onDone();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="space-y-4"
    >
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className={contractId ? '' : 'sm:col-span-2'}>
          <label className="label">合同编号{contractId ? '' : '（留空则自动生成 HT-YYYY-NNNN）'}</label>
          <input
            className="input"
            placeholder={contractId ? initial?.code : '如 HT-2026-0001 或自定义编号'}
            value={form.code}
            onChange={(e) => set('code', e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">合同名称 *</label>
          <input className="input" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </div>
        <div>
          <label className="label">合同类型 *</label>
          <Combobox
            value={form.type}
            options={CONTRACT_TYPES.map((t) => ({ label: t, value: t }))}
            onChange={setType}
            editable={false}
          />
        </div>
        <div>
          <label className="label">对方单位 *</label>
          <Combobox
            placeholder="输入单位名称"
            value={form.customer_name}
            options={customers.map((c) => ({ label: c.name, value: c.name }))}
            onChange={(v) => set('customer_name', v)}
          />
        </div>
        <div>
          <label className="label">我方签约主体（可选可输入）</label>
          <Combobox
            placeholder="选择或输入主体名称"
            value={form.our_entity}
            options={OUR_ENTITIES.map((e) => ({ label: e, value: e }))}
            onChange={(v) => set('our_entity', v)}
          />
        </div>
        {canManage && (
          <div>
            <label className="label">业务负责人 *</label>
            <Combobox
              value={users.find((u) => String(u.id) === form.owner_user_id)?.name ?? ''}
              options={users.map((u) => ({ label: u.name, value: String(u.id) }))}
              onChange={(v) => set('owner_user_id', v)}
              placeholder="请选择"
              editable={false}
            />
          </div>
        )}
        {!isInternal && (
          <div>
            <label className="label">发票类型 *</label>
            <Combobox
              value={form.invoice_type}
              options={INVOICE_TYPES.map((t) => ({ label: t, value: t }))}
              onChange={(v) => set('invoice_type', v)}
              editable={false}
            />
          </div>
        )}
        {showMoney && !isInternal && (
          <div className="sm:col-span-2">
            <label className="label">合同金额（选填，仅登录账号可见）</label>
            <div className="flex gap-2">
              <input
                className="input w-36 shrink-0"
                type="number"
                min="0"
                step="0.01"
                value={form.amount}
                onChange={(e) => set('amount', e.target.value)}
              />
              <Combobox
                wrapperClassName="w-28 shrink-0"
                inputClassName="input pr-6"
                placeholder="单位"
                value={form.amount_unit}
                options={AMOUNT_UNITS.map((u) => ({ label: u, value: u }))}
                onChange={(v) => set('amount_unit', v)}
              />
            </div>
          </div>
        )}
        {showMoney && (
          <div>
            <label className="label">结算方式</label>
            <Combobox
              value={form.settle_type === '' ? '未设置' : form.settle_type}
              options={[{ label: '未设置', value: '' }, ...SETTLE_TYPES.map((t) => ({ label: t, value: t }))]}
              onChange={(v) => set('settle_type', v)}
              editable={false}
            />
          </div>
        )}
        <div>
          <label className="label">服务人数</label>
          <input
            className="input"
            type="number"
            min="0"
            value={form.headcount}
            onChange={(e) => set('headcount', e.target.value)}
          />
        </div>
        <div>
          <label className="label">签订日期 *</label>
          <input className="input" type="date" value={form.sign_date} onChange={(e) => set('sign_date', e.target.value)} />
        </div>
        <div>
          <label className="label">生效日期 *</label>
          <input className="input" type="date" value={form.start_date} onChange={(e) => set('start_date', e.target.value)} />
        </div>
        <div>
          <label className="label">到期日期 *</label>
          <input className="input" type="date" value={form.end_date} onChange={(e) => set('end_date', e.target.value)} />
        </div>
        <div>
          <label className="label">续签方式</label>
          <Combobox
            value={form.renewal_type === '' ? '未设置' : form.renewal_type}
            options={[{ label: '未设置', value: '' }, ...RENEWAL_TYPES.map((t) => ({ label: t, value: t }))]}
            onChange={(v) => set('renewal_type', v)}
            editable={false}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">纸质合同存放位置（选填）</label>
          <input
            className="input"
            placeholder="如：档案柜 A-3 第二层"
            value={form.storage_location}
            onChange={(e) => set('storage_location', e.target.value)}
          />
        </div>
        <div className="sm:col-span-2">
          <label className="label">合同扫描件（PDF / 图片，可多选，单文件 ≤10MB，保存时自动上传）</label>
          <label className="btn-plain inline-flex cursor-pointer items-center gap-2">
            📎 选择文件
            <input
              type="file"
              className="hidden"
              multiple
              accept=".pdf,.jpg,.jpeg,.png"
              onChange={(e) => {
                const chosen = Array.from(e.target.files ?? []);
                setPendingFiles((prev) => [...prev, ...chosen.filter((f) => !prev.some((p) => p.name === f.name && p.size === f.size))]);
                e.target.value = '';
              }}
            />
          </label>
          {pendingFiles.length > 0 && (
            <div className="mt-2 space-y-1">
              {pendingFiles.map((f, i) => (
                <div key={`${f.name}-${f.size}-${i}`} className="flex items-center justify-between rounded bg-slate-50 px-3 py-1.5 text-sm">
                  <span className="truncate text-slate-700">
                    {f.name} <span className="text-xs text-slate-400">{fmtSize(f.size)}</span>
                  </span>
                  <button
                    type="button"
                    className="ml-3 text-slate-400 hover:text-red-500"
                    onClick={() => setPendingFiles((prev) => prev.filter((_, j) => j !== i))}
                  >
                    移除
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" className="btn-plain" onClick={onCancel}>
          取消
        </button>
        <button type="submit" className="btn-primary" disabled={busy}>
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
}
