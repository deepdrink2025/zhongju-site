/**
 * 名片服务端登录态（sessionStorage 存短期 token，不把口令打进前端包）
 * - 登录：POST /api/admin/login { passcode } → { token, role, exp }
 * - 角色：admin（可看全量列表、停用、删除）/ staff（仅创建自己的名片）
 * - token 有效期 12 小时，存在 sessionStorage：关闭浏览器即失效
 */
import { CARD_API_BASE } from '../config';

const TOKEN_KEY = 'zhongju_card_auth';

export type Role = 'admin' | 'staff';

export interface AuthState {
  token: string;
  role: Role;
  exp: number;
}

function read(): AuthState | null {
  try {
    const raw = sessionStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as AuthState;
    if (!data?.token || typeof data.exp !== 'number') return null;
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

/** 当前登录态（过期返回 null） */
export function getAuth(): AuthState | null {
  return read();
}

/** 取 token（供请求头使用） */
export function getToken(): string | null {
  return read()?.token ?? null;
}

export function getRole(): Role | null {
  return read()?.role ?? null;
}

/** 是否已登录（可指定要求的角色） */
export function isLoggedIn(roles?: Role | Role[]): boolean {
  const auth = read();
  if (!auth) return false;
  if (!roles) return true;
  const list = Array.isArray(roles) ? roles : [roles];
  return list.includes(auth.role);
}

export function clearAuth(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}

export type LoginResult =
  | { ok: true; role: Role; exp: number }
  | { ok: false; error: string };

/** 口令登录 */
export async function login(passcode: string): Promise<LoginResult> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const resp = await fetch(`${CARD_API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: passcode.trim() }),
      signal: controller.signal,
    });
    const json = await resp.json().catch(() => null);
    if (!resp.ok || !json?.ok) {
      return { ok: false, error: json?.error || `登录失败（${resp.status}）` };
    }
    const auth: AuthState = { token: json.token, role: json.role, exp: json.exp };
    try {
      sessionStorage.setItem(TOKEN_KEY, JSON.stringify(auth));
    } catch {
      /* ignore */
    }
    return { ok: true, role: json.role, exp: json.exp };
  } catch {
    return { ok: false, error: '网络异常，请稍后重试' };
  } finally {
    window.clearTimeout(timer);
  }
}
