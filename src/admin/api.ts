/** 统一后台 API 客户端（名片 + 合同共用一个 token） */
const API_BASE = '/api';
const CONTRACT_BASE = '/api/contract';
const TOKEN_KEY = 'zj_admin_token';

export const AUTH_EXPIRED_EVENT = 'admin-auth-expired';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
}

function notifyExpired() {
  setToken(null);
  try {
    window.dispatchEvent(new Event(AUTH_EXPIRED_EVENT));
  } catch {
    /* ignore */
  }
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(
  path: string,
  opts: RequestInit = {},
  base: string = API_BASE
): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(base + path, { ...opts, headers });
  if (res.status === 401) {
    notifyExpired();
    throw new ApiError(401, '登录已过期，请重新登录');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `请求失败（${res.status}）`);
  return data as T;
}

/** 合同模块接口（/api/contract/*） */
export const contractApi = <T = unknown>(path: string, opts: RequestInit = {}) =>
  api<T>(path, opts, CONTRACT_BASE);

export async function downloadFile(fileId: number, name: string) {
  const token = getToken();
  const res = await fetch(`${CONTRACT_BASE}/files/${fileId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (res.status === 401) {
    notifyExpired();
    throw new Error('登录已过期，请重新登录');
  }
  if (!res.ok) throw new Error('下载失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
