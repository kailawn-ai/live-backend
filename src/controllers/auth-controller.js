const { verifyPassword } = require('../auth');
const { publicUser } = require('../models/user-model');

function createAuthController({ userModel, signToken }) {
	return {
		login,
		me,
	};

	async function login(body) {
		const email = String(body.email || '').trim().toLowerCase();
		const password = String(body.password || '');
		const user = await userModel.findByEmail(email);

		if (!user || !verifyPassword(password, user.passwordHash)) {
			return unauthorized('Invalid email or password.');
		}

		if (user.status !== 'allowed') {
			const error = new Error('This account is blocked.');
			error.statusCode = 403;
			throw error;
		}

		await userModel.markLogin(user.id);

		return {
			token: signToken({ sub: String(user.id), email: user.email, role: user.role }),
			user: publicUser({ ...user, lastLoginAt: new Date().toISOString() }),
		};
	}

	async function me(authUser) {
		const user = await userModel.findById(authUser.sub);

		if (!user) {
			return unauthorized('Unauthorized.');
		}

		return { user: publicUser(user) };
	}
}

function unauthorized(message) {
	const error = new Error(message);
	error.statusCode = 401;
	throw error;
}

module.exports = { createAuthController };
