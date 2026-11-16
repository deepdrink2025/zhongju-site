import mysql from 'mysql2/promise';

export async function createPool(env = process.env) {
  return mysql.createPool({
    host: env.DB_HOST || 'mysql-common',
    port: Number(env.DB_PORT || 3306),
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    database: env.DB_NAME,
    waitForConnections: true,
    connectionLimit: 10,
  });
}

export async function ensureSchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id INT AUTO_INCREMENT PRIMARY KEY,
      name VARCHAR(50) NOT NULL,
      username VARCHAR(50) NOT NULL UNIQUE,
      role ENUM('admin','finance','staff','viewer') NOT NULL DEFAULT 'staff',
      salt CHAR(32) NOT NULL,
      password_hash CHAR(64) NOT NULL,
      status ENUM('active','disabled') NOT NULL DEFAULT 'active',
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS sessions (
      id INT AUTO_INCREMENT PRIMARY KEY,
      token_hash CHAR(64) NOT NULL UNIQUE,
      user_id INT NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sessions_user (user_id),
      CONSTRAINT fk_sessions_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS customers (
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
      INDEX idx_contracts_customer (customer_id),
      INDEX idx_contracts_owner (owner_user_id),
      INDEX idx_contracts_end (end_date),
      CONSTRAINT fk_contracts_customer FOREIGN KEY (customer_id) REFERENCES customers(id),
      CONSTRAINT fk_contracts_owner FOREIGN KEY (owner_user_id) REFERENCES users(id)
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
      INDEX idx_files_contract (contract_id),
      CONSTRAINT fk_files_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
      CONSTRAINT fk_files_user FOREIGN KEY (uploaded_by) REFERENCES users(id)
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
      INDEX idx_logs_contract (contract_id),
      CONSTRAINT fk_logs_contract FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
      CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  await pool.query(`
    CREATE TABLE IF NOT EXISTS login_logs (
      id INT AUTO_INCREMENT PRIMARY KEY,
      username VARCHAR(50) NOT NULL,
      user_id INT NULL,
      ip VARCHAR(64) NOT NULL,
      success TINYINT(1) NOT NULL DEFAULT 0,
      created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_login_logs_time (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // 存量库迁移：补充 invoice_type / amount_unit 列（幂等）
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
}
