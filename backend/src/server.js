const express = require("express");
const cors = require("cors");
const dotenv = require("dotenv");

dotenv.config();

// Refuse to boot with a missing or default secret rather than silently
// signing tokens anyone can forge.
const REQUIRED_ENV = ["DB_HOST", "DB_USER", "DB_NAME", "JWT_SECRET"];
const missing = REQUIRED_ENV.filter((key) => !process.env[key]);
if (missing.length) {
    console.error(`Missing required environment variables: ${missing.join(", ")}`);
    console.error("Copy .env.example to .env and fill it in.");
    process.exit(1);
}

// A weak or placeholder signing key lets anyone forge a token for any account,
// so refuse to boot rather than run insecurely. Length alone is not enough:
// the placeholder in .env.example is long but publicly known.
const SECRET = process.env.JWT_SECRET;
const HOWTO = "  node -e \"console.log(require('crypto').randomBytes(48).toString('hex'))\"";
const PLACEHOLDER_MARKERS = [
    "replace_me", "replaceme", "changeme", "change_me", "your_", "yoursecret",
    "mysecretkey", "secret123", "supersecret", "todo", "xxxx", "placeholder",
    "example", "sample",
];
const lowered = SECRET.toLowerCase();

if (SECRET.length < 32) {
    console.error(`JWT_SECRET is only ${SECRET.length} characters; at least 32 are required.`);
    console.error("Generate one with:\n" + HOWTO);
    process.exit(1);
}
if (PLACEHOLDER_MARKERS.some((m) => lowered.includes(m))) {
    console.error("JWT_SECRET still contains placeholder text - it was never replaced.");
    console.error("Generate a real one with:\n" + HOWTO);
    process.exit(1);
}
if (new Set(SECRET).size < 12) {
    console.error(`JWT_SECRET uses only ${new Set(SECRET).size} distinct characters, so it is not random.`);
    console.error("Generate one with:\n" + HOWTO);
    process.exit(1);
}

const db = require("./config/db");

const app = express();

app.use(cors({
    origin: (process.env.CORS_ORIGIN || "http://localhost:5173").split(","),
    credentials: true,
}));
app.use(express.json({ limit: "100kb" }));

app.get("/", (req, res) => res.json({ status: "ok", service: "expense-tracker-api" }));
app.get("/api/health", async (req, res) => {
    try {
        await db.query("SELECT 1");
        return res.json({
            status: "ok",
            storage: "postgresql",
            database: "connected",
            time: new Date().toISOString(),
        });
    } catch (err) {
        console.error("Database health check failed:", err.message);
        return res.status(503).json({ status: "error", database: "disconnected" });
    }
});

app.use("/api/auth", require("./routes/authRoutes"));
app.use("/api/expenses", require("./routes/expenseRoutes"));
app.use("/api/admin", require("./routes/adminRoutes"));
app.use("/api/users", require("./routes/userRoutes"));

app.use((req, res) => res.status(404).json({ message: `No route for ${req.method} ${req.originalUrl}` }));

// Catch-all so a thrown error returns JSON instead of an HTML stack trace.
app.use((err, req, res, next) => {
    console.error("Unhandled error:", err);
    if (err.type === "entity.parse.failed") {
        return res.status(400).json({ message: "Request body is not valid JSON" });
    }
    res.status(500).json({ message: "Something went wrong on the server" });
});

const PORT = process.env.PORT || 5000;
const start = async () => {
    try {
        // Do not accept an HTTP request until PostgreSQL is connected and the
        // exact public.users/public.expenses tables have been verified.
        await db.verifyConnection();
        return app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
    } catch (err) {
        console.error("PostgreSQL startup check failed:", err.message);
        await db.end().catch(() => {});
        process.exitCode = 1;
        return null;
    }
};

if (require.main === module) start();

module.exports = { app, start };
