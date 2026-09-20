const session = require('express-session');

// express-session adapter over the bot's Keyv store — sessions land in the
// same SQLite file (or Redis) as everything else, so logins survive restarts.
class KeyvSessionStore extends session.Store {
    constructor(keyv) {
        super();
        this.keyv = keyv;
    }

    get(sid, callback) {
        this.keyv.get(sid).then((s) => callback(null, s ?? null)).catch(callback);
    }

    set(sid, sess, callback) {
        const ttl = sess?.cookie?.maxAge ?? 86_400_000;
        this.keyv.set(sid, sess, ttl).then(() => callback(null)).catch(callback);
    }

    destroy(sid, callback) {
        this.keyv.delete(sid).then(() => callback(null)).catch(callback);
    }
}

module.exports = KeyvSessionStore;
