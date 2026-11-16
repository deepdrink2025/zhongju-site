const BASE = '/api/contract';
const KEY = 'ct_token';

export function getToken(): string | null {
  return localStorage.getItem(KEY);
}

export function setToken(t: string | null) {
  if (t) localStorage.setItem(KEY, t);
  else localStorage.removeItem(KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export async function api<T = unknown>(path: string, opts: RequestInit = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers as Record<string, string>) };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  if (opts.body && !(opts.body instanceof FormData)) headers['Content-Type'] = 'application/json';
  const res = await fetch(BASE + path, { ...opts, headers });
  if (res.status === 401) {
    setToken(null);
    if (!location.pathname.endsWith('/login')) location.href = '/contracts/login';
    throw new ApiError(401, '请重新登录');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, (data as { error?: string }).error || `请求失败（${res.status}）`);
  return data as T;
}

export async function downloadFile(fileId: number, name: string) {
  const token = getToken();
  const res = await fetch(`${BASE}/files/${fileId}/download`, {
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  if (!res.ok) throw new Error('下载失败');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}
