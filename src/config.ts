/**
 * 站点配置（内部管理用）
 * 认证与权限全部由服务端 users 表统一管理，前端不做任何口令判断。
 */

/* ---------------- 服务端名片 API ---------------- */

/**
 * 服务端名片 API 基地址
 * - 与前端同域部署（Nginx 反代 /api）时留空即可
 * - 独立域名时填写 https://api.example.com
 */
export const CARD_API_BASE = (import.meta.env.VITE_CARD_API_BASE ?? '').replace(/\/$/, '');
