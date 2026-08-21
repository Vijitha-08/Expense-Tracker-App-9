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
                expense_id   INTEGER              REFERENCES expenses(id) ON DELETE CASCADE,
                frequency    VARCHAR(12) NOT NULL DEFAULT 'monthly',
                lead_days    SMALLINT    NOT NULL DEFAULT 3
                             CHECK (lead_days IN (1, 3, 7)),
                enabled      BOOLEAN     NOT NULL DEFAULT TRUE,
                -- Null until a reminder has actually been delivered. Nothing
                -- writes it yet: delivery is in-app for now, by decision. It is
                -- here because the alternative is an ALTER TABLE on live data
                -- the day email is switched on, and because statusFor() in
                -- utils/recurrence.js already reads it.
                last_sent_at TIMESTAMPTZ,
                -- A standalone upcoming bill carries its own name and amount,
                -- because there is no expense row to read them from. Both stay
                -- null for a reminder attached to an expense - see the shape
                -- constraint in the migration below.
                title        VARCHAR(150),
                amount       NUMERIC(12, 2),
                -- A due date the user TYPED. When set it wins outright over the
                -- projection, and it counts on the day itself. Null means
                -- "project it from the expense's own date".
                due_on       DATE,
                -- A reminder date the user TYPED, overriding lead_days. Null
                -- means "due_on minus lead_days".
                remind_on    DATE,
                -- Payment tracking. THREE COLUMNS, and each earns its place:
                --   paid_on          the day the money went out, for display.
                --   paid_for         WHICH occurrence that payment settled. Not
                --                    the same thing: pay a bill due the 23rd on
                --                    the 21st and only this column knows the
                --                    23rd is done. See the "after" option on
                --                    nextOccurrence. (No backticks in here: this
                --                    comment lives inside a JS template literal,
                --                    and one would end the string mid-schema.)
                --   paid_expense_id  the expense row created at the same moment.
                --                    ON DELETE SET NULL, not CASCADE: deleting
                --                    that expense later must not silently delete
                --                    the reminder with it.
                paid_on         DATE,
                paid_for        DATE,
                paid_expense_id INTEGER REFERENCES expenses(id) ON DELETE SET NULL,
                created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
                -- Nulls do not collide in a Postgres unique index, so this still
                -- means "one reminder per expense" while allowing any number of
                -- standalone bills, which have no expense_id at all.
                UNIQUE (expense_id)
            );
            CREATE INDEX IF NOT EXISTS expense_reminders_user_idx
                ON expense_reminders (user_id);
        `)
            // ------------------------------------------------------------
            // MIGRATION for a table that already exists
            // ------------------------------------------------------------
            // CREATE TABLE IF NOT EXISTS does NOTHING to an existing table, so
            // the block above only shapes a fresh database. Anybody who ran the
            // previous round already has expense_reminders with a NOT NULL
            // expense_id, no title/amount/due_on/remind_on, and a frequency
            // CHECK that rejects 'once'. Without this they would get a constraint
            // violation the first time they added an upcoming bill.
            //
            // Every statement here is idempotent and none of them touches a row:
            //
            //   * DROP NOT NULL is a no-op if the column is already nullable.
            //   * ADD COLUMN IF NOT EXISTS speaks for itself.
            //   * the two CHECKs are dropped by name and re-added, which is the
            //     only way to WIDEN a constraint - and dropping a check never
            //     alters data, it only stops enforcing something.
            //
            // The shape check is the important one. It says a row is EITHER
            // attached to an expense (and reads its name and amount from there)
            // OR is a standalone bill carrying its own name, amount and due
            // date. Nothing in between: a half-filled row would render as a
            // blank line on the page with no way to fix it. Existing rows all
            // have expense_id set with the three new columns null, so they
            // satisfy the first branch and the constraint validates without a
            // single UPDATE.
            .then(() => db.query(`
                ALTER TABLE expense_reminders ALTER COLUMN expense_id DROP NOT NULL;
                ALTER TABLE expense_reminders ADD COLUMN IF NOT EXISTS title     VARCHAR(150);
                ALTER TABLE expense_reminders ADD COLUMN IF NOT EXISTS amount    NUMERIC(12, 2);
                ALTER TABLE expense_reminders ADD COLUMN IF NOT EXISTS due_on    DATE;
                ALTER TABLE expense_reminders ADD COLUMN IF NOT EXISTS remind_on DATE;
                ALTER TABLE expense_reminders ADD COLUMN IF NOT EXISTS paid_on   DATE;
                ALTER TABLE expense_reminders ADD COLUMN IF NOT EXISTS paid_for  DATE;
                ALTER TABLE expense_reminders
                    ADD COLUMN IF NOT EXISTS paid_expense_id INTEGER;
                -- The foreign key is added separately and guarded by name,
                -- because ADD COLUMN IF NOT EXISTS carries no constraint on a
                -- second run and ADD CONSTRAINT has no IF NOT EXISTS of its own.
                ALTER TABLE expense_reminders
                    DROP CONSTRAINT IF EXISTS expense_reminders_paid_expense_fkey;
                ALTER TABLE expense_reminders
                    ADD  CONSTRAINT expense_reminders_paid_expense_fkey
                    FOREIGN KEY (paid_expense_id) REFERENCES expenses(id) ON DELETE SET NULL;

                ALTER TABLE expense_reminders
                    DROP CONSTRAINT IF EXISTS expense_reminders_frequency_check;
                ALTER TABLE expense_reminders
                    ADD  CONSTRAINT expense_reminders_frequency_check
                    CHECK (frequency IN ('once', 'weekly', 'monthly', 'quarterly', 'yearly'));

                ALTER TABLE expense_reminders
                    DROP CONSTRAINT IF EXISTS expense_reminders_shape_check;
                ALTER TABLE expense_reminders
                    ADD  CONSTRAINT expense_reminders_shape_check CHECK (
                        (expense_id IS NOT NULL AND title IS NULL AND amount IS NULL)
                     OR (expense_id IS NULL
                         AND title  IS NOT NULL
                         AND amount IS NOT NULL
                         AND due_on IS NOT NULL)
                    );
            `))
            .catch((err) => {
                ready = null;              // let the next request try again
                throw err;
            });
    }
    return ready;
};

// The columns the API returns, joined to the expense they belong to. The
// expense fields are read-only here - this feature never writes to `expenses`.
// COALESCE, so the API returns one shape whatever the row is. A reminder
// attached to an expense reads its name and amount from `expenses`; a standalone
// bill carries its own. The page should not have to know which, and `source`
// tells it anyway for the one place it matters - labelling a typed due date
// differently from a projected one.
//
// `expense_date` stays null for a standalone bill. That is not a gap: such a row
// has no anchor to project from, which is exactly why due_on is mandatory on it.
const SELECT_COLUMNS = `
    r.id, r.expense_id, r.frequency, r.lead_days, r.enabled,
    r.last_sent_at, r.due_on, r.remind_on, r.created_at, r.updated_at,
    r.paid_on, r.paid_for, r.paid_expense_id,
    COALESCE(r.title,  e.title)  AS title,
    COALESCE(r.amount, e.amount) AS amount,
    e.category, e.expense_date,
    CASE WHEN r.expense_id IS NULL THEN 'bill' ELSE 'expense' END AS source
`;

// Every reminder on one account.
//
// LEFT JOIN, not JOIN: a standalone bill has no expense_id, and an inner join
// would silently drop every one of them - the page would look like the save had
// failed. Ordered by the anchor date with nulls last so bills do not float to
// the top for want of one; the page re-sorts by the projected due date, which is
// a derived value and cannot be ordered on in SQL.
const listForUser = async (userId) => {
    await ensureTable();
    const { rows } = await db.query(
        `SELECT ${SELECT_COLUMNS}
           FROM expense_reminders r
           LEFT JOIN expenses e ON e.id = r.expense_id
          WHERE r.user_id = $1
          ORDER BY e.expense_date DESC NULLS LAST, r.id DESC`,
        [userId]
    );
    return rows;
};

const findById = async (userId, id) => {
    await ensureTable();
    const { rows } = await db.query(
        `SELECT ${SELECT_COLUMNS}
           FROM expense_reminders r
           LEFT JOIN expenses e ON e.id = r.expense_id
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
const upsert = async ({
    userId, expenseId, frequency, leadDays, enabled, dueOn, remindOn,
}) => {
    await ensureTable();
    const { rows } = await db.query(
        `INSERT INTO expense_reminders
             (user_id, expense_id, frequency, lead_days, enabled, due_on, remind_on)
         SELECT $1, e.id, $3, $4, $5, $6::date, $7::date
           FROM expenses e
          WHERE e.id = $2 AND e.user_id = $1
         ON CONFLICT (expense_id) DO UPDATE
            SET frequency  = EXCLUDED.frequency,
                lead_days  = EXCLUDED.lead_days,
                enabled    = EXCLUDED.enabled,
                due_on     = EXCLUDED.due_on,
                remind_on  = EXCLUDED.remind_on,
                updated_at = NOW()
          WHERE expense_reminders.user_id = EXCLUDED.user_id
         RETURNING id`,
        [userId, expenseId, frequency, leadDays, enabled, dueOn ?? null, remindOn ?? null]
    );
    if (!rows[0]) return null;
    return findById(userId, rows[0].id);
};

// A standalone upcoming bill: a name, an amount and a real due date the user
// typed, with NO expense behind it.
//
// THE POINT OF THE NULL expense_id. This row never enters the `expenses` table,
// so the money is never counted as spent - not on the dashboard total, not in
// the category breakdown, not in the monthly trend, not in the admin's org-wide
// reports, not in the CSV export. A bill you have not paid yet is not spending,
// and the only honest way to say that is to keep it out of the table everything
// else sums.
//
// A plain INSERT rather than an upsert: two bills can legitimately share a name
// ("Insurance" this year and next), so there is nothing to conflict on. The
// shape constraint in ensureTable is what guarantees title, amount and due_on
// all arrived together.
const createBill = async ({
    userId, title, amount, dueOn, frequency, leadDays, enabled, remindOn,
}) => {
    await ensureTable();
    const { rows } = await db.query(
        `INSERT INTO expense_reminders
             (user_id, expense_id, title, amount, due_on, frequency, lead_days, enabled, remind_on)
         VALUES ($1, NULL, $2, $3, $4::date, $5, $6, $7, $8::date)
         RETURNING id`,
        [userId, title, amount, dueOn, frequency, leadDays, enabled, remindOn ?? null]
    );
    return findById(userId, rows[0].id);
};

// Change the settings on an existing reminder. `enabled` is separated out so the
// switch is one round trip rather than a read-modify-write that could clobber a
// frequency change made in another tab.
//
// WHY due_on AND remind_on CANNOT USE COALESCE like the others. For those three,
// null means "leave it alone" - which works because none of them is ever
// legitimately null. These two are different: null is a MEANING. Clearing due_on
// is how you go back to projecting from the expense's date, and clearing
// remind_on is how you go back to a 1/3/7-day lead. With COALESCE there would be
// no way to express either, and a user who set a custom date once could never
// undo it.
//
// So each takes a pair: a boolean saying "this field is being set at all", and
// the value. The controller sets the boolean only when the key was actually
// present in the request body, so an untouched field stays untouched and an
// explicit null clears.
const update = async (userId, id, {
    frequency, leadDays, enabled, setDueOn, dueOn, setRemindOn, remindOn,
}) => {
    await ensureTable();
    const { rows } = await db.query(
        // The casts are not decoration: with a bare `COALESCE($3, frequency)`
        // and a null bound to $3, Postgres cannot infer the parameter's type and
        // the statement fails with "could not determine data type of parameter".
        `UPDATE expense_reminders
            SET frequency  = COALESCE($3::varchar, frequency),
                lead_days  = COALESCE($4::smallint, lead_days),
                enabled    = COALESCE($5::boolean, enabled),
                due_on     = CASE WHEN $6::boolean THEN $7::date ELSE due_on    END,
                remind_on  = CASE WHEN $8::boolean THEN $9::date ELSE remind_on END,
                updated_at = NOW()
          WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [
            id, userId,
            frequency ?? null, leadDays ?? null, enabled ?? null,
            Boolean(setDueOn), dueOn ?? null,
            Boolean(setRemindOn), remindOn ?? null,
        ]
    );
    if (!rows[0]) return null;
    return findById(userId, rows[0].id);
};

// Record that an occurrence has been paid.
//
// Three writes in one statement, so a reminder can never end up half-settled -
// e.g. paid_on set but paid_for missing, which would show a payment date while
// the projection carried on as if nothing had happened.
//
// The expense itself is created by the controller BEFORE this runs, because
// creating it is what makes the payment real; this only records the link. If the
// insert succeeded and this update then failed, the user would see the expense
// on their dashboard and the reminder still unpaid - visible and correctable,
// which is the right way round for the two to fail.
const markPaid = async (userId, id, { paidOn, paidFor, expenseId }) => {
    await ensureTable();
    const { rows } = await db.query(
        `UPDATE expense_reminders
            SET paid_on         = $3::date,
                paid_for        = $4::date,
                paid_expense_id = $5,
                updated_at      = NOW()
          WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, userId, paidOn, paidFor, expenseId]
    );
    if (!rows[0]) return null;
    return findById(userId, rows[0].id);
};

// Undo. Clears the three payment columns but deliberately does NOT delete the
// expense that was created - that is money the user told us they spent, and
// removing a real expense row behind their back is not something an "undo" on a
// reminder should do. The controller says so in its reply.
const clearPaid = async (userId, id) => {
    await ensureTable();
    const { rows } = await db.query(
        `UPDATE expense_reminders
            SET paid_on = NULL, paid_for = NULL, paid_expense_id = NULL,
                updated_at = NOW()
          WHERE id = $1 AND user_id = $2
         RETURNING id`,
        [id, userId]
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
// LEFT JOIN ... IS NULL rather than NOT IN (SELECT ...). That was written as a
// precaution and is now load-bearing: standalone bills DO have a null
// expense_id, and `NOT IN (SELECT expense_id ...)` over a set containing a null
// evaluates to NULL for every row - so the picker would come back permanently
// empty the moment a user added their first upcoming bill, with no error to
// explain it.
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
    clearPaid,
    createBill,
    findById,
    markPaid,
    listForUser,
    remove,
    update,
    upsert,
};
