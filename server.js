const crypto = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const { createAuthController } = require('./src/controllers/auth-controller');
const { createUserController } = require('./src/controllers/user-controller');
const { initDb } = require('./src/db');
const { createStreamStore } = require('./src/stream-store');
const { createUserModel } = require('./src/models/user-model');

loadEnvFile(path.join(__dirname, '.env'));

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '127.0.0.1';
const FRONTEND_ORIGIN = process.env.FRONTEND_ORIGIN || 'http://127.0.0.1:5174';
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@zostream.test';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'change-this-password';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

let streamStore;
let authController;
let userController;

const server = http.createServer(async (req, res) => {
	try {
		setCorsHeaders(res);

		if (req.method === 'OPTIONS') {
			return sendNoContent(res);
		}

		const url = new URL(req.url || '/', `http://${req.headers.host}`);

		if (req.method === 'GET' && url.pathname === '/health') {
			return sendJson(res, 200, {
				ok: true,
				service: 'fifa-back',
				storage: 'mysql',
				time: new Date().toISOString(),
			});
		}

		if (req.method === 'POST' && url.pathname === '/auth/login') {
			const body = await readJson(req);
			return sendJson(res, 200, await authController.login(body));
		}

		if (req.method === 'GET' && url.pathname === '/auth/me') {
			const authUser = requireAuth(req);
			return sendJson(res, 200, await authController.me(authUser));
		}

		if (req.method === 'GET' && url.pathname === '/streams') {
			requireAdmin(req);
			const streams = await streamStore.listStreams();
			return sendJson(res, 200, { streams });
		}

		if (req.method === 'GET' && url.pathname === '/public/streams') {
			requireAuth(req);
			const streams = await streamStore.listPublicStreams();
			return sendJson(res, 200, { streams });
		}

		if (req.method === 'POST' && url.pathname === '/streams') {
			requireAdmin(req);
			const body = await readJson(req);
			const stream = await streamStore.createStream({
				title: body.title,
				description: body.description,
				teams: body.teams,
			});

			return sendJson(res, 201, { stream });
		}

		const streamIdMatch = url.pathname.match(/^\/streams\/([^/]+)$/);
		if (streamIdMatch && req.method === 'PATCH') {
			requireAdmin(req);
			const stream = await streamStore.updateStream(streamIdMatch[1], await readJson(req));

			if (!stream) {
				return sendJson(res, 404, { error: 'Stream not found.' });
			}

			return sendJson(res, 200, { stream });
		}

		if (streamIdMatch && req.method === 'GET') {
			requireAuth(req);
			const stream = await streamStore.getPublicStream(streamIdMatch[1]);

			if (!stream) {
				return sendJson(res, 404, { error: 'Stream not found.' });
			}

			return sendJson(res, 200, { stream });
		}

		if (req.method === 'GET' && url.pathname === '/users') {
			requireAdmin(req);
			return sendJson(res, 200, await userController.index());
		}

		if (req.method === 'POST' && url.pathname === '/users') {
			requireAdmin(req);
			return sendJson(res, 201, await userController.create(await readJson(req)));
		}

		const userIdMatch = url.pathname.match(/^\/users\/(\d+)$/);
		if (userIdMatch && req.method === 'PATCH') {
			requireAdmin(req);
			return sendJson(res, 200, await userController.update(userIdMatch[1], await readJson(req)));
		}

		if (userIdMatch && req.method === 'DELETE') {
			requireAdmin(req);
			return sendJson(res, 200, await userController.destroy(userIdMatch[1]));
		}

		if (req.method === 'POST' && url.pathname === '/rtmp/on-publish') {
			const body = await readFormOrJson(req);
			const name = body.name || body.stream || body.key;
			const stream = await streamStore.markLiveByStreamKey(name, {
				addr: body.addr || req.socket.remoteAddress || null,
				clientId: body.clientid || null,
			});

			if (!stream) {
				return sendText(res, 403, 'forbidden');
			}

			return sendText(res, 200, 'ok');
		}

		if (req.method === 'POST' && url.pathname === '/rtmp/on-done') {
			const body = await readFormOrJson(req);
			const name = body.name || body.stream || body.key;

			await streamStore.markOfflineByStreamKey(name);

			return sendText(res, 200, 'ok');
		}

		return sendJson(res, 404, { error: 'Route not found.' });
	} catch (error) {
		if (error.statusCode) {
			return sendJson(res, error.statusCode, { error: error.message });
		}

		console.error(error);
		return sendJson(res, 500, { error: 'Internal server error.' });
	}
});

start().catch((error) => {
	console.error('Failed to start fifa-back.');
	console.error(error);
	process.exit(1);
});

async function start() {
	const pool = await initDb();
	const userModel = createUserModel(pool);

	await userModel.seedAdminUser({
		email: ADMIN_EMAIL,
		password: ADMIN_PASSWORD,
	});

	streamStore = createStreamStore(pool);
	authController = createAuthController({ userModel, signToken });
	userController = createUserController({ userModel });

	server.listen(PORT, HOST, () => {
		console.log(`fifa-back listening on http://${HOST}:${PORT}`);
	});
}

function requireAuth(req) {
	const header = req.headers.authorization || '';
	const token = header.startsWith('Bearer ') ? header.slice(7) : '';
	const payload = verifyToken(token);

	if (!payload) {
		const error = new Error('Unauthorized.');
		error.statusCode = 401;
		throw error;
	}

	return payload;
}

function requireAdmin(req) {
	const payload = requireAuth(req);

	if (payload.role !== 'admin') {
		const error = new Error('Forbidden.');
		error.statusCode = 403;
		throw error;
	}

	return payload;
}

function signToken(payload) {
	const header = base64Url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
	const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60 * 12;
	const body = base64Url(JSON.stringify({ ...payload, exp: expiresAt }));
	const signature = hmac(`${header}.${body}`);

	return `${header}.${body}.${signature}`;
}

function verifyToken(token) {
	const parts = token.split('.');

	if (parts.length !== 3) return null;

	const [header, body, signature] = parts;
	const expected = hmac(`${header}.${body}`);

	if (!safeEqual(signature, expected)) return null;

	let payload;

	try {
		payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8'));
	} catch {
		return null;
	}

	if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) {
		return null;
	}

	return payload;
}

function hmac(value) {
	return crypto.createHmac('sha256', JWT_SECRET).update(value).digest('base64url');
}

function safeEqual(a, b) {
	const aBuffer = Buffer.from(a);
	const bBuffer = Buffer.from(b);

	if (aBuffer.length !== bBuffer.length) return false;

	return crypto.timingSafeEqual(aBuffer, bBuffer);
}

function base64Url(value) {
	return Buffer.from(value).toString('base64url');
}

async function readJson(req) {
	const raw = await readBody(req);

	if (!raw) return {};

	try {
		return JSON.parse(raw);
	} catch {
		const error = new Error('Invalid JSON body.');
		error.statusCode = 400;
		throw error;
	}
}

async function readFormOrJson(req) {
	const contentType = req.headers['content-type'] || '';

	if (contentType.includes('application/json')) {
		return readJson(req);
	}

	const raw = await readBody(req);
	const params = new URLSearchParams(raw);
	const body = {};

	for (const [key, value] of params.entries()) {
		body[key] = value;
	}

	return body;
}

function readBody(req) {
	return new Promise((resolve, reject) => {
		let body = '';

		req.on('data', (chunk) => {
			body += chunk;

			if (body.length > 1024 * 1024) {
				req.destroy();
				reject(Object.assign(new Error('Request body too large.'), { statusCode: 413 }));
			}
		});

		req.on('end', () => resolve(body));
		req.on('error', reject);
	});
}

function loadEnvFile(filePath) {
	if (!fs.existsSync(filePath)) return;

	const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

	for (const line of lines) {
		const trimmed = line.trim();

		if (!trimmed || trimmed.startsWith('#')) continue;

		const separatorIndex = trimmed.indexOf('=');
		if (separatorIndex === -1) continue;

		const key = trimmed.slice(0, separatorIndex).trim();
		const value = trimmed.slice(separatorIndex + 1).trim().replace(/^["']|["']$/g, '');

		if (key && process.env[key] === undefined) {
			process.env[key] = value;
		}
	}
}

function setCorsHeaders(res) {
	res.setHeader('Access-Control-Allow-Origin', FRONTEND_ORIGIN);
	res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,OPTIONS');
	res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
	res.setHeader('Vary', 'Origin');
}

function sendJson(res, statusCode, payload) {
	res.writeHead(statusCode, { 'Content-Type': 'application/json; charset=utf-8' });
	res.end(JSON.stringify(payload));
}

function sendText(res, statusCode, text) {
	res.writeHead(statusCode, { 'Content-Type': 'text/plain; charset=utf-8' });
	res.end(text);
}

function sendNoContent(res) {
	res.writeHead(204);
	res.end();
}
