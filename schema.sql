CREATE DATABASE IF NOT EXISTS streaming;
USE streaming;

CREATE TABLE IF NOT EXISTS streams (
	id VARCHAR(120) PRIMARY KEY,
	title VARCHAR(200) NOT NULL,
	description VARCHAR(200) NULL,
	teams VARCHAR(200) NULL,
	status ENUM('offline', 'live', 'disabled') NOT NULL DEFAULT 'offline',
	stream_key VARCHAR(96) NOT NULL UNIQUE,
	hls_url VARCHAR(500) NOT NULL,
	created_at DATETIME NOT NULL,
	updated_at DATETIME NOT NULL,
	started_at DATETIME NULL,
	ended_at DATETIME NULL,
	last_publisher JSON NULL,
	INDEX idx_streams_status (status),
	INDEX idx_streams_stream_key (stream_key)
);

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
