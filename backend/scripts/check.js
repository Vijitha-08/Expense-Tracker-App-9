/**
 * Shows which PostgreSQL database this project is using and the persisted row
 * counts. No data is changed.
 *
 *   npm run db:check
 */
const path = require("path");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const required = ["DB_HOST", "DB_USER", "DB_NAME"];
const missing = required.filter((key) => !process.env[key]);
if (missing.length) {
    console.error(`Missing configuration: ${missing.join(", ")}. Run npm run setup first.`);
    process.exit(1);
}

const client = new Client({
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    application_name: "expense-tracker-db-check",
    options: "-c search_path=public",
});

(async () => {
    try {
        await client.connect();
        const { rows: [target] } = await client.query(
            `SELECT current_database() AS database,
                    current_schema() AS schema,
                    current_user AS user,
                    TO_REGCLASS('public.users') AS users_table,
                    TO_REGCLASS('public.expenses') AS expenses_table`
        );

        console.log(`PostgreSQL target: ${process.env.DB_HOST}:${Number(process.env.DB_PORT) || 5432}`);
        console.log(`Database:          ${target.database}`);
        console.log(`Schema:            ${target.schema}`);
        console.log(`User:              ${target.user}`);

        if (!target.users_table || !target.expenses_table) {
            console.error("Status:            tables missing (run npm run db:init)");
            process.exitCode = 1;
            return;
        }

        const { rows: [counts] } = await client.query(
            `SELECT (SELECT COUNT(*)::int FROM public.users) AS users,
                    (SELECT COUNT(*)::int FROM public.expenses) AS expenses`
        );
        console.log("Status:            connected");
        console.log(`Stored users:      ${counts.users}`);
        console.log(`Stored expenses:   ${counts.expenses}`);
    } catch (err) {
        console.error(`Database check failed: ${err.message}`);
        process.exitCode = 1;
    } finally {
        await client.end().catch(() => {});
    }
})();
