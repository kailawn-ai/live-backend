const crypto = require('node:crypto');

function createStreamStore(pool) {
	return {
		listStreams,
		listPublicStreams,
		getPublicStream,
		createStream,
		updateStream,
		markLiveByStreamKey,
		markOfflineByStreamKey,
	};

	async function listStreams() {
		const [rows] = await pool.query('SELECT * FROM streams ORDER BY created_at DESC');
		return rows.map(mapStreamRow);
	}

	async function listPublicStreams() {
		const [rows] = await pool.query(
			"SELECT * FROM streams WHERE status = 'live' ORDER BY started_at DESC"
		);
		return rows.map(mapPublicStreamRow);
	}

	async function getPublicStream(id) {
		const stream = await findById(id);
		return stream ? toPublicStream(stream) : null;
	}

	async function createStream(body) {
		const title = cleanString(body.title) || 'Untitled Match';
		const id = await uniqueId(slugify(title) || crypto.randomUUID());
		const streamKey = cleanStreamKey(body.streamKey) || crypto.randomBytes(24).toString('hex');
		const hlsBaseUrl = process.env.HLS_BASE_URL || 'http://127.0.0.1:8080/hls';
		const hlsUrl = cleanUrl(body.hlsUrl) || `${hlsBaseUrl}/${streamKey}.m3u8`;
		const now = mysqlDate(new Date());

		try {
			await pool.execute(
				`
					INSERT INTO streams (
						id, title, description, teams, status, stream_key, hls_url,
						created_at, updated_at, started_at, ended_at, last_publisher
					) VALUES (
						:id, :title, :description, :teams, 'offline', :streamKey, :hlsUrl,
						:now, :now, NULL, NULL, NULL
					)
				`,
				{
					id,
					title,
					description: cleanString(body.description) || null,
					teams: cleanString(body.teams) || null,
					streamKey,
					hlsUrl,
					now,
				}
			);
		} catch (error) {
			if (error.code === 'ER_DUP_ENTRY') {
				throw validationError('Stream key already exists.');
			}

			throw error;
		}

		return findById(id);
	}

	async function updateStream(id, body) {
		const stream = await findById(id);

		if (!stream) return null;

		const next = {
			title: typeof body.title === 'string' ? cleanString(body.title) || stream.title : stream.title,
			description:
				typeof body.description === 'string' ? cleanString(body.description) || null : stream.description,
			teams: typeof body.teams === 'string' ? cleanString(body.teams) || null : stream.teams,
			streamKey:
				typeof body.streamKey === 'string' ? cleanStreamKey(body.streamKey) || stream.streamKey : stream.streamKey,
			hlsUrl: typeof body.hlsUrl === 'string' ? cleanUrl(body.hlsUrl) || stream.hlsUrl : stream.hlsUrl,
			status: ['offline', 'live', 'disabled'].includes(body.status) ? body.status : stream.status,
			updatedAt: mysqlDate(new Date()),
		};

		try {
			await pool.execute(
				`
					UPDATE streams
					SET title = :title,
						description = :description,
						teams = :teams,
						stream_key = :streamKey,
						hls_url = :hlsUrl,
						status = :status,
						updated_at = :updatedAt
					WHERE id = :id
				`,
				{ id, ...next }
			);
		} catch (error) {
			if (error.code === 'ER_DUP_ENTRY') {
				throw validationError('Stream key already exists.');
			}

			throw error;
		}

		return findById(id);
	}

	async function markLiveByStreamKey(streamKey, publisher) {
		const stream = await findByStreamKey(streamKey);

		if (!stream || stream.status === 'disabled') return null;

		const now = mysqlDate(new Date());

		await pool.execute(
			`
				UPDATE streams
				SET status = 'live',
					started_at = :now,
					ended_at = NULL,
					updated_at = :now,
					last_publisher = :lastPublisher
				WHERE stream_key = :streamKey
			`,
			{
				streamKey,
				now,
				lastPublisher: JSON.stringify({
					addr: publisher.addr || null,
					clientId: publisher.clientId || null,
				}),
			}
		);

		return findByStreamKey(streamKey);
	}

	async function markOfflineByStreamKey(streamKey) {
		if (!streamKey) return null;

		const now = mysqlDate(new Date());

		await pool.execute(
			`
				UPDATE streams
				SET status = 'offline',
					ended_at = :now,
					updated_at = :now
				WHERE stream_key = :streamKey
			`,
			{ streamKey, now }
		);

		return findByStreamKey(streamKey);
	}

	async function findById(id) {
		const [rows] = await pool.execute('SELECT * FROM streams WHERE id = :id LIMIT 1', { id });
		return rows[0] ? mapStreamRow(rows[0]) : null;
	}

	async function findByStreamKey(streamKey) {
		if (!streamKey) return null;

		const [rows] = await pool.execute('SELECT * FROM streams WHERE stream_key = :streamKey LIMIT 1', {
			streamKey,
		});

		return rows[0] ? mapStreamRow(rows[0]) : null;
	}

	async function uniqueId(baseId) {
		let id = baseId;
		let counter = 2;

		while (await findById(id)) {
			id = `${baseId}-${counter}`;
			counter += 1;
		}

		return id;
	}
}

function mapPublicStreamRow(row) {
	return toPublicStream(mapStreamRow(row));
}

function mapStreamRow(row) {
	return {
		id: row.id,
		title: row.title,
		description: row.description,
		teams: row.teams,
		status: row.status,
		streamKey: row.stream_key,
		hlsUrl: row.hls_url,
		createdAt: toIso(row.created_at),
		updatedAt: toIso(row.updated_at),
		startedAt: toIso(row.started_at),
		endedAt: toIso(row.ended_at),
		lastPublisher: parseJson(row.last_publisher),
	};
}

function toPublicStream(stream) {
	return {
		id: stream.id,
		title: stream.title,
		description: stream.description,
		teams: stream.teams,
		status: stream.status,
		hlsUrl: stream.status === 'live' ? stream.hlsUrl : null,
		startedAt: stream.startedAt,
	};
}

function parseJson(value) {
	if (!value) return null;
	if (typeof value === 'object') return value;

	try {
		return JSON.parse(value);
	} catch {
		return null;
	}
}

function slugify(value) {
	return String(value)
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function cleanString(value) {
	return typeof value === 'string' ? value.trim().slice(0, 200) : '';
}

function cleanStreamKey(value) {
	if (typeof value !== 'string') return '';

	return value.trim().replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 96);
}

function cleanUrl(value) {
	if (typeof value !== 'string') return '';

	const url = value.trim();

	if (!/^https?:\/\//.test(url)) {
		return '';
	}

	return url.slice(0, 500);
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

module.exports = { createStreamStore };
