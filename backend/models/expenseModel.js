const db = require("../config/db");

// Every read joins the owner so the admin views never need a second round
// trip just to show a name.
const SELECT_WITH_OWNER = `
    SELECT e.*, u.name AS owner_name, u.email AS owner_email
      FROM expenses e
      JOIN users u ON u.id = e.user_id
`;

const createExpense = async ({
    userId, title, amount, category, expenseDate, description,
}) => {
    const result = await db.query(
        `INSERT INTO expenses
            (user_id, title, amount, category, expense_date, description)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING *`,
        [userId, title, amount, category, expenseDate, description]
    );
    return result.rows[0];
};

const findExpenseById = async (id) => {
    const result = await db.query(`${SELECT_WITH_OWNER} WHERE e.id = $1`, [id]);
    return result.rows[0];
};

// One list builder for both roles. `userId` is omitted for the admin views,
// which is the only difference between "my expenses" and "every expense".
const listExpenses = async ({ userId, category, from, to, limit = 200 } = {}) => {
    const params = [];
    const clauses = [];

    if (userId)   { params.push(userId);   clauses.push(`e.user_id = $${params.length}`); }
    if (category) { params.push(category); clauses.push(`e.category = $${params.length}`); }
    if (from)     { params.push(from);     clauses.push(`e.expense_date >= $${params.length}`); }
    if (to)       { params.push(to);       clauses.push(`e.expense_date <= $${params.length}`); }

    const where = clauses.length ? `WHERE ${clauses.join(" AND ")}` : "";
    params.push(Math.min(Number(limit) || 200, 500));

    const result = await db.query(
        `${SELECT_WITH_OWNER} ${where}
         ORDER BY e.expense_date DESC, e.id DESC
         LIMIT $${params.length}`,
        params
    );
    return result.rows;
};

const updateExpense = async (id, { title, amount, category, expenseDate, description }) => {
    const result = await db.query(
        `UPDATE expenses
            SET title = $2, amount = $3, category = $4,
                expense_date = $5, description = $6
          WHERE id = $1
          RETURNING *`,
        [id, title, amount, category, expenseDate, description]
    );
    return result.rows[0];
};

const deleteExpense = async (id) => {
    const result = await db.query("DELETE FROM expenses WHERE id = $1 RETURNING id", [id]);
    return result.rows[0];
};

// ---------------------------------------------------------------
// Aggregates. Each takes an optional userId: pass it for the user
// dashboard, leave it out for the org-wide admin dashboard.
// ---------------------------------------------------------------

// $1 is cast explicitly because a NULL bound parameter carries no type of its
// own, and Postgres will not deduce one from `user_id = $1` alone.
const SCOPE = "($1::int IS NULL OR user_id = $1::int)";

const summary = async ({ userId = null } = {}) => {
    const result = await db.query(
        `SELECT
            COUNT(*)::int                    AS total_count,
            COALESCE(SUM(amount), 0)::float  AS total_amount,
            COALESCE(AVG(amount), 0)::float  AS average_amount,
            COALESCE(MAX(amount), 0)::float  AS largest_amount
         FROM expenses WHERE ${SCOPE}`,
        [userId]
    );
    return result.rows[0];
};

const byCategory = async ({ userId = null } = {}) => {
    const result = await db.query(
        `SELECT category,
                COUNT(*)::int                   AS count,
                COALESCE(SUM(amount), 0)::float AS total
           FROM expenses
          WHERE ${SCOPE}
          GROUP BY category
          ORDER BY total DESC`,
        [userId]
    );
    return result.rows;
};

// Spend per calendar month, newest first - drives the dashboard trend chart.
const byMonth = async ({ userId = null, months = 6 } = {}) => {
    const result = await db.query(
        `SELECT TO_CHAR(DATE_TRUNC('month', expense_date), 'YYYY-MM') AS month,
                COUNT(*)::int                   AS count,
                COALESCE(SUM(amount), 0)::float AS total
           FROM expenses
          WHERE ${SCOPE}
          GROUP BY 1
          ORDER BY 1 DESC
          LIMIT $2`,
        [userId, Math.min(Number(months) || 6, 24)]
    );
    return result.rows;
};

// Admin only: who spends the most. LEFT JOIN so a user with no expenses yet
// still appears at zero instead of vanishing from the team list.
const spendByUser = async () => {
    const result = await db.query(
        `SELECT u.id, u.name, u.email, u.role, u.created_at,
                COUNT(e.id)::int                  AS count,
                COALESCE(SUM(e.amount), 0)::float AS total
           FROM users u
      LEFT JOIN expenses e ON e.user_id = u.id
          WHERE u.role = 'user'
          GROUP BY u.id, u.name, u.email, u.role, u.created_at
          ORDER BY total DESC, u.name ASC`
    );
    return result.rows;
};

// Every account - users AND admins - with their spend rolled up, plus the
// first and last expense date so an average per month can be worked out.
// LEFT JOIN keeps people who have recorded nothing.
//
// "Active" is defined in ONE place, in userModel.userCounts: a person is
// active when they have recorded at least one expense. That is the only
// definition the current schema can answer - there is no last-login column
// and no enabled/disabled flag. To change it later, change that query and
// this one together; nothing else depends on it.
const SPEND_ROLLUP = `
    SELECT u.id, u.name, u.email, u.role, u.created_at,
           COUNT(e.id)::int                  AS count,
           COALESCE(SUM(e.amount), 0)::float AS total,
           COALESCE(MAX(e.amount), 0)::float AS largest,
           MIN(e.expense_date)               AS first_expense,
           MAX(e.expense_date)               AS last_expense
      FROM users u
 LEFT JOIN expenses e ON e.user_id = u.id
`;

const peopleWithSpend = async () => {
    const result = await db.query(
        `${SPEND_ROLLUP}
          GROUP BY u.id, u.name, u.email, u.role, u.created_at
          ORDER BY total DESC, u.name ASC`
    );
    return result.rows;
};

const findPersonWithSpend = async (id) => {
    const result = await db.query(
        `${SPEND_ROLLUP}
          WHERE u.id = $1
          GROUP BY u.id, u.name, u.email, u.role, u.created_at`,
        [id]
    );
    return result.rows[0];
};

module.exports = {
    createExpense, findExpenseById, listExpenses,
    updateExpense, deleteExpense,
    summary, byCategory, byMonth, spendByUser,
    peopleWithSpend, findPersonWithSpend,
};
