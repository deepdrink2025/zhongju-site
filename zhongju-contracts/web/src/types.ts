export type Role = 'admin' | 'contract_admin' | 'staff';

export const LOGIN_ROLES: Role[] = ['admin', 'contract_admin'];

export interface AuthUser {
  id: number;
  name: string;
  username: string;
  role: Role;
}

export interface UserRow extends AuthUser {
  status: string;
  created_at: string;
}

export interface Customer {
  id: number;
  name: string;
  contact: string | null;
  phone: string | null;
  address: string | null;
  status: string;
}

export interface Contract {
  id: number;
  code: string;
  name: string;
  type: string;
  our_entity: string | null;
  customer_id: number;
  customer_name: string;
  owner_user_id: number;
  owner_name: string | null;
  amount?: number | null;
  amount_unit?: string | null;
  invoice_type?: string | null;
  settle_type: string | null;
  headcount: number | null;
  sign_date: string;
  start_date: string;
  end_date: string;
  renewal_type: string | null;
  storage_location: string | null;
  status: string;
  terminate_reason: string | null;
  deleted_at: string | null;
  display_status: string;
  days_to_expiry: number | null;
}

export interface FileRow {
  id: number;
  contract_id: number;
  original_name: string;
  size: number;
  uploaded_by_name?: string;
  created_at: string;
}

export interface LogRow {
  id: number;
  user_name: string | null;
  action: string;
  detail: string | null;
  created_at: string;
}

export interface LoginLogRow {
  id: number;
  username: string;
  user_name: string | null;
  ip: string;
  success: number;
  created_at: string;
}

export const CONTRACT_TYPES = [
  '劳务派遣',
  '劳务外包',
  '代理招聘',
  '人事托管',
  '政府采购合同',
  '合伙人合作协议',
  '内部人员劳动合同',
  '其他',
];

export const SETTLE_TYPES = ['月结', '季结', '半年结', '年结', '其他'];
export const RENEWAL_TYPES = ['自动续签', '需重新签订'];

export const OUR_ENTITIES = ['中聚', '善良', '恒潮', '汇仕铭', '易才'];

export const INVOICE_TYPES = ['全额专票', '全额普票', '差额专票', '差额普票'];
export const AMOUNT_UNITS = ['元', '元/时/人', '元/天/人', '元/月/人'];

export const CONTRACT_CATEGORIES = [
  { key: 'external', label: '对外业务合同', types: ['劳务派遣', '劳务外包', '代理招聘', '人事托管', '其他'] },
  { key: 'government', label: '政府采购类合同', types: ['政府采购合同'] },
  { key: 'internal', label: '内部管理类合同', types: ['合伙人合作协议', '内部人员劳动合同'] },
];

export interface CategoryStat {
  key: string;
  label: string;
  total: number;
  active: number;
  types: { type: string; total: number; active: number }[];
}

export interface StatsOverview {
  total: number;
  active: number;
  signed_this_month: number;
  expiring: number;
  expired: number;
}

export interface StatsResponse {
  categories: CategoryStat[];
  overview: StatsOverview;
}

export const ROLE_LABELS: Record<Role, string> = {
  admin: '主管理员',
  contract_admin: '合同管理员',
  staff: '业务人员（不登录）',
};

export const ACTION_LABELS: Record<string, string> = {
  create: '创建合同',
  update: '编辑合同',
  terminate: '终止合同',
  renew: '标记续签',
  delete: '删除合同',
  restore: '恢复合同',
  reactivate: '恢复合作',
  file_upload: '上传附件',
  file_delete: '删除附件',
};

export function canSeeMoney(role: Role) {
  return role === 'admin' || role === 'contract_admin';
}

export function fmtMoney(n: number | null | undefined) {
  if (n == null) return '—';
  return `¥${Number(n).toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function fmtDate(s: string | null) {
  if (!s) return '—';
  return String(s).slice(0, 10);
}

export function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

export const STATUS_COLORS: Record<string, string> = {
  生效中: 'bg-emerald-100 text-emerald-700',
  即将到期: 'bg-amber-100 text-amber-700',
  已到期: 'bg-red-100 text-red-700',
  已续签: 'bg-sky-100 text-sky-700',
  已终止: 'bg-slate-200 text-slate-600',
  已删除: 'bg-slate-200 text-slate-500',
};
