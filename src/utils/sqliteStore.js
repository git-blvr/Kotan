const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { DatabaseSync } = require('node:sqlite');

// SQLite-backed Keyv storage adapter using Node's built-in node:sqlite —
// no native compilation, no extra dependencies.
//
// One database file, one `kv` table. Each Keyv namespace (economy, warns,
// tempbans) gets its own SqliteStore instance sharing the same connection;
// Keyv prefixes keys as "namespace:key" so namespaces never collide.
//
// `opts.dialect = 'sqlite'` tells Keyv this store supports iteration, which
// is what makes db.iterateTempbans() work.
//
// Values are encrypted at rest with AES-256-GCM (stored as "v1:<base64>").
// Keys stay plaintext — they're only snowflake IDs and namespace prefixes,
// and encrypting them would break the LIKE queries iterator()/clear() need.
// The 256-bit key comes from the DB_KEY env var (hex or passphrase), or is
// generated once into data/.dbkey (mode 600, gitignored with the rest of
// data/). Losing it means losing the data — that's the point.

const PREFIX = 'v1:';
let KEY = null;

function loadKey(dbFile) {
    if (process.env.DB_KEY) {
        const k = process.env.DB_KEY.trim();
        return /^[0-9a-fA-F]{64}$/.test(k)
            ? Buffer.from(k, 'hex')
            : crypto.createHash('sha256').update(k).digest();
    }
    const keyPath = path.join(path.dirname(dbFile), '.dbkey');
    if (fs.existsSync(keyPath)) {
        return Buffer.from(fs.readFileSync(keyPath, 'utf8').trim(), 'hex');
    }
    const key = crypto.randomBytes(32);
    fs.writeFileSync(keyPath, key.toString('hex'), { mode: 0o600 });
    console.log(`[sqlite] generated encryption key at ${keyPath} — losing it makes the database unreadable`);
    return key;
}

function encrypt(plaintext) {
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    const data = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return PREFIX + Buffer.concat([iv, cipher.getAuthTag(), data]).toString('base64');
}

function decrypt(stored) {
    if (typeof stored !== 'string' || !stored.startsWith(PREFIX)) return stored; // legacy plaintext
    const raw = Buffer.from(stored.slice(PREFIX.length), 'base64');
    const iv = raw.subarray(0, 12);
    const tag = raw.subarray(12, 28);
    const data = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', KEY, iv);
    decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
}

class SqliteStore {
    // Opens (or creates) the database file and prepares the schema.
    // Call once, then pass the returned DatabaseSync to `new SqliteStore(db)`.
    static connect(file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        KEY = loadKey(file);
        const db = new DatabaseSync(file);
        db.exec('PRAGMA journal_mode = WAL'); // concurrent readers (bot + CLI tools)
        db.exec('PRAGMA busy_timeout = 5000'); // wait instead of failing on write contention
        db.exec('PRAGMA synchronous = NORMAL');
        db.exec(
            `CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )`
        );
        // Developer-maintained guild blacklist — written by the website's
        // /api/admin/blacklist route, read here for the command gate and
        // auto-leave. Mirrors web/migrations/0001 exactly.
        db.exec(
            `CREATE TABLE IF NOT EXISTS blacklisted_guilds (
                guild_id       TEXT PRIMARY KEY,
                reason         TEXT NOT NULL,
                blacklisted_by TEXT NOT NULL,
                blacklisted_at INTEGER NOT NULL
            )`
        );
        try {
            fs.chmodSync(file, 0o600); // owner-only read/write where supported
        } catch {}

        // One-time migration: encrypt rows written before encryption existed.
        const plain = db.prepare(`SELECT key, value FROM kv WHERE value NOT LIKE '${PREFIX}%'`).all();
        if (plain.length) {
            const upd = db.prepare('UPDATE kv SET value = ? WHERE key = ?');
            for (const row of plain) upd.run(encrypt(row.value), row.key);
            console.log(`[sqlite] encrypted ${plain.length} existing rows`);
        }
        return db;
    }

    constructor(db) {
        this.db = db;
        this.opts = { dialect: 'sqlite', url: 'sqlite' };
        this.namespace = 'keyv'; // Keyv overwrites this per instance

        this._get = db.prepare('SELECT value FROM kv WHERE key = ?');
        this._set = db.prepare('INSERT OR REPLACE INTO kv (key, value) VALUES (?, ?)');
        this._delete = db.prepare('DELETE FROM kv WHERE key = ?');
        this._clear = db.prepare('DELETE FROM kv WHERE key LIKE ?');
        this._iterate = db.prepare('SELECT key, value FROM kv WHERE key LIKE ?');
    }

    get(key) {
        const row = this._get.get(key);
        return row ? decrypt(row.value) : undefined;
    }

    set(key, value) {
        this._set.run(key, encrypt(value));
    }

    delete(key) {
        return this._delete.run(key).changes > 0;
    }

    clear() {
        // Only this namespace's keys — the table is shared.
        this._clear.run(`${this.namespace}:%`);
    }

    // Keyv calls this with the store's namespace and expects [key, value] pairs.
    *iterator(namespace = this.namespace) {
        for (const row of this._iterate.all(`${namespace}:%`)) {
            yield [row.key, decrypt(row.value)];
        }
    }
}

module.exports = SqliteStore;
