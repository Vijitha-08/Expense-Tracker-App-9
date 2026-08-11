const db = require("../config/db");

// One-time codes for "forgot password".
//
// The table creates itself on first use rather than living in schema.sql. That
// is deliberate: schema.sql is the file that has already cost this project a
// round of data loss, and a new feature has no business editing it. Everything
// here is additive - CREATE TABLE IF NOT EXISTS on a table nothing else
// touches - so it cannot affect users or expenses.
//
// The code itself is NEVER stored. Only a bcrypt hash of it, exactly as with a
// password: a code sitting in plaintext in the database is a second password,
// and it would be readable by anyone who can read the table.
let ready = null;

const ensureTable = () => {
    if (!ready) {
        ready = db.query(`
            CREATE TABLE IF NOT EXISTS password_resets (
                id          SERIAL PRIMARY KEY,
                user_id     INTEGER     NOT NULL REFERENCES users(id) ON DELETE CASCADE,
                code_hash   TEXT        NOT NULL,
                expires_at  TIMESTAMPTZ NOT NULL,
                attempts    INTEGER     NOT NULL DEFAULT 0,
                used_at     TIMESTAMPTZ,
                created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS password_resets_user_idx
                ON password_resets (user_id);
        `).catch((err) => {
            ready = null;              // let the next request try again
            throw err;
        });
    }
    return ready;
};

// A new request supersedes any code still outstanding for that account, so an
// old email cannot be used after a newer one has been sent.
const createCode = async (userId, codeHash, minutes) => {
    await ensureTable();
    await db.query(
        `UPDATE password_resets SET used_at = NOW()
          WHERE user_id = $1 AND used_at IS NULL`,
        [userId]
    );
    const result = await db.query(
        `INSERT INTO password_resets (user_id, code_hash, expires_at)
         VALUES ($1, $2, NOW() + ($3 || ' minutes')::interval)
         RETURNING id, expires_at`,
        [userId, codeHash, String(minutes)]
    );
    return result.rows[0];
};

const latestFor = async (userId) => {
    await ensureTable();
    const result = await db.query(
        `SELECT id, code_hash, expires_at, attempts, used_at, created_at
           FROM password_resets
          WHERE user_id = $1
       ORDER BY id DESC
          LIMIT 1`,
        [userId]
    );
    return result.rows[0] || null;
};

const countAttempt = async (id) => {
    await db.query(
        "UPDATE password_resets SET attempts = attempts + 1 WHERE id = $1",
        [id]
    );
};

const markUsed = async (id) => {
    await db.query("UPDATE password_resets SET used_at = NOW() WHERE id = $1", [id]);
};

// Housekeeping: a used or expired code has no reason to be kept.
const purgeOld = async () => {
    await ensureTable();
    await db.query(
        `DELETE FROM password_resets
          WHERE used_at IS NOT NULL OR expires_at < NOW() - INTERVAL '1 day'`
    );
};

module.exports = { ensureTable, createCode, latestFor, countAttempt, markUsed, purgeOld };
