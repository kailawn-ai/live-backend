const { hashPassword } = require('../auth');

function createUserModel(pool) {
	return {
		createUser,
		deleteUser,
		findByEmail,
		findById,
		listUsers,
		markLogin,
		seedAdminUser,
		updateUser,
	};

	async function createUser(input) {
		const email = normalizeEmail(input.email);
		const password = String(input.password || '');
		const role = input.role === 'admin' ? 'admin' : 'user';
		const status = input.status === 'blocked' ? 'blocked' : 'allowed';

		if (!email) {
			throw validationError('Email is required.');
		}

		if (password.length < 6) {
			throw validationError('Password must be at least 6 characters.');
		}

		const now = mysqlDate(new Date());

		try {
			await pool.execute(
				`
					INSERT INTO users (
						email, password_hash, role, status, last_login_at, created_at, updated_at
					) VALUES (
						:email, :passwordHash, :role, :status, NULL, :now, :now
					)
				`,
				{
					email,
					passwordHash: hashPassword(password),
					role,
					status,
					now,
				}
			);
		} catch (error) {
			if (error.code === 'ER_DUP_ENTRY') {
				throw validationError('Email already exists.');
			}

			throw error;
		}

		return findByEmail(email);
	}

	async function findByEmail(email) {
		const [rows] = await pool.execute('SELECT * FROM users WHERE email = :email LIMIT 1', {
			email: normalizeEmail(email),
		});

		return rows[0] ? mapUserRow(rows[0]) : null;
	}

	async function findById(id) {
		const [rows] = await pool.execute('SELECT * FROM users WHERE id = :id LIMIT 1', { id });
		return rows[0] ? mapUserRow(rows[0]) : null;
	}

	async function listUsers() {
		const [rows] = await pool.query('SELECT * FROM users ORDER BY created_at DESC');
		return rows.map(mapUserRow);
	}

	async function markLogin(id) {
		await pool.execute(
			`
				UPDATE users
				SET last_login_at = :now,
					updated_at = :now
				WHERE id = :id
			`,
			{ id, now: mysqlDate(new Date()) }
		);
	}

	async function updateUser(id, input) {
		const user = await findById(id);

		if (!user) return null;

		const next = {
			email: typeof input.email === 'string' ? normalizeEmail(input.email) || user.email : user.email,
			passwordHash:
				typeof input.password === 'string' && input.password
					? hashPassword(input.password)
					: user.passwordHash,
			role: input.role === 'admin' || input.role === 'user' ? input.role : user.role,
			status: input.status === 'allowed' || input.status === 'blocked' ? input.status : user.status,
			updatedAt: mysqlDate(new Date()),
		};

		if (typeof input.password === 'string' && input.password && input.password.length < 6) {
			throw validationError('Password must be at least 6 characters.');
		}

		try {
			await pool.execute(
				`
					UPDATE users
					SET email = :email,
						password_hash = :passwordHash,
						role = :role,
						status = :status,
						updated_at = :updatedAt
					WHERE id = :id
				`,
				{ id, ...next }
			);
		} catch (error) {
			if (error.code === 'ER_DUP_ENTRY') {
				throw validationError('Email already exists.');
			}

			throw error;
		}

		return findById(id);
	}

	async function deleteUser(id) {
		const [result] = await pool.execute('DELETE FROM users WHERE id = :id', { id });
		return result.affectedRows > 0;
	}

	async function seedAdminUser(input) {
		const email = normalizeEmail(input.email);
		const password = String(input.password || '');

		if (!email || !password) return null;

		const existing = await findByEmail(email);

		if (existing) return existing;

		return createUser({
			email,
			password,
			role: 'admin',
			status: 'allowed',
		});
	}
}

function mapUserRow(row) {
	return {
		id: row.id,
		email: row.email,
		passwordHash: row.password_hash,
		role: row.role,
		status: row.status,
		lastLoginAt: toIso(row.last_login_at),
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at),
	};
}

function publicUser(user) {
	return {
		id: user.id,
		email: user.email,
		role: user.role,
		status: user.status,
		lastLoginAt: user.lastLoginAt,
		createdAt: user.createdAt,
		updatedAt: user.updatedAt,
	};
}

function normalizeEmail(email) {
	return String(email || '').trim().toLowerCase();
}

function validationError(message) {
	const error = new Error(message);
	error.statusCode = 400;
	return error;
}

function mysqlDate(date) {
	return date.toISOString().slice(0, 19).replace('T', ' ');
}

function toIso(value) {
	if (!value) return null;
	return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

module.exports = {
	createUserModel,
	publicUser,
};
