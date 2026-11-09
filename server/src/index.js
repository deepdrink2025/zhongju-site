/**
 * 启动入口：连接 MySQL（mysql-common）→ 建表 → 监听
 */
import { pool, ensureSchema, waitForDb } from './db.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 8787);

const adminToken = process.env.ADMIN_TOKEN || '';
const staffToken = process.env.STAFF_TOKEN || '';

// 生产环境必须显式配置双口令，避免带着默认口令上线
if (process.env.NODE_ENV === 'production' && (!adminToken || !staffToken)) {
  console.error('[card-server] 启动失败：生产环境必须配置 ADMIN_TOKEN 与 STAFF_TOKEN（见 deploy/.env）');
  process.exit(1);
}

const app = createApp({
  pool,
  adminToken: adminToken || 'zhongju-admin-2026',
  staffToken: staffToken || 'zhongju2026',
  tokenSecret: process.env.TOKEN_SECRET || '',
  dailyLimit: Number(process.env.DAILY_LIMIT || 5),
  loginLimit: Number(process.env.LOGIN_LIMIT || 10),
});

(async () => {
  try {
    await waitForDb();
    await ensureSchema();
    const server = app.listen(PORT, () => {
      console.log(`[card-server] listening on :${PORT}`);
    });

    for (const sig of ['SIGTERM', 'SIGINT']) {
      process.on(sig, async () => {
        console.log(`[card-server] ${sig} 收到，正在退出`);
        server.close(async () => {
          await pool.end().catch(() => {});
          process.exit(0);
        });
      });
    }
  } catch (err) {
    console.error('[card-server] 启动失败：', err.message);
    process.exit(1);
  }
})();
