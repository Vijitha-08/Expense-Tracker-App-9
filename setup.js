#!/usr/bin/env node
/**
 * One-command setup.
 *
 *   npm run setup
 *
 * Installs dependencies, writes both .env files, generates a real JWT secret,
 * creates the database and applies the schema. Safe to run more than once.
 *
 * Deliberately has no dependencies of its own, so it can run before any
 * npm install has happened.
 */
const { execSync } = require("child_process");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const readline = require("readline");

const ROOT = __dirname;
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");
const BACKEND_ENV = path.join(BACKEND, ".env");

const ESC = String.fromCharCode(27);
const C = {
  reset: ESC + "[0m",
  bold: ESC + "[1m",
  dim: ESC + "[2m",
  green: ESC + "[32m",
  red: ESC + "[31m",
  yellow: ESC + "[33m",
  cyan: ESC + "[36m",
};

const ok = (m) => console.log("  " + C.green + "OK" + C.reset + "    " + m);
const info = (m) => console.log("  " + C.cyan + ".." + C.reset + "    " + m);
const warn = (m) => console.log("  " + C.yellow + "NOTE" + C.reset + "  " + m);
const step = (n, m) => console.log("\n" + C.bold + n + ". " + m + C.reset);

const die = (title, lines) => {
  console.log("\n" + C.red + C.bold + "  Setup stopped: " + title + C.reset + "\n");
  lines.forEach((l) => console.log("  " + l));
  console.log("");
  process.exit(1);
};

const ask = (question, silent) =>
  new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    if (silent) {
      // Mask typed characters for the password prompt.
      const onData = () => {
        readline.moveCursor(process.stdout, -200, 0);
        readline.clearLine(process.stdout, 1);
        process.stdout.write(question + "*".repeat(rl.line.length));
      };
      process.stdin.on("data", onData);
      rl.on("close", () => process.stdin.removeListener("data", onData));
    }
    rl.question(question, (answer) => {
      rl.close();
      if (silent) process.stdout.write("\n");
      resolve(answer.trim());
    });
  });

const run = (cmd, cwd) => execSync(cmd, { cwd, stdio: "inherit", shell: true });

// `dotenv` is not available until dependencies are installed, so read the few
// connection settings we need with a small local parser. Existing values win
// over defaults on repeat setup runs; explicit shell environment variables win
// over both. This prevents setup from silently switching the API to a new
// database and making previously stored rows appear to be gone.
const readEnv = (file) => {
  if (!fs.existsSync(file)) return {};
  return fs.readFileSync(file, "utf8").split(/\r?\n/).reduce((values, line) => {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match) values[match[1]] = match[2];
    return values;
  }, {});
};

const envBody = (host, port, user, password, dbName, secretLine) =>
  [
    "PORT=5000",
    "",
    "DB_HOST=" + host,
    "DB_PORT=" + port,
    "DB_USER=" + user,
    "DB_PASSWORD=" + password,
    "DB_NAME=" + dbName,
    "",
    secretLine,
    "JWT_EXPIRES_IN=1d",
    "",
    "CORS_ORIGIN=http://localhost:5173",
    "",
  ].join("\n");

(async () => {
  console.log("\n" + C.bold + "Expense Tracker setup" + C.reset);
  console.log(C.dim + "Installs everything and sets up the database. Takes about a minute." + C.reset);

  // ---- 1. Node version ---------------------------------------------------
  step(1, "Checking Node.js");
  const major = Number(process.versions.node.split(".")[0]);
  if (major < 18) {
    die("Node.js " + process.versions.node + " is too old", [
      "This project needs Node.js 18 or newer.",
      "",
      "Download the LTS version from " + C.cyan + "https://nodejs.org" + C.reset,
      "then close this terminal, open a new one, and run  npm run setup  again.",
    ]);
  }
  ok("Node.js " + process.versions.node);

  // ---- 2. Dependencies ---------------------------------------------------
  step(2, "Installing dependencies (this is the slow part)");
  const targets = [["backend", BACKEND], ["frontend", FRONTEND]];
  for (const pair of targets) {
    info("installing " + pair[0] + "...");
    try {
      run("npm install --no-audit --no-fund", pair[1]);
    } catch (err) {
      die("npm install failed in " + pair[0], [
        "Usually this means no internet connection, or a proxy blocking npm.",
        "Check your connection and run  npm run setup  again.",
      ]);
    }
  }
  ok("dependencies installed");

  // ---- 3. PostgreSQL -----------------------------------------------------
  step(3, "Connecting to PostgreSQL");
  const { Client } = require(path.join(BACKEND, "node_modules", "pg"));

  const saved = readEnv(BACKEND_ENV);
  const configured = (key, fallback) => process.env[key] || saved[key] || fallback;
  const host = configured("DB_HOST", "localhost");
  const port = Number(configured("DB_PORT", "5432")) || 5432;
  const user = configured("DB_USER", "postgres");
  const dbName = configured("DB_NAME", "Expense_Tracker_App");

  const tryConnect = async (password) => {
    const client = new Client({
      host, port, user, password,
      database: "postgres",
      connectionTimeoutMillis: 6000,
    });
    try {
      await client.connect();
      await client.end();
      return { ok: true };
    } catch (err) {
      try { await client.end(); } catch (e) { /* already closed */ }
      return { ok: false, err };
    }
  };

  let password = configured("DB_PASSWORD", null);
  let attempt = password ? await tryConnect(password) : { ok: false, err: null };

  if (!attempt.ok) {
    // Tell "Postgres is not running" apart from "wrong password".
    const probe = await tryConnect("__probe__");
    const notRunning =
      probe.err && /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|timeout/i.test(probe.err.message);

    if (notRunning) {
      die("cannot reach PostgreSQL", [
        "Tried " + host + ":" + port + " and nothing answered.",
        "",
        C.bold + "If PostgreSQL is not installed yet:" + C.reset,
        "  Get it from " + C.cyan + "https://www.postgresql.org/download/" + C.reset,
        "  The installer asks you to choose a password. Write it down - you need it here.",
        "",
        C.bold + "If it is installed but not running:" + C.reset,
        "  Windows: open Services, find postgresql, right-click and Start",
        "  macOS:   brew services start postgresql",
        "  Linux:   sudo systemctl start postgresql",
        "",
        "Then run  npm run setup  again.",
      ]);
    }

    console.log("  " + C.dim + "This is the password you chose when installing PostgreSQL." + C.reset);
    for (let i = 1; i <= 3; i++) {
      password = await ask('  PostgreSQL password for user "' + user + '": ', true);
      attempt = await tryConnect(password);
      if (attempt.ok) break;
      if (i < 3) warn("that did not work. Try again.");
    }
    if (!attempt.ok) {
      die("could not connect with that password", [
        "If you have forgotten it, the simplest fix is to reinstall PostgreSQL",
        "and choose a password you will remember.",
        "",
        "You can also write it into backend/.env yourself as DB_PASSWORD=yourpassword",
        "and run  npm run setup  again.",
      ]);
    }
  }
  ok("connected to PostgreSQL at " + host + ":" + port);

  // ---- 4. Config files ---------------------------------------------------
  step(4, "Writing configuration");
  let secretLine = "JWT_SECRET=" + crypto.randomBytes(48).toString("hex");

  if (fs.existsSync(BACKEND_ENV)) {
    const existing = fs.readFileSync(BACKEND_ENV, "utf8");
    const match = existing.match(/^JWT_SECRET=(.*)$/m);
    const value = match ? match[1] : "";
    const placeholder = /replace_me|changeme|your_|example|sample/i.test(value);
    if (value.length >= 32 && !placeholder) {
      secretLine = match[0];
      warn("keeping the JWT_SECRET already in backend/.env");
    }
  }
  fs.writeFileSync(BACKEND_ENV, envBody(host, port, user, password, dbName, secretLine));
  ok("backend/.env written (gitignored - it holds your password)");

  const frontendEnv = path.join(FRONTEND, ".env.local");
  if (!fs.existsSync(frontendEnv)) {
    fs.writeFileSync(frontendEnv, "VITE_API_URL=http://localhost:5000/api\n");
  }
  ok("frontend/.env.local written");

  // ---- 5. Database -------------------------------------------------------
  step(5, "Setting up the database");
  try {
    run("npm run db:init", BACKEND);
  } catch (err) {
    die("database setup failed", [
      "The connection worked, so this is most likely a permissions problem:",
      'the user "' + user + '" may not be allowed to create databases.',
      "",
      "Create it by hand in pgAdmin or psql:",
      '  CREATE DATABASE "' + dbName + '";',
      "then run  npm run setup  again.",
    ]);
  }

  // ---- done --------------------------------------------------------------
  console.log("\n" + C.green + C.bold + "  Setup complete." + C.reset + "\n");
  console.log("  Start the app:  " + C.bold + "npm start" + C.reset);
  console.log("  Then open:      " + C.cyan + "http://localhost:5173" + C.reset + "\n");
  console.log("  " + C.dim + 'Click "Get Started" and create an account.' + C.reset + "\n");
})();
