const db = require("../config/db");

const PUBLIC_COLUMNS = "id, name, email, role, created_at";

// Includes the password hash - only for the login path.
const findUserByEmail = async (email) => {
    const result = await db.query(
        "SELECT * FROM users WHERE LOWER(email) = LOWER($1)",
        [email]
    );
    return result.rows[0];
};

const findUserById = async (id) => {
    const result = await db.query(
        `SELECT ${PUBLIC_COLUMNS} FROM users WHERE id = $1`,
        [id]
    );
    return result.rows[0];
};

// role is passed explicitly - this was the bug that broke every registration.
const createUser = async (name, email, hashedPassword, role) => {
    const result = await db.query(
        `INSERT INTO users (name, email, password, role)
         VALUES ($1, $2, $3, $4)
         RETURNING ${PUBLIC_COLUMNS}`,
        [name, email, hashedPassword, role]
    );
    return result.rows[0];
};

const listUsers = async ({ role } = {}) => {
    const params = [];
    let where = "";
    if (role) {
        params.push(role);
        where = `WHERE role = $${params.length}`;
    }
    const result = await db.query(
        `SELECT ${PUBLIC_COLUMNS} FROM users ${where} ORDER BY created_at DESC`,
        params
    );
    return result.rows;
};

// Gates open admin self-registration: the first admin can sign up freely so
// the app is usable out of the box, but once one exists, only an existing
// admin can create another. Without this, anyone could register as an admin
// and read every user's expenses.
const countAdmins = async () => {
    const result = await db.query(
        "SELECT COUNT(*)::int AS count FROM users WHERE role = 'admin'"
    );
    return result.rows[0].count;
};

const countUsersByRole = async () => {
    const result = await db.query(
        `SELECT role, COUNT(*)::int AS count FROM users GROUP BY role`
    );
    return result.rows.reduce((acc, row) => {
        acc[row.role] = row.count;
        return acc;
    }, { user: 0, admin: 0 });
};

// The four figures the admin user panel shows, in one round trip.
//
// ACTIVE is defined here and nowhere else: a person is active when they have
// recorded at least one expense. The schema has no last_login_at column and no
// enabled/disabled flag, so that is the only definition it can answer today.
// To switch to "logged in within 30 days" or an admin-controlled toggle, add
// the column and change the `active` sub-select below - the API shape and
// every screen stay exactly the same.
//
// NEW is the last 30 days, by created_at.
const userCounts = async () => {
    const result = await db.query(
        `SELECT
            (SELECT COUNT(*)::int FROM users)                        AS total,
            (SELECT COUNT(DISTINCT user_id)::int FROM expenses)      AS active,
            (SELECT COUNT(*)::int FROM users
              WHERE created_at >= NOW() - INTERVAL '30 days')        AS new_users,
            (SELECT COUNT(*)::int FROM users WHERE role = 'admin')   AS admins`
    );
    return result.rows[0];
};

// Settings -> My account. The caller checks email uniqueness first; this only
// writes.
const updateProfile = async (id, { name, email }) => {
    const result = await db.query(
        `UPDATE users SET name = $2, email = $3, updated_at = NOW()
          WHERE id = $1
          RETURNING ${PUBLIC_COLUMNS}`,
        [id, name, email]
    );
    return result.rows[0];
};

module.exports = {
    findUserByEmail, findUserById, createUser,
    listUsers, countAdmins, countUsersByRole,
    userCounts, updateProfile,
};
