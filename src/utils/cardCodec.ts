/**
 * 名片数据模型与二维码编码安全阈值。
 * 名片数据统一存放在服务端数据库，前端不再做 URL 内嵌编解码。
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
