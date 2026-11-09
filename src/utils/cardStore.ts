/**
 * 名片数据门面层（Facade）
 *
 * 统一两种运行模式，页面只调用本文件，不关心数据来自本地还是服务端：
 *  - 本地模式（默认）：浏览器 localStorage，纯静态部署可用
 *  - 服务端模式（VITE_CARD_SERVER=on）：调用 /api/cards，短链全网有效
 *
 * 服务端接口契约见 server/src/app.js，字段与 CardRecord 完全一致。
 */
import { CARD_API_BASE, CARD_SERVER_MODE } from '../config';
import { getToken } from './cardAuth';
import type { CardData } from './cardCodec';
import * as local from './cardService';
import type { CardRecord } from './cardService';

export { cardUrlOfCode, todayGenCount, DAILY_GEN_LIMIT, validateCardData } from './cardService';
export type { CardRecord };

/** 查询名片的结果状态 */
export type FetchResult =
  | { status: 'active'; record: CardRecord }
  | { status: 'disabled' }
  | { status: 'notfound' }
  | { status: 'error'; error: string };

export type CreateOutcome =
  | { ok: true; record: CardRecord }
  | { ok: false; error: string };

export const IS_SERVER_MODE = CARD_SERVER_MODE;

function apiUrl(path: string): string {
  return `${CARD_API_BASE}${path}`;
}

const TIMEOUT_MS = 12000;

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    return await fetch(apiUrl(path), { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
  }
}

function jsonHeaders(): HeadersInit {
  const token = getToken();
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

/** 创建名片 */
export async function createCardAsync(data: CardData): Promise<CreateOutcome> {
  if (!IS_SERVER_MODE) {
    const res = local.createCard(data);
    return res.ok ? res : { ok: false, error: res.error };
  }
  if (!getToken()) return { ok: false, error: '登录已过期，请刷新页面重新进入' };
  try {
    const resp = await request('/api/cards', {
      method: 'POST',
      headers: jsonHeaders(),
      body: JSON.stringify(data),
    });
    if (resp.status === 401) return { ok: false, error: '登录已过期，请刷新页面重新进入' };
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.ok) {
      return { ok: false, error: json?.error || `创建失败（${resp.status}）` };
    }
    const record = json.record as CardRecord;
    local.rememberCode(record.shortCode);
    local.recordGeneration();
    return { ok: true, record };
  } catch {
    return { ok: false, error: '网络异常，请检查网络后重试' };
  }
}

/** 按短码查询名片 */
export async function fetchCardAsync(code: string): Promise<FetchResult> {
  if (!IS_SERVER_MODE) {
    const rec = local.getCardByCode(code);
    if (!rec) return { status: 'notfound' };
    return rec.status === 'disabled' ? { status: 'disabled' } : { status: 'active', record: rec };
  }
  try {
    const resp = await request(`/api/cards/${encodeURIComponent(code)}`);
    if (resp.status === 404) return { status: 'notfound' };
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.ok) {
      return { status: 'error', error: json?.error || `请求失败（${resp.status}）` };
    }
    if (json.status === 'disabled') return { status: 'disabled' };
    return { status: 'active', record: json.record as CardRecord };
  } catch {
    return { status: 'error', error: '网络异常，请稍后重试' };
  }
}

/** 本机生成过的名片列表（本地模式读存储；服务端模式按短码逐个取回） */
export async function listMyCardsAsync(): Promise<CardRecord[]> {
  if (!IS_SERVER_MODE) return local.listMyRecords();
  const codes = local.myCodes();
  if (codes.length === 0) return [];
  const results = await Promise.all(
    codes.map(async (code) => ({ code, res: await fetchCardAsync(code) }))
  );
  const out: CardRecord[] = [];
  for (const { code, res } of results) {
    if (res.status === 'active') {
      out.push(res.record);
    } else if (res.status === 'disabled') {
      // 已停用：保留占位记录便于本人看到状态
      out.push({
        id: code,
        shortCode: code,
        name: '已停用',
        title: '',
        department: '',
        phone: '',
        wechat: '',
        bio: '',
        avatar: '',
        status: 'disabled',
        createdAt: 0,
        updatedAt: 0,
      });
    } else if (res.status === 'notfound') {
      local.forgetCode(code); // 已被删除，清掉本机索引
    }
  }
  return out;
}

/** 删除名片 */
export async function removeCardAsync(code: string): Promise<boolean> {
  if (!IS_SERVER_MODE) {
    local.deleteCard(code);
    return true;
  }
  try {
    const resp = await request(`/api/cards/${encodeURIComponent(code)}`, {
      method: 'DELETE',
      headers: jsonHeaders(),
    });
    local.forgetCode(code);
    return resp.ok;
  } catch {
    return false;
  }
}

/** 启用 / 停用（管理用） */
export async function setCardStatusAsync(
  code: string,
  status: CardRecord['status']
): Promise<boolean> {
  if (!IS_SERVER_MODE) {
    local.setCardStatus(code, status);
    return true;
  }
  try {
    const resp = await request(`/api/cards/${encodeURIComponent(code)}/status`, {
      method: 'PATCH',
      headers: jsonHeaders(),
      body: JSON.stringify({ status }),
    });
    return resp.ok;
  } catch {
    return false;
  }
}

/** 管理员：全量名片列表 */
export async function listAllCardsAsync(): Promise<
  { ok: true; items: CardRecord[] } | { ok: false; error: string }
> {
  if (!IS_SERVER_MODE) {
    // 本地模式没有"全量"，返回本机名片便于预览管理员页结构
    return { ok: true, items: local.listMyRecords() };
  }
  if (!getToken()) return { ok: false, error: '登录已过期，请重新登录' };
  try {
    const resp = await request('/api/cards?limit=500', { headers: jsonHeaders() });
    if (resp.status === 403) return { ok: false, error: '当前口令没有管理权限' };
    if (resp.status === 401) return { ok: false, error: '登录已过期，请重新登录' };
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.ok) {
      return { ok: false, error: json?.error || `加载失败（${resp.status}）` };
    }
    return { ok: true, items: (json.items || []) as CardRecord[] };
  } catch {
    return { ok: false, error: '网络异常，请稍后重试' };
  }
}
