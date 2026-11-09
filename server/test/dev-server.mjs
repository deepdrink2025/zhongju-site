/**
 * 本地联调服务器：用内存假库启动完整 API（无需 MySQL）
 * 用途：前端服务端模式联调、演示
 * 运行：node test/dev-server.mjs [端口]
 */
import { createApp } from '../src/app.js';
import { fakePool } from './fakePool.mjs';

const port = Number(process.argv[2] || process.env.PORT || 8787);
const pool = fakePool();
const app = createApp({
  pool,
  adminToken: process.env.ADMIN_TOKEN || 'admin-pass',
  staffToken: process.env.STAFF_TOKEN || 'staff-pass',
  dailyLimit: Number(process.env.DAILY_LIMIT || 50),
  loginLimit: Number(process.env.LOGIN_LIMIT || 1000),
});

app.listen(port, () => {
  console.log(`[dev-server] 内存假库 API 已启动：http://127.0.0.1:${port}`);
});
