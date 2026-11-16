import crypto from 'node:crypto';

export const ROLES = ['admin', 'finance', 'staff', 'viewer'];
export const ROLE_LABELS = { admin: '管理员', finance: '财务', staff: '业务员', viewer: '只读' };
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
export const INVOICE_TYPES = ['全额专票', '全额普票', '差额专票', '差额普票'];
export const AMOUNT_UNITS = ['元', '元/时/人', '元/天/人', '元/月/人'];
export const CONTRACT_CATEGORIES = [
  { key: 'external', label: '对外业务合同', types: ['劳务派遣', '劳务外包', '代理招聘', '人事托管', '其他'] },
  { key: 'government', label: '政府采购类合同', types: ['政府采购合同'] },
  { key: 'internal', label: '内部管理类合同', types: ['合伙人合作协议', '内部人员劳动合同'] },
];
export const TOKEN_EXPIRE_HOURS = Number(process.env.TOKEN_EXPIRE_HOURS || 12);
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
export const ALLOWED_MIME = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};
export const EXT_MIME = {
  '.pdf': 'application/pdf',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
};

export function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
  const hash = crypto.scryptSync(String(password), salt, 32).toString('hex');
  return { salt, hash };
}

export function verifyPassword(password, salt, expectedHash) {
  const hash = crypto.scryptSync(String(password), salt, 32);
  const expected = Buffer.from(expectedHash, 'hex');
  return hash.length === expected.length && crypto.timingSafeEqual(hash, expected);
}

export function sha256(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function canSeeMoney(role) {
  return role === 'admin' || role === 'finance';
}

function daysToExpiry(endDate, now) {
  if (!endDate) return null;
  const end = endDate instanceof Date ? endDate : new Date(endDate);
  if (Number.isNaN(end.getTime())) return null;
  const today = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const endDay = Date.UTC(end.getFullYear(), end.getMonth(), end.getDate());
  return Math.round((endDay - today) / 86400000);
}

export function computeDisplayStatus(row, now = new Date()) {
  if (row.deleted_at) return '已删除';
  if (row.status === 'terminated') return '已终止';
  if (row.status === 'renewed') return '已续签';
  const days = daysToExpiry(row.end_date, now);
  if (days === null) return '生效中';
  if (days < 0) return '已到期';
  if (days <= 30) return '即将到期';
  return '生效中';
}

export function sanitizeContract(row, role, now = new Date()) {
  const c = { ...row };
  if (!canSeeMoney(role)) delete c.amount;
  c.days_to_expiry = daysToExpiry(c.end_date, now);
  c.display_status = computeDisplayStatus(c, now);
  return c;
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v) => (v == null ? '' : String(v).trim());

export function validateContractInput(body) {
  const errors = [];
  let code = str(body.code);
  if (code && !/^[A-Za-z0-9_-]{1,20}$/.test(code)) {
    errors.push('合同编号仅限字母、数字、中划线、下划线，最长 20 位');
    code = null;
  }
  const name = str(body.name);
  if (!name || name.length > 200) errors.push('合同名称必填且不超过 200 字');
  const type = str(body.type);
  if (!CONTRACT_TYPES.includes(type)) errors.push('合同类型不合法');
  const customer_name = str(body.customer_name);
  if (!customer_name || customer_name.length > 200) errors.push('对方单位必填且不超过 200 字');
  const owner_user_id = Number(body.owner_user_id);
  if (!Number.isInteger(owner_user_id) || owner_user_id <= 0) errors.push('必须选择业务负责人');

  const pickDate = (label, v, required) => {
    const s = str(v);
    if (!s) {
      if (required) errors.push(`${label}必填`);
      return null;
    }
    if (!DATE_RE.test(s)) {
      errors.push(`${label}格式应为 YYYY-MM-DD`);
      return null;
    }
    return s;
  };
  const sign_date = pickDate('签订日期', body.sign_date, true);
  const start_date = pickDate('生效日期', body.start_date, true);
  const end_date = pickDate('到期日期', body.end_date, true);

  let amount = null;
  if (body.amount !== undefined && body.amount !== null && str(body.amount) !== '') {
    const n = Number(body.amount);
    if (!Number.isFinite(n) || n < 0 || n > 99999999999) errors.push('合同金额不合法');
    else amount = Math.round(n * 100) / 100;
  }
  const amount_unit = str(body.amount_unit) ? str(body.amount_unit).slice(0, 20) : null;
  const invoice_type = str(body.invoice_type);
  if (!INVOICE_TYPES.includes(invoice_type)) errors.push('请选择发票类型');

  let headcount = null;
  if (body.headcount !== undefined && body.headcount !== null && str(body.headcount) !== '') {
    const n = Number(body.headcount);
    if (!Number.isInteger(n) || n < 0 || n > 1000000) errors.push('服务人数不合法');
    else headcount = n;
  }

  const settle_type = str(body.settle_type) ? str(body.settle_type).slice(0, 20) : null;
  const renewalRaw = str(body.renewal_type);
  const renewal_type = renewalRaw ? (RENEWAL_TYPES.includes(renewalRaw) ? renewalRaw : null) : null;
  if (renewalRaw && !renewal_type) errors.push('续签方式不合法');
  const our_entity = str(body.our_entity) ? str(body.our_entity).slice(0, 200) : null;
  const storage_location = str(body.storage_location) ? str(body.storage_location).slice(0, 255) : null;

  return {
    errors,
    values: { code: code || null, name, type, our_entity, customer_name, owner_user_id, amount, amount_unit, invoice_type, settle_type, headcount, sign_date, start_date, end_date, renewal_type, storage_location },
  };
}

export function validateCustomerInput(body) {
  const errors = [];
  const name = str(body.name);
  if (!name || name.length > 200) errors.push('单位名称必填且不超过 200 字');
  const contact = str(body.contact) ? str(body.contact).slice(0, 50) : null;
  const phone = str(body.phone) ? str(body.phone).slice(0, 50) : null;
  const address = str(body.address) ? str(body.address).slice(0, 255) : null;
  const status = str(body.status) === 'inactive' ? 'inactive' : 'active';
  return { errors, values: { name, contact, phone, address, status } };
}
