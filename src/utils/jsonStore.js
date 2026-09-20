const fs = require('fs');
const path = require('path');

// A Map that persists itself to a JSON file. Keyv accepts any Map-like object
// as its `store`, so this gives us a zero-dependency disk backend when Redis
// is not configured. Writes are debounced and flushed again on process exit.
class JsonStore extends Map {
    constructor(file) {
        super();
        this.file = file;
        this._timer = null;

        fs.mkdirSync(path.dirname(file), { recursive: true });
        try {
            const data = JSON.parse(fs.readFileSync(file, 'utf8'));
            for (const [key, value] of Object.entries(data)) super.set(key, value);
        } catch {
            // Missing/corrupt file just means we start empty.
        }

        process.on('exit', () => this._flush());
    }

    set(key, value) {
        super.set(key, value);
        this._schedule();
        return this;
    }

    delete(key) {
        const result = super.delete(key);
        this._schedule();
        return result;
    }

    clear() {
        super.clear();
        this._schedule();
    }

    _schedule() {
        clearTimeout(this._timer);
        this._timer = setTimeout(() => this._flush(), 500);
        this._timer.unref?.();
    }

    _flush() {
        clearTimeout(this._timer);
        try {
            fs.writeFileSync(this.file, JSON.stringify(Object.fromEntries(this)));
        } catch {
            // Read-only filesystem etc. — keep running with in-memory data.
        }
    }
}

module.exports = JsonStore;
