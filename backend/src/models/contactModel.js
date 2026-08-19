const db = require("../config/db");

// Messages left on the public "Contact Us" form.
//
// Stored AND emailed, and the order matters: the row is written first, the email
// is attempted after. Email is the part that fails for reasons nobody on this
// side controls - a wrong app password, a blocked port, no SMTP configured at
// all - and a message lost to that is a person who wrote in and got ignored. The
// row is the record; the email is a notification about it.
//
// The table creates itself on first use rather than living in schema.sql, the
// same way password_resets does and for the same reason: schema.sql is the file
// that has already cost this project a round of data loss, and a new feature has
// no business editing it. Everything here is additive - CREATE TABLE IF NOT
// EXISTS on a table nothing else touches - so pulling this change needs no
// migration step and cannot affect users or expenses.
//
// No user_id column. The whole point of a contact form on the landing page is
// that somebody without an account can use it, so there is nothing to reference.
let ready = null;

const ensureTable = () => {
    if (!ready) {
        ready = db.query(`
            CREATE TABLE IF NOT EXISTS contact_messages (
                id          SERIAL PRIMARY KEY,
                name        VARCHAR(100) NOT NULL,
                email       VARCHAR(150) NOT NULL,
                message     TEXT         NOT NULL,
                emailed     BOOLEAN      NOT NULL DEFAULT FALSE,
                created_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
            );
            CREATE INDEX IF NOT EXISTS contact_messages_created_idx
                ON contact_messages (created_at DESC);
            CREATE INDEX IF NOT EXISTS contact_messages_email_idx
                ON contact_messages (email);
        `).catch((err) => {
            ready = null;              // let the next request try again
            throw err;
        });
    }
    return ready;
};

const createMessage = async ({ name, email, message }) => {
    await ensureTable();
    const { rows } = await db.query(
        `INSERT INTO contact_messages (name, email, message)
         VALUES ($1, $2, $3)
         RETURNING id, created_at`,
        [name, email, message]
    );
    return rows[0];
};

// Set once the notification has actually gone out, so an un-emailed backlog is
// findable later instead of being indistinguishable from a delivered one.
const markEmailed = async (id) => {
    await db.query("UPDATE contact_messages SET emailed = TRUE WHERE id = $1", [id]);
};

// How many messages this address has sent since `since`. The per-IP ceiling in
// the controller is the first gate; this is the one that survives a restart,
// because an in-memory counter does not.
const countRecentFrom = async (email, since) => {
    await ensureTable();
    const { rows } = await db.query(
        "SELECT COUNT(*)::int AS n FROM contact_messages WHERE email = $1 AND created_at > $2",
        [email, since]
    );
    return rows[0].n;
};

module.exports = { createMessage, markEmailed, countRecentFrom };
