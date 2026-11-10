/**
 * 站点配置（内部管理用）
 * 注意：纯前端方案的口令仅为访问门槛（防误入/防游客），非强安全边界。
 * 如需严格权限控制，需引入后端服务。
 */

/* ---------------- 服务端名片 API ---------------- */

/**
 * 服务端名片 API 基地址
 * - 与前端同域部署（Nginx 反代 /api）时留空即可
 * - 独立域名时填写 https://api.example.com
 */
export const CARD_API_BASE = (import.meta.env.VITE_CARD_API_BASE ?? '').replace(/\/$/, '');

/** 是否启用服务端模式（构建时通过 VITE_CARD_SERVER=on 打开） */
export const CARD_SERVER_MODE = import.meta.env.VITE_CARD_SERVER === 'on';
