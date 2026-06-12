CREATE TABLE IF NOT EXISTS users (
	id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
	email VARCHAR(190) NOT NULL UNIQUE,
	password_hash VARCHAR(255) NOT NULL,
	role ENUM('user', 'admin') NOT NULL DEFAULT 'user',
	status ENUM('allowed', 'blocked') NOT NULL DEFAULT 'allowed',
	last_login_at DATETIME NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	INDEX idx_users_status (status),
	INDEX idx_users_role (role)
);
