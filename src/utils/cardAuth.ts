import { CARD_API_BASE } from '../config';
const TOKEN_KEY = 'zhongju_card_auth',
  DEVICE_KEY = 'zhongju_card_device';
export const AUTH_EXPIRED_EVENT = 'card-auth-expired';
export type Role = 'admin' | 'staff';
export interface AuthState {
  token: string;
  role: Role;
  exp: number;
}
export type LoginResult = { ok: true; role: Role; exp: number } | { ok: false; error: string };
export function getAuth(): AuthState | null {
  try {
    const data = JSON.parse(sessionStorage.getItem(TOKEN_KEY) || 'null') as AuthState | null;
    return data &&
      typeof data.token === 'string' &&
      ['staff', 'admin'].includes(data.role) &&
      Number.isFinite(data.exp) &&
      data.exp > Date.now()
      ? data
      : null;
  } catch {
    return null;
  }
}
export const getToken = () => getAuth()?.token ?? null;
export const getRole = () => getAuth()?.role ?? null;
export function isLoggedIn(roles?: Role | Role[]): boolean {
  const auth = getAuth();
  return !!auth && (!roles || (Array.isArray(roles) ? roles : [roles]).includes(auth.role));
}
export function clearAuth(): void {
  try {
    sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    /* unavailable */
  }
}
export function expireAuth(): void {
  clearAuth();
  window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
}
export function getRecoveryCode(): string {
  const existing = localStorage.getItem(DEVICE_KEY);
  if (existing && /^[a-f0-9]{32}$/.test(existing)) return existing;
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  const value = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  localStorage.setItem(DEVICE_KEY, value);
  return value;
}
export async function login(passcode: string, recoveryCode = ''): Promise<LoginResult> {
  const controller = new AbortController(),
    timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    const deviceId = recoveryCode.trim().toLowerCase() || getRecoveryCode();
    if (!/^[a-f0-9]{32}$/.test(deviceId))
      return { ok: false, error: '恢复码应为 32 位字母数字组合' };
    const response = await fetch(`${CARD_API_BASE}/api/admin/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ passcode: passcode.trim(), deviceId }),
      signal: controller.signal,
      cache: 'no-store',
    });
    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.ok)
      return { ok: false, error: data?.error || `登录失败（${response.status}）` };
    localStorage.setItem(DEVICE_KEY, deviceId);
    sessionStorage.setItem(
      TOKEN_KEY,
      JSON.stringify({ token: data.token, role: data.role, exp: data.exp })
    );
    return { ok: true, role: data.role, exp: data.exp };
  } catch {
    return { ok: false, error: '无法登录，请检查网络并允许浏览器保存本设备数据' };
  } finally {
    window.clearTimeout(timer);
  }
}
export async function logout(): Promise<void> {
  const token = getToken(),
    controller = new AbortController(),
    timer = window.setTimeout(() => controller.abort(), 12000);
  try {
    if (token)
      await fetch(`${CARD_API_BASE}/api/admin/logout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        signal: controller.signal,
        cache: 'no-store',
      });
  } catch {
    /* Offline sign-out only clears this browser; the server session still has its expiry. */
  } finally {
    window.clearTimeout(timer);
    clearAuth();
  }
}
