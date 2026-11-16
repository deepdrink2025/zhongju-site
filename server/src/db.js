/**
 * 数据库连接池 + 建表 + 迁移
 * 生产环境连接 mysql-common 容器（桥接网络内按容器名访问）
 *
 * 统一账户体系：
 * - users 表（contracts/schema.js 创建）是唯一账号源
 * - cards.owner_user_id 指向 users.id
 * - 配额按 user_id 统计；旧 card_sessions 表废弃
 */
import mysql from 'mysql2/promise';
import { ensureContractSchema } from './contracts/schema.js';

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

async function columnExists(table, column) {
  const [rows] = await pool.query(
    'SELECT COLUMN_NAME FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?',
    [table, column]
  );
  return rows.length > 0;
}

/** 建表与迁移（幂等，启动时执行） */
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
      owner_user_id INT        NULL,
      INDEX idx_phone (phone),
      INDEX idx_created (created_at),
      INDEX idx_owner_user (owner_user_id, created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  // 账号表与合同表（users 必须先存在，后面的归属迁移依赖它）
  await ensureContractSchema(pool);

  // 存量库补列：cards.owner_user_id
  if (!(await columnExists('cards', 'owner_user_id'))) {
    await pool.query(
      'ALTER TABLE cards ADD COLUMN owner_user_id INT NULL, ADD INDEX idx_owner_user (owner_user_id, created_at)'
    );
  }

  // 旧表清理：口令会话表、按设备统计的配额表
  await pool.query('DROP TABLE IF EXISTS card_sessions');
  if (await columnExists('card_daily_usage', 'owner_key')) {
    await pool.query('DROP TABLE IF EXISTS card_daily_usage');
  }
  await pool.query(`
    CREATE TABLE IF NOT EXISTS card_daily_usage (
      user_id  INT UNSIGNED NOT NULL,
      day_key  CHAR(10) NOT NULL,
      used     INT UNSIGNED NOT NULL DEFAULT 0,
      PRIMARY KEY (user_id, day_key),
      INDEX idx_day (day_key)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await migrateCardOwnership();
}

/**
 * 存量名片归属：统一归入首个主管理员（幂等；没有主管理员时跳过，由 init-admin 调用）
 * 返回本次归属的名片数量。
 */
export async function migrateCardOwnership() {
  const [admins] = await pool.query(
    "SELECT id FROM users WHERE role = 'admin' AND status = 'active' ORDER BY id LIMIT 1"
  );
  if (!admins.length) return 0;
  const [result] = await pool.query('UPDATE cards SET owner_user_id = ? WHERE owner_user_id IS NULL', [
    admins[0].id,
  ]);
  return result.affectedRows || 0;
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
