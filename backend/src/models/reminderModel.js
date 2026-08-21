const db = require("../config/db");

// Reminders attached to recurring expenses.
//
// The table creates itself on first use rather than living in scripts/schema.sql,
// exactly as password_resets does in resetModel.js and user_preferences does in
// preferenceModel.js. Same reason, stated there and still true: schema.sql is the
// file that has already cost this project a round of data loss, and a new feature
// has no business editing it. Everything here is additive - CREATE TABLE IF NOT
// EXISTS on a table nothing else touches - so it cannot affect users or expenses.
//
// THREE THINGS IN THE TABLE DEFINITION ARE LOAD-BEARING:
//
//   * ON DELETE CASCADE twice. Delete the expense and its reminder goes with it;
//     delete the account and all of them go. A reminder pointing at a row that
//     no longer exists would otherwise render as a blank line on the page for
//     ever, and there would be no way to remove it from the UI.
//
//   * UNIQUE (expense_id). One reminder per expense, which is what makes "set a
//     reminder on this" an upsert rather than an insert. Two open tabs saving at
//     once cannot produce two reminders for the same rent.
//
//   * user_id alongside expense_id, even though it is derivable through the
//     join. It is what every WHERE clause below filters on, so ownership is one
//     column on the row being read rather than a join somebody could forget to
//     write. The INSERT is the only place the two could ever disagree, and it
//     takes expense_id from a SELECT already filtered by the same user_id - see
//     upsert().
let ready = null;

const ensureTable = () => {
    if (!ready) {
        ready = db.query(`
            CREATE TABLE IF NOT EXISTS expense_reminders (
                id           SERIAL PRIMARY KEY,
                user_id      INTEGER     NOT NULL REFERENCES users(id)    ON DELETE CASCADE,
                expense_id   INTEGER     NOT NULL REFERENCES expenses(id) ON DELETE CASCADE,
                frequency    VARCHAR(12) NOT NULL DEFAULT 'monthly'
                             CHECK (frequency IN ('weekly', 'monthly', 'quarterly', 'yearly')),
                lead_days    SMALLINT    NOT NULL DEFAULT 3
                             CHECK (lead_days IN (1, 3, 7)),
                enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
                -- Null until a reminder has actually been delivered. Nothing
                -- writes it yet: delivery is in-app for now, by decision. It is
                -- here because the alternative is an ALTER TABLE on live data
                -- the day email is switched on, and because statusFor() in
                -- utils/recurrence.js already reads it.
                last_sent_at TIMESTAMPTZ,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                UNIQUE (expense_id)
            );
            CREATE INDEX IF NOT EXISTS expense_reminders_user_idx
                ON expense_reminders (user_id);
        `).catch((err) => {
            ready = null;              // let the next request try again
            throw err;
        });
    }
    return ready;
};

// The columns the API returns, joined to the expense they belong to. The
// expense fields are read-only here - this feature never writes to `expenses`.
const SELECT_COLUMNS = `
    r.id, r.expense_id, r.frequency, r.lead_days, r.enabled,
    r.last_sent_at, r.created_at, r.updated_at,
    e.title, e.amount, e.category, e.expense_date
`;

// Every reminder on one account. Ordered by the anchor date so the list reads
// newest-anchor-first, matching how the expense tables in this app are ordered;
// the page re-sorts by projected due date, which is a derived value and cannot
// be ordered on in SQL.
const listForUser = async (userId) => {
    await ensureTable();
    const { rows } = await db.query(
        `SELECT ${SELECT_COLUMNS}
           FROM expense_reminders r
           JOIN expenses e ON e.id = r.expense_id
          WHERE r.user_id = $1
          ORDER BY e.expense_date DESC, r.id DESC`,
        [userId]
    );
    return rows;
};

const findById = async (userId, id) => {
    await ensureTable();
    const { rows } = await db.query(
        `SELECT ${SELECT_COLUMNS}
           FROM expense_reminders r
           JOIN expenses e ON e.id = r.expense_id
          WHERE r.id = $1 AND r.user_id = $2`,
        [id, userId]
    );
    return rows[0] || null;
};

// Create or update the reminder on one expense.
//
// OWNERSHIP IS ENFORCED BY THE QUERY, not by a check in front of it. The row to
// insert comes from `SELECT ... FROM expenses WHERE id = $2 AND user_id = $1`,
// so an expense belonging to somebody else produces zero rows and therefore no
// insert - there is nothing to forget and nothing to race. rowCount === 0 means
// "not your expense, or no such expense", and the controller answers 404 to both
// without distinguishing them.
//
// The WHERE on the conflict branch does the same job for an UPDATE: it refuses
// to overwrite a reminder row that belongs to another account, which is what
// stops a guessed expense_id from hijacking somebody else's settings.
const upsert = async ({ userId, expenseId, frequency, leadDays, enabled }) => {
    await ensureTable();
    const { rows } = await db.query(
        `INSERT INTO expense_reminders (user_id, expense_id, frequency, lead_days, enabled)
         SELECT $1, e.id, $3, $4, $5
           FROM expenses e
          WHERE e.id = $2 AND e.user_id = $1
         ON CONFLICT (expense_id) DO UPDATE
            SET frequency  = EXCLUDED.frequency,
                lead_days  = EXCLUDED.lead_days,
                enabled    = EXCLUDED.enabled,
                updated_at = NOW()
          WHERE expense_reminders.user_id = EXCLUDED.user_id
         RETURNING id`,
        [userId, expenseId, frequency, leadDays, enabled]
    );
    if (!rows[0]) return null;
    return findById(userId, rows[0].id);
};

// Change the settings on an existing reminder. Only the three fields the page
// can edit, and `enabled` is separated out so the switch is one round trip
// rather than a read-modify-write that could clobber a frequency change made in
// another tab.
const update = async (userId, id, { frequency, leadDays, enabled }) => {
    await ensureTable();
    const { rows } = await db.query(
        // The casts are not decoration: with a bare `COALESCE($3, frequency)`
        // and a null bound to $3, Postgres cannot infer the parameter's type and
        // the statement fails with "could not determine data type of parameter".
        `UPDATE expense_reminders
            SET frequency  = COALESCE($3::varchar, frequency),
                lead_days  = COALESCE($4::smallint, lead_days),
                enabled    = COALESCE($5::boolean, enabled),
                updated_at = NOW()
          WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, userId, frequency ?? null, leadDays ?? null, enabled ?? null]
    );
    if (!rows[0]) return null;
    return findById(userId, rows[0].id);
};

const remove = async (userId, id) => {
    await ensureTable();
    const { rowCount } = await db.query(
        "DELETE FROM expense_reminders WHERE id = $1 AND user_id = $2",
        [id, userId]
    );
    return rowCount > 0;
};

// The user's expenses that do NOT already have a reminder, so the "add a
// reminder" picker can only offer something valid. Capped, because the picker is
// a dropdown and 500 options is not a dropdown - the page says so when the cap
// bites rather than silently showing a short list.
//
// LEFT JOIN ... IS NULL rather than NOT IN (SELECT ...): the same result, but it
// keeps working if a reminder row ever has a null expense_id, which NOT IN would
// turn into an empty list without a word.
const AVAILABLE_LIMIT = 100;

const availableExpenses = async (userId) => {
    await ensureTable();
    const { rows } = await db.query(
        `SELECT e.id, e.title, e.amount, e.category, e.expense_date
           FROM expenses e
           LEFT JOIN expense_reminders r ON r.expense_id = e.id
          WHERE e.user_id = $1 AND r.id IS NULL
          ORDER BY e.expense_date DESC, e.id DESC
          LIMIT $2`,
        [userId, AVAILABLE_LIMIT]
    );
    return rows;
};

/* ============================================================
   WHEN EMAIL DELIVERY IS SWITCHED ON
   ============================================================
   Reminders are in-app for now: the page shows what is coming and flags
   anything inside its window. That was a deliberate choice, not an oversight -
   a scheduler living inside a dev server dies on every restart, and SMTP is not
   configured yet, so an email path shipped today would be a feature that
   silently does nothing.

   What is already in place for it: `last_sent_at` on the table, and
   statusFor() in utils/recurrence.js reading it to return "sent".

   What is deliberately NOT in place: a query and a mailer template that nothing
   calls. Untested code that runs for the first time in production is worse than
   no code, so here is the shape instead, and it is one function plus one caller:

     const dueForNotification = async () => {
         await ensureTable();
         const { rows } = await db.query(
             `SELECT ${SELECT_COLUMNS}, u.email, u.name
                FROM expense_reminders r
                JOIN expenses e ON e.id = r.expense_id
                JOIN users u    ON u.id = r.user_id
               WHERE r.enabled = TRUE`
         );
         // Filter in JS with describe() from utils/recurrence.js rather than in
         // SQL: the projection rules already live there, and a second copy in
         // SQL is the two-implementations problem this feature was careful to
         // avoid. Take the rows whose status is "due".
         return rows.filter((r) => describe(r).status === "due");
     };

   The caller is a setInterval in server.js (or an external cron hitting an
   authenticated route, which survives restarts and is the better answer once
   this is deployed): for each row, send through services/mailer.js and then
   `UPDATE expense_reminders SET last_sent_at = NOW() WHERE id = $1`. That write
   is what stops the same reminder emailing every hour until the expense comes
   round, and it is why statusFor() checks `sent >= remindOn` rather than merely
   "is last_sent_at set" - the next occurrence's window reopens on its own.
   ============================================================ */

module.exports = {
    AVAILABLE_LIMIT,
    availableExpenses,
    findById,
    listForUser,
    remove,
    update,
    upsert,
};
