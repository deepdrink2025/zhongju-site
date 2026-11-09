/**
 * 云名片数据编解码：将名片信息编码为 URL 安全的 Base64 字符串，
 * 嵌入分享链接（/card#d=xxx），客户打开链接即可看到专属名片 —— 纯前端、无需后端。
 */

export interface CardData {
  name: string;
  title: string;
  department: string;
  phone: string;
  wechat: string;
  bio: string;
  /** 头像（dataURL，可选） */
  avatar?: string;
}

/** JSON → UTF-8 → Base64URL（去填充、替换 +/ 为 -_） */
export function encodeCard(data: CardData): string {
  const json = JSON.stringify(data);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** Base64URL → JSON → CardData；解析失败或字段缺失返回 null */
export function decodeCard(s: string): CardData | null {
  try {
    let b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4 !== 0) b64 += '=';
    const bin = atob(b64);
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    const data = JSON.parse(new TextDecoder().decode(bytes));
    if (
      typeof data?.name !== 'string' ||
      typeof data?.phone !== 'string' ||
      !data.name.trim()
    ) {
      return null;
    }
    return {
      name: String(data.name),
      title: String(data.title ?? ''),
      department: String(data.department ?? ''),
      phone: String(data.phone),
      wechat: String(data.wechat ?? ''),
      bio: String(data.bio ?? ''),
      avatar: typeof data.avatar === 'string' ? data.avatar : undefined,
    };
  } catch {
    return null;
  }
}

/** 从当前页面 hash 中解析名片数据（#d=xxx） */
export function readCardFromHash(): CardData | null {
  const m = window.location.hash.match(/[#&]d=([^&]+)/);
  return m ? decodeCard(m[1]) : null;
}

/**
 * 二维码可安全编码的 URL 长度上限（字节）。
 * qrcode 库容量上限约 2953 字节（Byte 模式），但超过约 1200 字节后
 * 二维码过于密集、手机难以扫出，故以此作为阈值，超长时降级为"复制链接"。
 */
export const QR_MAX_BYTES = 1200;

/** 计算 URL 的 UTF-8 字节长度 */
export function urlByteLength(url: string): number {
  return new TextEncoder().encode(url).length;
}

/** URL 是否可以安全生成二维码 */
export function isQrSafe(url: string): boolean {
  return urlByteLength(url) <= QR_MAX_BYTES;
}

/** 本地"我的名片"存取（localStorage，最多保留 10 条） */
const STORAGE_KEY = 'zhongju_my_cards';

export interface StoredCard extends CardData {
  /** 生成时间戳 */
  createdAt: number;
}

export function loadMyCards(): StoredCard[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const list = raw ? (JSON.parse(raw) as StoredCard[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function saveMyCard(card: StoredCard): StoredCard[] {
  const list = [card, ...loadMyCards().filter((c) => c.phone !== card.phone)].slice(0, 10);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* 存储已满时忽略，不影响名片生成 */
  }
  return list;
}

export function removeMyCard(phone: string): StoredCard[] {
  const list = loadMyCards().filter((c) => c.phone !== phone);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    /* ignore */
  }
  return list;
}
