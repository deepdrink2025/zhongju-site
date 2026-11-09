/**
 * 数据库连接池 + 建表
 * 生产环境连接 mysql-common 容器（桥接网络内按容器名访问）
 */
import mysql from 'mysql2/promise';

const DB_HOST = process.env.DB_HOST || 'mysql-common';
const DB_PORT = Number(process.env.DB_PORT || 3306);
const DB_USER = process.env.DB_USER || 'zhongju';
const DB_PASSWORD = process.env.DB_PASSWORD || '';
const DB_NAME = process.env.DB_NAME || 'zhongju_cards';

export const pool = mysql.createPool({
  host: DB_HOST,
  port: DB_PORT,
  user: DB_USER,
  password: DB_PASSWORD,
  database: DB_NAME,
  waitForConnections: true,
  connectionLimit: 5,
  queueLimit: 0,
  charset: 'utf8mb4_unicode_ci',
  timezone: 'Z',
});

/** 建表（幂等，启动时执行） */
export async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS cards (
      id          VARCHAR(32)  NOT NULL PRIMARY KEY,
      short_code  VARCHAR(8)   NOT NULL UNIQUE,
      name        VARCHAR(64)  NOT NULL,
      title       VARCHAR(64)  NOT NULL DEFAULT '',
      department  VARCHAR(64)  NOT NULL DEFAULT '',
      phone       VARCHAR(16)  NOT NULL,
      wechat      VARCHAR(64)  NOT NULL DEFAULT '',
      bio         VARCHAR(128) NOT NULL DEFAULT '',
      avatar      MEDIUMTEXT   NULL,
      status      ENUM('active','disabled') NOT NULL DEFAULT 'active',
      created_at  BIGINT       NOT NULL,
      updated_at  BIGINT       NOT NULL,
      INDEX idx_phone (phone),
      INDEX idx_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

/** 启动自检：连不上库时给出清晰错误，避免容器静默重启 */
export async function waitForDb(retries = 12, delayMs = 2500) {
  for (let i = 1; i <= retries; i++) {
    try {
      const conn = await pool.getConnection();
      await conn.ping();
      conn.release();
      return;
    } catch (err) {
      console.error(
        `[db] 连接失败（${i}/${retries}）${DB_USER}@${DB_HOST}:${DB_PORT}/${DB_NAME} - ${err.message}`
      );
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, delayMs));
    }
  }
}
