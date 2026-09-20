const fs = require('fs');
const path = require('path');
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

class SqliteStore {
    // Opens (or creates) the database file and prepares the schema.
    // Call once, then pass the returned DatabaseSync to `new SqliteStore(db)`.
    static connect(file) {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        const db = new DatabaseSync(file);
        db.exec('PRAGMA journal_mode = WAL'); // concurrent readers across clusters
        db.exec('PRAGMA busy_timeout = 5000'); // wait instead of failing on write contention
        db.exec('PRAGMA synchronous = NORMAL');
        db.exec(
            `CREATE TABLE IF NOT EXISTS kv (
                key   TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )`
        );
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
        return row ? row.value : undefined;
    }

    set(key, value) {
        this._set.run(key, value);
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
            yield [row.key, row.value];
        }
    }
}

module.exports = SqliteStore;
