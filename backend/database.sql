CREATE DATABASE IF NOT EXISTS peminjaman_alat
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE peminjaman_alat;

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL,
  username VARCHAR(50) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role ENUM('admin', 'petugas', 'peminjam') NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(500),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tools (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  category_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(150) NOT NULL,
  description VARCHAR(1000),
  image_url VARCHAR(500),
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  available INT UNSIGNED NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_tools_category
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS loans (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  tool_id BIGINT UNSIGNED NOT NULL,
  quantity INT UNSIGNED NOT NULL DEFAULT 1,
  loan_date DATE NOT NULL,
  due_date DATE NOT NULL,
  status ENUM('pending', 'approved', 'rejected', 'returned') NOT NULL DEFAULT 'pending',
  note VARCHAR(500),
  reject_reason VARCHAR(500),
  processed_by BIGINT UNSIGNED,
  processed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_loans_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE RESTRICT,
  CONSTRAINT fk_loans_tool
    FOREIGN KEY (tool_id) REFERENCES tools(id) ON DELETE RESTRICT,
  CONSTRAINT fk_loans_processor
    FOREIGN KEY (processed_by) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_loans_user (user_id),
  INDEX idx_loans_tool (tool_id),
  INDEX idx_loans_status (status)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS returns (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  loan_id BIGINT UNSIGNED NOT NULL UNIQUE,
  returned_at DATE NOT NULL,
  item_condition ENUM('baik', 'rusak', 'hilang') NOT NULL DEFAULT 'baik',
  status ENUM('pending', 'confirmed') NOT NULL DEFAULT 'pending',
  fine INT UNSIGNED NOT NULL DEFAULT 0,
  note VARCHAR(500),
  received_by BIGINT UNSIGNED,
  confirmed_at DATETIME,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_returns_loan
    FOREIGN KEY (loan_id) REFERENCES loans(id) ON DELETE CASCADE,
  CONSTRAINT fk_returns_receiver
    FOREIGN KEY (received_by) REFERENCES users(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS activity_logs (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED,
  action VARCHAR(100) NOT NULL,
  entity VARCHAR(100),
  entity_id BIGINT UNSIGNED,
  detail TEXT,
  ip VARCHAR(45),
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_logs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX idx_logs_created (created_at)
) ENGINE=InnoDB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- ============================================================================
-- DATA AWAL (SEED) CONTOH
-- Password hash di bawah menggunakan bcrypt cost 10:
--   admin    / admin123
--   petugas  / petugas123
--   peminjam / peminjam123
-- ============================================================================

INSERT INTO users (id, name, username, password_hash, role) VALUES
(1, 'Administrator', 'admin', '$2a$10$WtU640cIIvHbf17ThY9NH.olFpYUkd2xhiIRZSCuasA01ANTeZ8jC', 'admin'),
(2, 'Petugas Satu', 'petugas', '$2a$10$o1oFIjYXFtSlq4aC6OSGKu1imUGXedRBgEoFi2.UkZgiIdFUyL//y', 'petugas'),
(3, 'Peminjam Satu', 'peminjam', '$2a$10$y2d.FRFQ3IG/PX4sKGky1.WQTA0EYt7s3Z.TAeXEcxAugiEblUHCq', 'peminjam')
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO categories (id, name, description) VALUES
(1, 'Elektronik', 'Perangkat elektronik'),
(2, 'Perkakas', 'Alat bengkel dan perkakas tangan'),
(3, 'Olahraga', 'Perlengkapan olahraga')
ON DUPLICATE KEY UPDATE id=id;

INSERT INTO tools (id, category_id, name, description, stock, available) VALUES
(1, 1, 'Proyektor', 'Proyektor HDMI', 3, 3),
(2, 1, 'Laptop', 'Laptop praktik', 5, 5),
(3, 2, 'Bor Listrik', 'Bor tangan + mata bor', 2, 2),
(4, 2, 'Tang Kombinasi', 'Tang serbaguna', 10, 10),
(5, 3, 'Bola Voli', 'Bola voli standar', 6, 6),
(6, 3, 'Raket Badminton', 'Raket + shuttlecock', 8, 8)
ON DUPLICATE KEY UPDATE id=id;

