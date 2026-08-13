const { Pool } = require("pg");

const pool = new Pool({
    user: process.env.DB_USER,
    host: process.env.DB_HOST,
    database: process.env.DB_NAME,
    password: process.env.DB_PASSWORD,
    port: Number(process.env.DB_PORT) || 5432,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
    application_name: "expense-tracker-api",
    // All application SQL is intentionally kept in the public schema. Pinning
    // the search path prevents a same-named table in another schema from
    // receiving rows that then appear to be missing in pgAdmin.
    options: "-c search_path=public",
});

const verifyConnection = async () => {
    const { rows: [target] } = await pool.query(
        `SELECT current_database() AS database,
                current_schema() AS schema,
                current_user AS user,
                TO_REGCLASS('public.users') AS users_table,
                TO_REGCLASS('public.expenses') AS expenses_table`
    );

    if (!target.users_table || !target.expenses_table) {
        throw new Error(
            `Required tables are missing from database "${target.database}". Run npm run db:init.`
        );
    }

    console.log(
        `PostgreSQL connected -> host=${process.env.DB_HOST}:${Number(process.env.DB_PORT) || 5432}, ` +
        `database="${target.database}", schema="${target.schema}", user="${target.user}"`
    );
    return target;
};

// An idle client dying should not take the process down silently.
pool.on("error", (err) => {
    console.error("Unexpected PostgreSQL pool error:", err.message);
});

module.exports = pool;
module.exports.verifyConnection = verifyConnection;
