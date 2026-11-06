import mysql from 'mysql2/promise';

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS users (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role ENUM('admin','petugas','peminjam') NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS categories (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description VARCHAR(500),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`,
  `CREATE TABLE IF NOT EXISTS tools (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    category_id BIGINT UNSIGNED NOT NULL,
    name VARCHAR(150) NOT NULL,
    description VARCHAR(1000),
    image_url VARCHAR(500),
    stock INT UNSIGNED NOT NULL DEFAULT 0,
    available INT UNSIGNED NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_tools_category FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
  )`,
  `CREATE TABLE IF NOT EXISTS loans (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED NOT NULL,
    tool_id BIGINT UNSIGNED NOT NULL,
    quantity INT UNSIGNED NOT NULL DEFAULT 1,
    loan_date DATE NOT NULL,
    due_date DATE NOT NULL,
    status ENUM('pending','approved','rejected','returned') NOT NULL DEFAULT 'pending',
    note VARCHAR(500),
    reject_reason VARCHAR(500),
    processed_by BIGINT UNSIGNED,
    processed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_loans_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
    CONSTRAINT fk_loans_tool FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE RESTRICT,
    CONSTRAINT fk_loans_processor FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_loans_user (user_id),
    INDEX idx_loans_tool (tool_id),
    INDEX idx_loans_status (status)
  )`,
  `CREATE TABLE IF NOT EXISTS returns (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    loan_id BIGINT UNSIGNED NOT NULL UNIQUE,
    returned_at DATE NOT NULL,
    item_condition ENUM('baik','rusak','hilang') NOT NULL DEFAULT 'baik',
    status ENUM('pending','confirmed') NOT NULL DEFAULT 'pending',
    fine INT UNSIGNED NOT NULL DEFAULT 0,
    note VARCHAR(500),
    received_by BIGINT UNSIGNED,
    confirmed_at DATETIME,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_returns_loan FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
    CONSTRAINT fk_returns_receiver FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
  )`,
  `CREATE TABLE IF NOT EXISTS activity_logs (
    id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
    user_id BIGINT UNSIGNED,
    action VARCHAR(100) NOT NULL,
    entity VARCHAR(100),
    entity_id BIGINT UNSIGNED,
    detail TEXT,
    ip VARCHAR(45),
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_logs_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    INDEX idx_logs_created (created_at)
  )`,
].map((statement) => `${statement} ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);

function createQueryInterface(executor) {
  const execute = (sql, params) =>
    params.length > 0 ? executor.execute(sql, params) : executor.query(sql);
  return {
    async one(sql, params = []) {
      const [rows] = await execute(sql, params);
      return rows[0];
    },
    async many(sql, params = []) {
      const [rows] = await execute(sql, params);
      return rows;
    },
    async run(sql, params = []) {
      const [result] = await execute(sql, params);
      return { insertId: result.insertId, changes: result.affectedRows };
    },
  };
}

export async function createDb(config) {
  const pool = mysql.createPool({
    host: config.dbHost,
    port: config.dbPort,
    user: config.dbUser,
    password: config.dbPassword,
    database: config.dbName,
    waitForConnections: true,
    connectionLimit: config.dbConnectionLimit,
    dateStrings: true,
    timezone: 'Z',
  });
  const db = {
    ...createQueryInterface(pool),
    async transaction(callback) {
      const connection = await pool.getConnection();
      const tx = createQueryInterface(connection);
      await connection.beginTransaction();
      try {
        const result = await callback(tx);
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback();
        throw error;
      } finally {
        connection.release();
      }
    },
    close: () => pool.end(),
  };
  try {
    await db.one('SELECT 1');
    for (const statement of SCHEMA) await pool.query(statement);
  } catch (error) {
    await pool.end();
    throw error;
  }
  return db;
}
