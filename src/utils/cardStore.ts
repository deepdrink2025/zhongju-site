import { CARD_API_BASE } from '../config';
import { AUTH_EXPIRED_EVENT, getToken, setToken } from '../admin/api';
import type { CardData } from './cardCodec';

/** 名片记录（与服务端契约对齐） */
export interface CardRecord extends CardData {
  id: string;
  shortCode: string;
  status: 'active' | 'disabled';
  ownerUserId?: number | null;
  ownerName?: string | null;
  createdAt: number;
  updatedAt: number;
  permissions?: { edit: boolean; delete: boolean };
}

export const DAILY_GEN_LIMIT = 5;

export interface Quota {
  used: number;
  limit: number;
  remaining: number;
  resetAt: number;
  timeZone: string;
}

export interface Counts {
  total: number;
  active: number;
  disabled: number;
}

export interface ListOptions {
  keyword?: string;
  status?: 'all' | 'active' | 'disabled';
  offset?: number;
  limit?: number;
}

export type FetchResult =
  | { status: 'active'; record: CardRecord }
  | { status: 'disabled' }
  | { status: 'notfound' }
  | { status: 'error'; error: string };
export type CreateOutcome = { ok: true; record: CardRecord } | { ok: false; error: string };
export type ListOutcome =
  | { ok: true; items: CardRecord[]; total: number; counts: Counts }
  | { ok: false; error: string };

interface ApiResult {
  ok?: boolean;
  error?: string;
  record?: CardRecord;
  items?: CardRecord[];
  total?: number;
  counts?: Counts;
  quota?: Quota;
  status?: string;
}

function expireAuth() {
  setToken(null);
  try {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  } catch {
    /* ignore */
  }
}

const headers = () => {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
};

async function request(
  path: string,
  init: RequestInit = {}
): Promise<{ response: Response; data: ApiResult }> {
  const controller = new AbortController(),
    timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const response = await fetch(`${CARD_API_BASE}${path}`, {
      ...init,
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = (await response
      .json()
      .catch(() => ({ error: '服务器响应格式不正确' }))) as ApiResult;
    if (response.status === 401 && init.headers) expireAuth();
    return { response, data };
  } finally {
    window.clearTimeout(timer);
  }
}

/** 名片字段校验（与服务端规则保持一致） */
export function validateCardData(data: CardData): string | null {
  if (!data.name.trim()) return '请填写姓名';
  if (data.name.trim().length > 12) return '姓名不能超过 12 个字';
  if (!/^1\d{10}$/.test(data.phone.trim())) return '请填写正确的 11 位手机号';
  if (data.title.trim().length > 20) return '职位不能超过 20 个字';
  if (data.department.trim().length > 20) return '部门不能超过 20 个字';
  if (data.wechat.trim().length > 30) return '微信号过长';
  if (data.bio.trim().length > 60) return '一句话介绍不能超过 60 个字';
  return null;
}

export function cardUrlOfCode(code: string): string {
  return `${window.location.origin}/card/${code}`;
}

export async function createCardAsync(data: CardData): Promise<CreateOutcome> {
  try {
    const result = await request('/api/cards', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!result.response.ok || !result.data.record)
      return { ok: false, error: result.data.error || '创建失败' };
    return { ok: true, record: result.data.record };
  } catch {
    return { ok: false, error: '网络异常，请稍后重试' };
  }
}

export async function updateCardAsync(code: string, data: CardData): Promise<CreateOutcome> {
  try {
    const result = await request(`/api/cards/${encodeURIComponent(code)}`, {
      method: 'PUT',
      headers: headers(),
      body: JSON.stringify(data),
    });
    return result.response.ok && result.data.record
      ? { ok: true, record: result.data.record }
      : { ok: false, error: result.data.error || '修改失败' };
  } catch {
    return { ok: false, error: '网络异常，请稍后重试' };
  }
}

export async function fetchEditableCardAsync(code: string): Promise<CreateOutcome> {
  try {
    const result = await request(`/api/cards/${encodeURIComponent(code)}/manage`, {
      headers: headers(),
    });
    return result.response.ok && result.data.record
      ? { ok: true, record: result.data.record }
      : { ok: false, error: result.data.error || '无法编辑该名片' };
  } catch {
    return { ok: false, error: '网络异常，请稍后重试' };
  }
}

export async function fetchCardAsync(code: string): Promise<FetchResult> {
  try {
    const { response, data } = await request(`/api/cards/${encodeURIComponent(code)}`);
    if (response.status === 404) return { status: 'notfound' };
    if (!response.ok || !data.ok) return { status: 'error', error: data.error || '加载失败' };
    if (data.status === 'disabled') return { status: 'disabled' };
    return data.record
      ? { status: 'active', record: data.record }
      : { status: 'error', error: '名片数据不完整' };
  } catch {
    return { status: 'error', error: '网络异常，请稍后重试' };
  }
}

export async function listMyCardsAsync(): Promise<CardRecord[]> {
  const records: CardRecord[] = [];
  for (let offset = 0; ; offset += 100) {
    const { response, data } = await request(`/api/cards/mine?limit=100&offset=${offset}`, {
      headers: headers(),
    });
    if (!response.ok || !data.ok) throw new Error(data.error || '我的名片加载失败');
    records.push(...(data.items || []));
    if (offset + (data.items?.length || 0) >= (data.total || 0) || !data.items?.length) break;
  }
  return records.sort((a, b) => b.createdAt - a.createdAt);
}

export async function removeCardAsync(code: string): Promise<boolean> {
  try {
    const { response } = await request(`/api/cards/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: headers(),
    });
    return response.ok || response.status === 404;
  } catch {
    return false;
  }
}

export async function setCardStatusAsync(
  code: string,
  status: CardRecord['status']
): Promise<boolean> {
  try {
    return (
      await request(`/api/cards/${encodeURIComponent(code)}/status`, {
        method: 'PATCH',
        headers: headers(),
        body: JSON.stringify({ status }),
      })
    ).response.ok;
  } catch {
    return false;
  }
}

export async function listAllCardsAsync(options: ListOptions = {}): Promise<ListOutcome> {
  try {
    const query = new URLSearchParams({
      limit: String(options.limit || 50),
      offset: String(options.offset || 0),
      q: options.keyword || '',
      status: options.status || 'all',
    });
    const { response, data } = await request(`/api/cards?${query}`, { headers: headers() });
    if (!response.ok || !data.ok) return { ok: false, error: data.error || '列表加载失败' };
    return {
      ok: true,
      items: data.items || [],
      total: data.total || 0,
      counts: data.counts || { total: 0, active: 0, disabled: 0 },
    };
  } catch {
    return { ok: false, error: '网络异常，请稍后重试' };
  }
}

export async function fetchQuotaAsync(): Promise<Quota | null> {
  try {
    const { response, data } = await request('/api/quota', { headers: headers() });
    return response.ok ? data.quota || null : null;
  } catch {
    return null;
  }
}

/** 管理员改派名片归属给指定账号 */
export async function assignCardOwnerAsync(code: string, userId: number): Promise<boolean> {
  try {
    return (
      await request(`/api/cards/${encodeURIComponent(code)}/owner`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ user_id: userId }),
      })
    ).response.ok;
  } catch {
    return false;
  }
}
