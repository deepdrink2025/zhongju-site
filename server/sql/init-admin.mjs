/**
 * 初始化主管理员账户（幂等）
 *
 * 用法：
 *   INIT_ADMIN_USER=admin INIT_ADMIN_PASSWORD='你的密码' node sql/init-admin.mjs
 *
 * 说明：
 * - 统一账户体系下没有口令登录，首个主管理员由此脚本创建
 * - 已存在同名账号时不修改密码，仅确保其角色为主管理员
 * - 创建成功后会执行一次存量名片归属迁移（无归属名片 → 该管理员）
 */
import { pool, ensureSchema, migrateCardOwnership } from '../src/db.js';
import { hashPassword } from '../src/contracts/util.js';

const username = process.env.INIT_ADMIN_USER || 'admin';
const password = process.env.INIT_ADMIN_PASSWORD || '';
const name = (process.env.INIT_ADMIN_NAME || '主管理员').trim();

function fail(message) {
  console.error('[init-admin] ' + message);
  process.exit(1);
}

if (!/^[a-zA-Z0-9_-]{3,30}$/.test(username)) {
  fail('INIT_ADMIN_USER 需为 3-30 位字母、数字、中划线或下划线');
}
if (password.length < 8) fail('INIT_ADMIN_PASSWORD 至少 8 位');

try {
  await ensureSchema();
  const [rows] = await pool.query('SELECT id, role FROM users WHERE username = ? LIMIT 1', [username]);
  if (rows.length) {
    if (rows[0].role !== 'admin') {
      await pool.query("UPDATE users SET role = 'admin' WHERE id = ?", [rows[0].id]);
      console.log(`[init-admin] 已存在账号 ${username}，角色已调整为主管理员（密码保持不变）`);
    } else {
      console.log(`[init-admin] 账号 ${username} 已存在，跳过创建（密码保持不变）`);
    }
  } else {
    const { salt, hash } = hashPassword(password);
    await pool.query(
      "INSERT INTO users (name, username, role, salt, password_hash) VALUES (?, ?, 'admin', ?, ?)",
      [name || '主管理员', username, salt, hash]
    );
    console.log(`[init-admin] 已创建主管理员：${username}`);
  }
  const migrated = await migrateCardOwnership();
  if (migrated) console.log(`[init-admin] 存量名片归属已迁移 ${migrated} 张到主管理员`);
  await pool.end();
  process.exit(0);
} catch (err) {
  console.error('[init-admin] 失败：', err.message);
  try {
    await pool.end();
  } catch {
    /* ignore */
  }
  process.exit(1);
}
