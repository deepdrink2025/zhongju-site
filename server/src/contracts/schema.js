/**
 * 合同管理模块建表与迁移（幂等）
 * 与名片表共存于同一个库（zhongju_cards），表名互不冲突
 */
export async function ensureContractSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      username VARCHAR(50) NOT NULL UNIQUE,
      role ENUM('admin','contract_admin','staff') NOT NULL DEFAULT 'admin',
      salt CHAR(32) NOT NULL,
      password_hash CHAR(64) NOT NULL,
      status ENUM('active','disabled') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token_hash CHAR(64) NOT NULL UNIQUE,
      user_id INT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ct_sessions_user (user_id),
      CONSTRAINT fk_ct_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_owners (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      status ENUM('active','disabled') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_ct_owners_name (name)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_customers (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(200) NOT NULL UNIQUE,
      contact VARCHAR(50) NULL,
      phone VARCHAR(50) NULL,
      address VARCHAR(255) NULL,
      status ENUM('active','inactive') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contracts (
      id INT AUTO_INCREMENT PRIMARY KEY,
      code VARCHAR(20) NOT NULL UNIQUE,
      name VARCHAR(200) NOT NULL,
      type VARCHAR(20) NOT NULL,
      our_entity VARCHAR(200) NULL,
      customer_id INT NOT NULL,
      owner_user_id INT NOT NULL,
      amount DECIMAL(14,2) NULL,
      amount_unit VARCHAR(20) NULL,
      invoice_type VARCHAR(20) NULL,
      settle_type VARCHAR(20) NULL,
      headcount INT NULL,
      sign_date DATE NOT NULL,
      start_date DATE NOT NULL,
      end_date DATE NOT NULL,
      renewal_type VARCHAR(20) NULL,
      storage_location VARCHAR(255) NULL,
      status ENUM('active','renewed','terminated') NOT NULL DEFAULT 'active',
      terminate_reason VARCHAR(255) NULL,
      terminated_at DATETIME NULL,
      deleted_at DATETIME NULL,
      created_by INT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_ct_contracts_customer (customer_id),
      INDEX idx_ct_contracts_owner (owner_user_id),
      INDEX idx_ct_contracts_end (end_date),
      CONSTRAINT fk_ct_contracts_customer FOREIGN KEY (customer_id) REFERENCES contract_customers(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_files (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_id INT NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      stored_name VARCHAR(255) NOT NULL,
      size INT NOT NULL,
      sha256 CHAR(64) NOT NULL,
      uploaded_by INT NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ct_files_contract (contract_id),
      CONSTRAINT fk_ct_files_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
      CONSTRAINT fk_ct_files_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      contract_id INT NOT NULL,
      user_id INT NULL,
      action VARCHAR(30) NOT NULL,
      detail TEXT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ct_logs_contract (contract_id),
      CONSTRAINT fk_ct_logs_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
      CONSTRAINT fk_ct_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS contract_login_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      user_id INT NULL,
      ip VARCHAR(64) NOT NULL,
      success TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ct_login_logs_time (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ---- 幂等迁移 ----

  // 1. 存量合同库补充 invoice_type / amount_unit 列
  const [cols] = await pool.query(
    "SELECT column_name AS col FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'contracts' AND column_name IN ('invoice_type', 'amount_unit')"
  );
  const existing = new Set(cols.map((c) => String(c.col).toLowerCase()));
  if (!existing.has('amount_unit')) {
    await pool.query("ALTER TABLE contracts ADD COLUMN amount_unit VARCHAR(20) NULL AFTER amount");
  }
  if (!existing.has('invoice_type')) {
    await pool.query("ALTER TABLE contracts ADD COLUMN invoice_type VARCHAR(20) NULL AFTER amount_unit");
  }

  // 2. 存量库角色兼容（幂等）：历史 finance/viewer 归入新角色；
  //    统一账户后 staff 也可登录，不再清空业务人员密码
  await pool.query("ALTER TABLE users MODIFY role ENUM('admin','finance','staff','viewer','contract_admin') NOT NULL DEFAULT 'staff'");
  await pool.query("UPDATE users SET role = 'contract_admin' WHERE role = 'finance'");
  await pool.query("UPDATE users SET role = 'staff' WHERE role = 'viewer'");
  await pool.query("ALTER TABLE users MODIFY role ENUM('admin','contract_admin','staff') NOT NULL DEFAULT 'admin'");

  // 3. 业务员退出账号体系（幂等）：
  //    - 业务负责人改由 contract_owners 表独立维护（供合同表单模糊搜索选择）
  //    - contracts.owner_user_id 外键从 users 切换到 contract_owners
  //    - 存量 staff 账号停用（保留行以满足名片归属 / 附件上传人等外键），并清理会话
  const [ownerFks] = await pool.query(
    `SELECT CONSTRAINT_NAME FROM information_schema.KEY_COLUMN_USAGE
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'contracts'
       AND COLUMN_NAME = 'owner_user_id' AND REFERENCED_TABLE_NAME = 'users'`
  );
  if (ownerFks.length) {
    const fkName = ownerFks[0].CONSTRAINT_NAME;
    await pool.query(`ALTER TABLE contracts DROP FOREIGN KEY \`${fkName}\``);

    // 3.1 存量业务员账号 → 业务负责人档案（同名去重，状态随账号）
    await pool.query(
      `INSERT IGNORE INTO contract_owners (name, status)
       SELECT name, IF(status = 'active', 'active', 'disabled') FROM users WHERE role = 'staff'`
    );
    // 3.2 合同历史负责人（含管理员账号名）→ 业务负责人档案
    await pool.query(
      `INSERT IGNORE INTO contract_owners (name)
       SELECT u.name FROM contracts c JOIN users u ON u.id = c.owner_user_id`
    );
    // 3.3 脏数据兜底：负责人指向已不存在用户的合同 → 占位档案
    const [dirty] = await pool.query(
      `SELECT COUNT(*) AS n FROM contracts c LEFT JOIN users u ON u.id = c.owner_user_id WHERE u.id IS NULL`
    );
    if (Number(dirty[0]?.n) > 0) {
      await pool.query("INSERT IGNORE INTO contract_owners (name) VALUES ('历史负责人')");
      await pool.query(
        `UPDATE contracts c LEFT JOIN users u ON u.id = c.owner_user_id
         SET c.owner_user_id = (SELECT id FROM contract_owners WHERE name = '历史负责人')
         WHERE u.id IS NULL`
      );
    }
    // 3.4 重映射：合同负责人指向 contract_owners
    await pool.query(
      `UPDATE contracts c
       JOIN users u ON u.id = c.owner_user_id
       JOIN contract_owners o ON o.name = u.name
       SET c.owner_user_id = o.id`
    );
    await pool.query(
      'ALTER TABLE contracts ADD CONSTRAINT fk_ct_contracts_owner FOREIGN KEY (owner_user_id) REFERENCES contract_owners(id)'
    );
  } else {
    // 全新安装或已迁移：确保外键指向 contract_owners（已存在时忽略报错）
    await pool.query(
      'ALTER TABLE contracts ADD CONSTRAINT fk_ct_contracts_owner FOREIGN KEY (owner_user_id) REFERENCES contract_owners(id)'
    ).catch(() => {});
  }

  // 3.5 停用存量业务员账号（不可登录），并清理其会话（幂等）
  await pool.query("UPDATE users SET status = 'disabled' WHERE role = 'staff' AND status = 'active'");
  await pool.query(
    'DELETE s FROM contract_sessions s JOIN users u ON u.id = s.user_id WHERE u.role = ?',
    ['staff']
  );
}
