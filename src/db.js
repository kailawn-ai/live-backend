const mysql = require('mysql2/promise');

async function initDb() {
	const database = process.env.MYSQL_DATABASE || 'streaming';
	const databaseIdentifier = mysql.escapeId(database);

	if (!/^[a-zA-Z0-9_]+$/.test(database)) {
		throw new Error('MYSQL_DATABASE can only contain letters, numbers, and underscores.');
	}

	const bootstrapPool = mysql.createPool({
		host: process.env.MYSQL_HOST || '127.0.0.1',
		port: Number(process.env.MYSQL_PORT || 3306),
		user: process.env.MYSQL_USER || 'root',
		password: process.env.MYSQL_PASSWORD || '',
		waitForConnections: true,
		connectionLimit: 5,
	});

	await bootstrapPool.query(`CREATE DATABASE IF NOT EXISTS ${databaseIdentifier}`);
	await bootstrapPool.end();

	const pool = mysql.createPool({
		host: process.env.MYSQL_HOST || '127.0.0.1',
		port: Number(process.env.MYSQL_PORT || 3306),
		user: process.env.MYSQL_USER || 'root',
		password: process.env.MYSQL_PASSWORD || '',
		database,
		waitForConnections: true,
		connectionLimit: 10,
		namedPlaceholders: true,
	});

	await pool.query(`
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
		)
	`);

	await pool.query(`
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
		)
	`);

	return pool;
}

module.exports = { initDb };
