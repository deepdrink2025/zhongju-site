import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { api, downloadFile, getToken } from '../api';
import Modal from '../components/Modal';
import ContractForm from '../components/ContractForm';
import {
  ACTION_LABELS,
  STATUS_COLORS,
  canSeeMoney,
  fmtDate,
  fmtMoney,
  fmtSize,
} from '../types';
import type { Contract, FileRow, LogRow } from '../types';
import { useAuth } from '../App';

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs text-slate-400">{label}</div>
      <div className="mt-0.5 text-sm text-slate-800">{value ?? '—'}</div>
    </div>
  );
}

const TERMINATE_OPTIONS = ['到期不续签', '未到期提前终止', '协商解除', '其他'];

function TerminateModal({
  onConfirm,
  onClose,
}: {
  onConfirm: (reason: string) => void;
  onClose: () => void;
}) {
  const [type, setType] = useState(TERMINATE_OPTIONS[0]);
  const [note, setNote] = useState('');

  return (
    <Modal title="终止合同" onClose={onClose}>
      <div className="space-y-3">
        <div>
          <label className="label">终止原因 *</label>
          <div className="space-y-2">
            {TERMINATE_OPTIONS.map((o) => (
              <label key={o} className="flex cursor-pointer items-center gap-2 text-sm">
                <input
                  type="radio"
                  name="terminate-type"
                  checked={type === o}
                  onChange={() => setType(o)}
                />
                {o}
              </label>
            ))}
          </div>
        </div>
        <div>
          <label className="label">补充说明（选填）</label>
          <textarea
            className="input"
            rows={2}
            placeholder="如：对方单位提出终止合作"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
        <p className="text-xs text-slate-400">终止后合同状态变为「已终止」，可在操作日志中追溯；此操作不可自动撤销。</p>
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-plain" onClick={onClose}>
            取消
          </button>
          <button
            className="btn-primary"
            onClick={() => onConfirm(note.trim() ? `${type}：${note.trim()}` : type)}
          >
            确认终止
          </button>
        </div>
      </div>
    </Modal>
  );
}

function RenewModal({
  oldEnd,
  onConfirm,
  onClose,
}: {
  oldEnd: string;
  onConfirm: (dates: { sign_date: string; start_date: string; end_date: string }) => void;
  onClose: () => void;
}) {
  const today = new Date().toISOString().slice(0, 10);
  const old = new Date(oldEnd);
  const defaultEnd = Number.isNaN(old.getTime())
    ? today
    : new Date(old.setFullYear(old.getFullYear() + 1)).toISOString().slice(0, 10);
  const [signDate, setSignDate] = useState(today);
  const [startDate, setStartDate] = useState(today);
  const [endDate, setEndDate] = useState(defaultEnd);
  const invalid = !signDate || !startDate || !endDate || endDate < startDate;

  return (
    <Modal title="标记续签" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-sm text-slate-500">
          续签后合同状态变为「已续签」，并按下方新日期更新合同期限。如需同时录入新合同档案，请在台账中另行新增。
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div>
            <label className="label">新签订日期 *</label>
            <input className="input" type="date" value={signDate} onChange={(e) => setSignDate(e.target.value)} />
          </div>
          <div>
            <label className="label">新生效日期 *</label>
            <input className="input" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
          </div>
          <div>
            <label className="label">新到期日期 *</label>
            <input className="input" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
          </div>
        </div>
        {endDate && startDate && endDate < startDate && (
          <p className="text-sm text-red-600">到期日期不能早于生效日期</p>
        )}
        <div className="flex justify-end gap-2 pt-1">
          <button className="btn-plain" onClick={onClose}>
            取消
          </button>
          <button className="btn-primary" disabled={invalid} onClick={() => onConfirm({ sign_date: signDate, start_date: startDate, end_date: endDate })}>
            确认续签
          </button>
        </div>
      </div>
    </Modal>
  );
}

function PreviewModal({
  file,
  onClose,
}: {
  file: { url: string; name: string; kind: 'pdf' | 'img' };
  onClose: () => void;
}) {
  return (
    <Modal title={`预览：${file.name}`} onClose={onClose} wide>
      <div className="flex justify-center">
        {file.kind === 'pdf' ? (
          <iframe src={file.url} title={file.name} className="h-[70vh] w-full rounded-lg border border-slate-200" />
        ) : (
          <img src={file.url} alt={file.name} className="max-h-[70vh] max-w-full rounded-lg object-contain" />
        )}
      </div>
    </Modal>
  );
}

export default function ContractDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const contractId = Number(id);

  const [contract, setContract] = useState<Contract | null>(null);
  const [files, setFiles] = useState<FileRow[]>([]);
  const [logs, setLogs] = useState<LogRow[]>([]);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [showTerminate, setShowTerminate] = useState(false);
  const [showRenew, setShowRenew] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [preview, setPreview] = useState<{ url: string; name: string; kind: 'pdf' | 'img' } | null>(null);

  // 管理级角色：主管理员 / 合同管理员，可执行全部合同操作
  const isAdmin = user!.role === 'admin' || user!.role === 'contract_admin';
  const canEdit = isAdmin;
  // 生效中 / 已续签的合同都可编辑、终止；已终止的合同只保留删除/查看
  const isActiveLike = contract?.status === 'active' || contract?.status === 'renewed';

  const fetchAll = useCallback(async () => {
    try {
      const [c, f, l] = await Promise.all([
        api<{ contract: Contract }>(`/contracts/${contractId}`),
        api<{ files: FileRow[] }>(`/contracts/${contractId}/files`),
        api<{ logs: LogRow[] }>(`/contracts/${contractId}/logs`),
      ]);
      setContract(c.contract);
      setFiles(f.files);
      setLogs(l.logs);
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  }, [contractId]);

  useEffect(() => {
    fetchAll();
  }, [fetchAll]);

  async function patchStatus(
    action: string,
    extra?: { reason?: string; sign_date?: string; start_date?: string; end_date?: string }
  ): Promise<boolean> {
    try {
      await api(`/contracts/${contractId}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ action, ...extra }),
      });
      setShowTerminate(false);
      setShowRenew(false);
      fetchAll();
      return true;
    } catch (e) {
      alert((e as Error).message);
      return false;
    }
  }

  async function reactivate() {
    if (!(await patchStatus('reactivate'))) return;
    // 恢复成功后直接打开编辑弹窗，方便更新合同内容
    setTimeout(() => setEditing(true), 300);
  }

  async function removeContract() {
    if (!window.confirm(`确认删除合同 ${contract?.code}？删除后可在日志中追溯，管理员可恢复。`)) return;
    try {
      await api(`/contracts/${contractId}`, { method: 'DELETE' });
      alert('已删除');
      fetchAll();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function upload(file: File) {
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      await api(`/contracts/${contractId}/files`, { method: 'POST', body: fd });
      fetchAll();
    } catch (e) {
      alert((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  async function removeFile(f: FileRow) {
    if (!window.confirm(`确认删除附件「${f.original_name}」？`)) return;
    try {
      await api(`/files/${f.id}`, { method: 'DELETE' });
      fetchAll();
    } catch (e) {
      alert((e as Error).message);
    }
  }

  async function openPreview(f: FileRow) {
    const ext = f.original_name.toLowerCase().split('.').pop() ?? '';
    const kind: 'pdf' | 'img' = ext === 'pdf' ? 'pdf' : 'img';
    try {
      const res = await fetch(`/api/contract/files/${f.id}/download?inline=1`, {
        headers: getToken() ? { Authorization: `Bearer ${getToken()}` } : undefined,
      });
      if (!res.ok) throw new Error('预览失败');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setPreview({ url, name: f.original_name, kind });
    } catch (e) {
      alert((e as Error).message);
    }
  }

  function closePreview() {
    if (preview) URL.revokeObjectURL(preview.url);
    setPreview(null);
  }

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!contract) return <p className="text-sm text-slate-400">加载中…</p>;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-3">
        <Link to="/" className="btn-plain">
          ← 返回台账
        </Link>
        <h2 className="text-lg font-bold">
          {contract.code} · {contract.name}
        </h2>
        <span className={`badge ${STATUS_COLORS[contract.display_status] ?? ''}`}>{contract.display_status}</span>
        <div className="ml-auto flex gap-2">
          {canEdit && !contract.deleted_at && isActiveLike && (
            <button className="btn-primary" onClick={() => setEditing(true)}>
              编辑
            </button>
          )}
          {isAdmin && !contract.deleted_at && isActiveLike && (
            <button className="btn-plain" onClick={() => setShowRenew(true)}>
              标记续签
            </button>
          )}
          {canEdit && !contract.deleted_at && isActiveLike && (
            <button className="btn-danger" onClick={() => setShowTerminate(true)}>
              终止合同
            </button>
          )}
          {canEdit && !contract.deleted_at && contract.status === 'terminated' && (
            <button className="btn-primary" onClick={reactivate}>
              恢复合作
            </button>
          )}
          {isAdmin && !contract.deleted_at && (
            <button className="btn-danger" onClick={removeContract}>
              删除
            </button>
          )}
          {isAdmin && contract.deleted_at && (
            <button className="btn-plain" onClick={() => patchStatus('restore')}>
              恢复合同
            </button>
          )}
        </div>
      </div>

      {contract.deleted_at && (
        <p className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-600">
          此合同已被删除（{fmtDate(contract.deleted_at)}），仅管理员可见，可点击「恢复合同」找回。
        </p>
      )}
      {contract.status === 'terminated' && (
        <p className="rounded-lg bg-slate-100 px-4 py-2 text-sm text-slate-600">
          合同已终止{contract.terminate_reason ? `，原因：${contract.terminate_reason}` : ''}。
        </p>
      )}

      <div className="card">
        <h3 className="mb-3 text-sm font-semibold text-slate-500">基本信息</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field label="合同编号" value={contract.code} />
          <Field label="合同类型" value={contract.type} />
          <Field label="对方单位" value={contract.customer_name} />
          <Field label="我方签约主体" value={contract.our_entity} />
          <Field label="业务负责人" value={contract.owner_name} />
          <Field label="签订日期" value={fmtDate(contract.sign_date)} />
          <Field label="生效日期" value={fmtDate(contract.start_date)} />
          <Field
            label="到期日期"
            value={
              contract.days_to_expiry != null && contract.status === 'active'
                ? `${fmtDate(contract.end_date)}（${contract.days_to_expiry >= 0 ? `剩 ${contract.days_to_expiry} 天` : `已过期 ${-contract.days_to_expiry} 天`}）`
                : fmtDate(contract.end_date)
            }
          />
        </div>
        <h3 className="mb-3 mt-5 text-sm font-semibold text-slate-500">关键条款</h3>
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Field
            label="合同金额"
            value={
              canSeeMoney(user!.role)
                ? `${fmtMoney(contract.amount)}${contract.amount_unit ? ` ${contract.amount_unit}` : ''}`
                : '（无权查看）'
            }
          />
          <Field label="发票类型" value={contract.invoice_type} />
          <Field label="结算方式" value={contract.settle_type} />
          <Field label="服务人数" value={contract.headcount ?? '—'} />
          <Field label="续签方式" value={contract.renewal_type} />
          <div className="col-span-2 sm:col-span-4">
            <Field label="纸质合同存放位置" value={contract.storage_location} />
          </div>
        </div>
      </div>

      <div className="card">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-500">附件（扫描件 / 补充协议）</h3>
          {canEdit && !contract.deleted_at && (
            <label className={`btn-primary cursor-pointer ${uploading ? 'pointer-events-none opacity-60' : ''}`}>
              {uploading ? '上传中…' : '＋ 上传附件'}
              <input
                type="file"
                className="hidden"
                accept=".pdf,.jpg,.jpeg,.png"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) upload(f);
                  e.target.value = '';
                }}
              />
            </label>
          )}
        </div>
        {files.length ? (
          <table className="w-full text-sm">
            <tbody>
              {files.map((f) => (
                <tr key={f.id} className="border-b border-slate-100">
                  <td className="py-2">{f.original_name}</td>
                  <td className="py-2 text-xs text-slate-400">{fmtSize(f.size)}</td>
                  <td className="py-2 text-xs text-slate-400">
                    {f.uploaded_by_name ?? ''} · {fmtDate(f.created_at)}
                  </td>
                  <td className="py-2 text-right">
                    <button className="btn-plain" onClick={() => openPreview(f)}>
                      预览
                    </button>
                    <button className="btn-plain ml-2" onClick={() => downloadFile(f.id, f.original_name)}>
                      下载
                    </button>
                    {canEdit && (
                      <button className="btn-danger ml-2" onClick={() => removeFile(f)}>
                        删除
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <p className="text-sm text-slate-400">暂无附件</p>
        )}
      </div>

      <div className="card">
        <h3 className="mb-3 text-sm font-semibold text-slate-500">操作日志</h3>
        {logs.length ? (
          <ul className="space-y-2 text-sm">
            {logs.map((l) => (
              <li key={l.id} className="flex flex-wrap gap-2 text-slate-600">
                <span className="text-xs text-slate-400">{fmtDate(l.created_at)}</span>
                <span className="font-medium text-slate-700">{l.user_name ?? '系统'}</span>
                <span>{ACTION_LABELS[l.action] ?? l.action}</span>
                {l.detail && l.action === 'update' && (
                  <span className="text-xs text-slate-400">
                    改动：{(JSON.parse(l.detail) as { changed?: string[] }).changed?.join('、') ?? ''}
                  </span>
                )}
                {l.detail && (l.action === 'terminate' || l.action === 'delete' || l.action === 'file_upload' || l.action === 'file_delete') && (
                  <span className="text-xs text-slate-400">
                    {(() => {
                      try {
                        const d = JSON.parse(l.detail) as Record<string, unknown>;
                        return d.reason ? `原因：${d.reason}` : `${(d.file as string) ?? (d.code as string) ?? ''}`;
                      } catch {
                        return '';
                      }
                    })()}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">暂无日志</p>
        )}
      </div>

      {showTerminate && (
        <TerminateModal onConfirm={(reason) => patchStatus('terminate', { reason })} onClose={() => setShowTerminate(false)} />
      )}

      {preview && <PreviewModal file={preview} onClose={closePreview} />}

      {showRenew && (
        <RenewModal
          oldEnd={contract.end_date}
          onConfirm={(dates) => patchStatus('renew', dates)}
          onClose={() => setShowRenew(false)}
        />
      )}

      {editing && (
        <Modal title={`编辑合同 ${contract.code}`} onClose={() => setEditing(false)} wide>
          <ContractForm
            initial={contract}
            contractId={contract.id}
            onDone={() => {
              setEditing(false);
              fetchAll();
            }}
            onCancel={() => setEditing(false)}
          />
        </Modal>
      )}
    </div>
  );
}
