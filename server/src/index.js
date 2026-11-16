/**
 * 启动入口：连接 MySQL（mysql-common）→ 建表/迁移 → 监听
 */
import { pool, ensureSchema, waitForDb } from './db.js';
import { createApp } from './app.js';

const PORT = Number(process.env.PORT || 8787);

const app = createApp({
  pool,
  dailyLimit: Number(process.env.DAILY_LIMIT || 5),
  loginLimit: Number(process.env.LOGIN_LIMIT || 10),
});

(async () => {
  try {
    await waitForDb();
    await ensureSchema();
    const server = app.listen(PORT, () => {
      console.log(`[api] listening on :${PORT}`);
    });

    for (const sig of ['SIGTERM', 'SIGINT']) {
      process.on(sig, async () => {
        console.log(`[api] ${sig} 收到，正在退出`);
        server.close(async () => {
          await pool.end().catch(() => {});
          process.exit(0);
        });
      });
    }
  } catch (err) {
    console.error('[api] 启动失败：', err.message);
    process.exit(1);
  }
})();
