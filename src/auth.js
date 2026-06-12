const crypto = require('node:crypto');

const HASH_ALGORITHM = 'scrypt';
const KEY_LENGTH = 64;

function hashPassword(password) {
	const salt = crypto.randomBytes(16).toString('hex');
	const hash = crypto.scryptSync(password, salt, KEY_LENGTH).toString('hex');

	return `${HASH_ALGORITHM}$${salt}$${hash}`;
}

function verifyPassword(password, passwordHash) {
	const [algorithm, salt, hash] = String(passwordHash || '').split('$');

	if (algorithm !== HASH_ALGORITHM || !salt || !hash) {
		return false;
	}

	const expected = Buffer.from(hash, 'hex');
	const actual = crypto.scryptSync(password, salt, KEY_LENGTH);

	if (expected.length !== actual.length) {
		return false;
	}

	return crypto.timingSafeEqual(expected, actual);
}

module.exports = {
	hashPassword,
	verifyPassword,
};
