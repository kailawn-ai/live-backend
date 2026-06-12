const { publicUser } = require('../models/user-model');

function createUserController({ userModel }) {
	return {
		create,
		destroy,
		index,
		update,
	};

	async function create(body) {
		const user = await userModel.createUser({
			email: body.email,
			password: body.password,
			role: body.role,
			status: body.status,
		});

		return { user: publicUser(user) };
	}

	async function index() {
		const users = await userModel.listUsers();
		return { users: users.map(publicUser) };
	}

	async function update(id, body) {
		const user = await userModel.updateUser(id, {
			email: body.email,
			password: body.password,
			role: body.role,
			status: body.status,
		});

		if (!user) {
			const error = new Error('User not found.');
			error.statusCode = 404;
			throw error;
		}

		return { user: publicUser(user) };
	}

	async function destroy(id) {
		const deleted = await userModel.deleteUser(id);

		if (!deleted) {
			const error = new Error('User not found.');
			error.statusCode = 404;
			throw error;
		}

		return { deleted: true };
	}
}

module.exports = { createUserController };
