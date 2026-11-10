import { CARD_API_BASE, CARD_SERVER_MODE } from '../config';
import { expireAuth, getRole, getToken } from './cardAuth';
import type { CardData } from './cardCodec';
import * as local from './cardService';
import type { CardRecord } from './cardService';
export { cardUrlOfCode, todayGenCount, DAILY_GEN_LIMIT, validateCardData } from './cardService';
export type { CardRecord };
export const IS_SERVER_MODE = CARD_SERVER_MODE;
export type FetchResult =
  | { status: 'active'; record: CardRecord }
  | { status: 'disabled' }
  | { status: 'notfound' }
  | { status: 'error'; error: string };
export type CreateOutcome = { ok: true; record: CardRecord } | { ok: false; error: string };
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
const headers = () => ({
  'Content-Type': 'application/json',
  ...(getToken() ? { Authorization: `Bearer ${getToken()}` } : {}),
});
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
export async function createCardAsync(data: CardData): Promise<CreateOutcome> {
  if (!IS_SERVER_MODE) return local.createCard(data);
  try {
    const result = await request('/api/cards', {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify(data),
    });
    if (!result.response.ok || !result.data.record)
      return { ok: false, error: result.data.error || '创建失败' };
    local.rememberCode(result.data.record.shortCode);
    return { ok: true, record: result.data.record };
  } catch {
    return { ok: false, error: '网络异常，请稍后重试' };
  }
}
export async function updateCardAsync(code: string, data: CardData): Promise<CreateOutcome> {
  if (!IS_SERVER_MODE) return local.updateCard(code, data);
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
  if (!IS_SERVER_MODE) {
    const found = local.getCardByCode(code);
    return found ? { ok: true, record: found } : { ok: false, error: '未找到该名片' };
  }
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
  if (!IS_SERVER_MODE) {
    const found = local.getCardByCode(code);
    return !found
      ? { status: 'notfound' }
      : found.status === 'disabled'
        ? { status: 'disabled' }
        : { status: 'active', record: found };
  }
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
  if (!IS_SERVER_MODE) return local.listMyRecords();
  const records = new Map<string, CardRecord>();
  for (let offset = 0; ; offset += 100) {
    const { response, data } = await request(`/api/cards/mine?limit=100&offset=${offset}`, {
      headers: headers(),
    });
    if (!response.ok || !data.ok) throw new Error(data.error || '本设备名片加载失败');
    for (const card of data.items || []) records.set(card.shortCode, card);
    if (offset + (data.items?.length || 0) >= (data.total || 0) || !data.items?.length) break;
  }
  // Old browser indexes only retain read access; public codes cannot grant ownership.
  for (const code of local.myCodes().filter((value) => !records.has(value))) {
    const result = await fetchCardAsync(code);
    if (result.status === 'notfound') local.forgetCode(code);
    else if (result.status === 'active')
      records.set(code, {
        ...result.record,
        permissions: { edit: getRole() === 'admin', delete: getRole() === 'admin' },
      });
    else if (result.status === 'disabled')
      records.set(code, {
        id: code,
        shortCode: code,
        name: '已停用',
        phone: '',
        title: '',
        department: '',
        wechat: '',
        bio: '',
        status: 'disabled',
        createdAt: 0,
        updatedAt: 0,
        permissions: { edit: getRole() === 'admin', delete: getRole() === 'admin' },
      });
  }
  return [...records.values()].sort((a, b) => b.createdAt - a.createdAt);
}
export async function removeCardAsync(code: string): Promise<boolean> {
  if (!IS_SERVER_MODE) {
    local.deleteCard(code);
    return true;
  }
  try {
    const { response } = await request(`/api/cards/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: headers(),
    });
    if (response.ok || response.status === 404) {
      local.forgetCode(code);
      return true;
    }
    return false;
  } catch {
    return false;
  }
}
export async function setCardStatusAsync(
  code: string,
  status: CardRecord['status']
): Promise<boolean> {
  if (!IS_SERVER_MODE) {
    local.setCardStatus(code, status);
    return true;
  }
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
  if (!IS_SERVER_MODE) {
    const keyword = (options.keyword || '').toLowerCase();
    const all = local
      .listMyRecords()
      .filter((card) =>
        [card.name, card.phone, card.shortCode, card.title, card.department].some((value) =>
          value.toLowerCase().includes(keyword)
        )
      );
    const counts = {
      total: all.length,
      active: all.filter((card) => card.status === 'active').length,
      disabled: all.filter((card) => card.status === 'disabled').length,
    };
    const filtered = all.filter(
        (card) => !options.status || options.status === 'all' || card.status === options.status
      ),
      offset = options.offset || 0;
    return {
      ok: true,
      items: filtered.slice(offset, offset + (options.limit || 50)),
      total: filtered.length,
      counts,
    };
  }
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
  if (!IS_SERVER_MODE) {
    const used = local.todayGenCount();
    return {
      used,
      limit: local.DAILY_GEN_LIMIT,
      remaining: Math.max(0, local.DAILY_GEN_LIMIT - used),
      resetAt: 0,
      timeZone: '',
    };
  }
  try {
    const { response, data } = await request('/api/quota', { headers: headers() });
    return response.ok ? data.quota || null : null;
  } catch {
    return null;
  }
}
export async function assignCardOwnerAsync(code: string, deviceId: string): Promise<boolean> {
  try {
    return (
      await request(`/api/cards/${encodeURIComponent(code)}/owner`, {
        method: 'PUT',
        headers: headers(),
        body: JSON.stringify({ deviceId }),
      })
    ).response.ok;
  } catch {
    return false;
  }
}
