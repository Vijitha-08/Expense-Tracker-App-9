#!/usr/bin/env node
/**
 * Runs the API and the frontend together.
 *
 *   npm start
 *
 * Output from both is prefixed so it is obvious which side a message came from.
 * Ctrl+C stops both. No extra dependencies - just child_process.
 */
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = __dirname;
const BACKEND = path.join(ROOT, "backend");
const FRONTEND = path.join(ROOT, "frontend");

const ESC = String.fromCharCode(27);
const C = {
  reset: ESC + "[0m",
  bold: ESC + "[1m",
  dim: ESC + "[2m",
  green: ESC + "[32m",
  red: ESC + "[31m",
  cyan: ESC + "[36m",
  magenta: ESC + "[35m",
};

// ---- preflight: catch the two things people forget ------------------------
const problems = [];
if (!fs.existsSync(path.join(BACKEND, "node_modules"))) problems.push("backend dependencies are not installed");
if (!fs.existsSync(path.join(FRONTEND, "node_modules"))) problems.push("frontend dependencies are not installed");
if (!fs.existsSync(path.join(BACKEND, ".env"))) problems.push("backend/.env is missing");

if (problems.length) {
  console.log("\n" + C.red + C.bold + "  Cannot start yet" + C.reset + "\n");
  problems.forEach((p) => console.log("  - " + p));
  console.log("\n  Run this first:  " + C.bold + "npm run setup" + C.reset + "\n");
  process.exit(1);
}

console.log("\n" + C.bold + "Starting Expense Tracker" + C.reset);
console.log(C.dim + "  API      http://localhost:5000" + C.reset);
console.log(C.dim + "  App      http://localhost:5173" + C.reset);
console.log(C.dim + "  Press Ctrl+C to stop both." + C.reset + "\n");

const children = [];
let shuttingDown = false;

const start = (label, colour, cwd) => {
  const child = spawn("npm run dev", { cwd, shell: true });
  const tag = colour + "[" + label + "]" + C.reset + " ";

  const pipe = (stream, isError) => {
    let buffer = "";
    stream.on("data", (chunk) => {
      buffer += chunk.toString();
      const lines = buffer.split("\n");
      buffer = lines.pop();
      lines.forEach((line) => {
        if (line.trim()) console.log(tag + line);
      });
    });
  };
  pipe(child.stdout, false);
  pipe(child.stderr, true);

  child.on("exit", (code) => {
    if (shuttingDown) return;
    console.log("\n" + C.red + "  " + label + " stopped unexpectedly (exit " + code + ")." + C.reset);
    if (label === "api") {
      console.log("  Common causes: PostgreSQL is not running, or backend/.env is wrong.");
      console.log("  Try:  " + C.bold + "npm run setup" + C.reset + "\n");
    }
    shutdown(code || 1);
  });

  children.push(child);
  return child;
};

const shutdown = (code) => {
  if (shuttingDown) return;
  shuttingDown = true;
  children.forEach((c) => {
    try { process.platform === "win32" ? spawn("taskkill", ["/pid", c.pid, "/f", "/t"]) : c.kill("SIGTERM"); }
    catch (e) { /* already gone */ }
  });
  setTimeout(() => process.exit(code), 400);
};

start("api", C.green, BACKEND);
start("web", C.magenta, FRONTEND);

process.on("SIGINT", () => {
  console.log("\n" + C.dim + "  stopping..." + C.reset);
  shutdown(0);
});
process.on("SIGTERM", () => shutdown(0));
