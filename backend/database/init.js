/**
 * Cross-platform database setup.
 *
 *   npm run db:init
 *
 * Creates the database if it does not exist, then applies database/schema.sql.
 * Uses the `pg` driver rather than shelling out to psql, so it works the same
 * on Windows (PowerShell or cmd), macOS and Linux, and does not require the
 * Postgres command line tools to be on PATH.
 *
 * Existing data is preserved. Pass --reset only through `npm run db:reset`
 * when deleting all accounts and expenses is intentional.
 */
const fs = require("fs");
const path = require("path");
const { Client } = require("pg");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const cfg = {
    host: process.env.DB_HOST || "localhost",
    port: Number(process.env.DB_PORT) || 5432,
    user: process.env.DB_USER || "postgres",
    password: process.env.DB_PASSWORD,
    application_name: "expense-tracker-db-init",
    options: "-c search_path=public",
};
const dbName = process.env.DB_NAME || "Expense_Tracker_App";
const reset = process.argv.includes("--reset");

const fail = (msg, err) => {
    console.error(`\n  ${msg}`);
    if (err) console.error(`  ${err.message}`);
    console.error("\n  Check DB_HOST, DB_PORT, DB_USER and DB_PASSWORD in backend/.env,");
    console.error("  and make sure PostgreSQL is running.\n");
    process.exit(1);
};

(async () => {
    if (!process.env.DB_PASSWORD) {
        fail("DB_PASSWORD is not set. Copy .env.example to .env and fill it in.");
    }

    // Connect to the maintenance database to create the target one.
    const admin = new Client({ ...cfg, database: "postgres" });
    try {
        await admin.connect();
    } catch (err) {
        fail("Could not connect to PostgreSQL.", err);
    }

    try {
        const { rowCount } = await admin.query(
            "SELECT 1 FROM pg_database WHERE datname = $1", [dbName]
        );
        if (rowCount === 0) {
            // Identifiers cannot be parameterised, so quote it safely instead.
            await admin.query(`CREATE DATABASE "${dbName.replace(/"/g, '""')}"`);
            console.log(`  created database "${dbName}"`);
        } else {
            console.log(`  database "${dbName}" already exists`);
        }
    } catch (err) {
        await admin.end();
        fail(`Could not create the database "${dbName}".`, err);
    }
    await admin.end();

    const schemaPath = path.join(__dirname, "schema.sql");
    if (!fs.existsSync(schemaPath)) fail(`Cannot find ${schemaPath}`);
    const sql = fs.readFileSync(schemaPath, "utf8");

    const db = new Client({ ...cfg, database: dbName });
    try {
        await db.connect();
        if (reset) {
            await db.query("DROP TABLE IF EXISTS expenses CASCADE; DROP TABLE IF EXISTS users CASCADE;");
            console.log("  reset requested -> removed existing users and expenses");
        }
        await db.query(sql);
        const { rows: [state] } = await db.query(
            `SELECT current_database() AS database,
                    (SELECT COUNT(*)::int FROM public.users) AS users,
                    (SELECT COUNT(*)::int FROM public.expenses) AS expenses`
        );
        console.log(
            `  schema ready in "${state.database}" -> users: ${state.users}, expenses: ${state.expenses}`
        );
        console.log("\n  Database ready. Start the API with:  npm run dev\n");
    } catch (err) {
        fail("Failed to apply database/schema.sql.", err);
    } finally {
        await db.end();
    }
})();
