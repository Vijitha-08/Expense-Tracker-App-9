const db = require("../config/db");

// Display preferences, per account.
//
// WHY THIS EXISTS. DisplayContext.jsx keeps four switches - estimated amounts,
// date style, default period, theme - in localStorage, and its comment says that
// is deliberate: "If these ever need to follow the account across machines, that
// is the point to move them server-side." That point arrived. Signing in on a
// second machine gave a different Settings page from the first, which reads as a
// bug even though nothing was broken.
//
// localStorage is NOT removed. It stays as the instant, offline-safe copy so the
// page paints the right theme before any request finishes - a server round trip
// on every load would put a flash of the wrong theme on every navigation. This
// table is the durable copy that a second browser hydrates from.
//
// The table creates itself on first use rather than living in schema.sql, the
// same way password_resets and contact_messages do, and for the same reason
// recorded there: schema.sql is the file that has already cost this project a
// round of data loss, and a new feature has no business editing it. Everything
// here is additive - CREATE TABLE IF NOT EXISTS on a table nothing else touches -
// so pulling this change needs no migration step.
//
// One row per user, keyed on user_id, ON DELETE CASCADE so deleting an account
// takes its preferences with it rather than leaving an orphan.
let ready = null;

const ensureTable = () => {
    if (!ready) {
        ready = db.query(`
            CREATE TABLE IF NOT EXISTS user_preferences (
                user_id        INTEGER      PRIMARY KEY
                               REFERENCES users(id) ON DELETE CASCADE,
                estimated      BOOLEAN      NOT NULL DEFAULT TRUE,
                date_style     VARCHAR(8)   NOT NULL DEFAULT 'long',
                default_period VARCHAR(8)   NOT NULL DEFAULT 'all',
                theme          VARCHAR(8)   NOT NULL DEFAULT 'system',
                updated_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            );
        `).catch((err) => {
            ready = null;              // let the next request try again
            throw err;
        });
    }
    return ready;
};

// Returns null when the user has never saved anything, so the caller can tell
// "no preference recorded" apart from "recorded, and happens to match the
// defaults". The frontend needs that distinction: only the first case should let
// whatever is already in localStorage win.
const getPreferences = async (userId) => {
    await ensureTable();
    const { rows } = await db.query(
        `SELECT estimated, date_style, default_period, theme
           FROM user_preferences WHERE user_id = $1`,
        [userId]
    );
    if (!rows.length) return null;
    const r = rows[0];
    return {
        estimated: r.estimated,
        dateStyle: r.date_style,
        defaultPeriod: r.default_period,
        theme: r.theme,
    };
};

// A single upsert rather than select-then-insert-or-update: two statements would
// need a transaction to be safe against two tabs saving at once, and ON CONFLICT
// is one round trip that cannot interleave.
const savePreferences = async (userId, { estimated, dateStyle, defaultPeriod, theme }) => {
    await ensureTable();
    const { rows } = await db.query(
        `INSERT INTO user_preferences (user_id, estimated, date_style, default_period, theme)
         VALUES ($1, $2, $3, $4, $5)
         ON CONFLICT (user_id) DO UPDATE SET
             estimated      = EXCLUDED.estimated,
             date_style     = EXCLUDED.date_style,
             default_period = EXCLUDED.default_period,
             theme          = EXCLUDED.theme,
             updated_at     = NOW()
         RETURNING estimated, date_style, default_period, theme`,
        [userId, estimated, dateStyle, defaultPeriod, theme]
    );
    const r = rows[0];
    return {
        estimated: r.estimated,
        dateStyle: r.date_style,
        defaultPeriod: r.default_period,
        theme: r.theme,
    };
};

module.exports = { getPreferences, savePreferences };
