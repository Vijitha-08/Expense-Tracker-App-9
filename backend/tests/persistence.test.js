const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const loadWithDatabase = (modelFile, query) => {
    const dbPath = require.resolve("../src/config/db");
    const modelPath = require.resolve(modelFile);
    const previousDb = require.cache[dbPath];

    require.cache[dbPath] = {
        id: dbPath,
        filename: dbPath,
        loaded: true,
        exports: { query },
    };
    delete require.cache[modelPath];
    const model = require(modelFile);

    if (previousDb) require.cache[dbPath] = previousDb;
    else delete require.cache[dbPath];
    delete require.cache[modelPath];
    return model;
};

test("database initialization never drops persisted tables", () => {
    const schema = fs.readFileSync(
        path.join(__dirname, "..", "scripts", "schema.sql"),
        "utf8"
    );

    assert.doesNotMatch(schema, /DROP\s+TABLE/i);
    assert.match(schema, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+users/i);
    assert.match(schema, /CREATE\s+TABLE\s+IF\s+NOT\s+EXISTS\s+expenses/i);
});

test("repeat setup reads the existing PostgreSQL target", () => {
    const setup = fs.readFileSync(path.join(__dirname, "..", "..", "setup.js"), "utf8");

    assert.match(setup, /saved\[key\]/);
    assert.match(setup, /configured\("DB_NAME",\s*"Expense_Tracker_App"\)/);
    assert.match(setup, /configured\("DB_PASSWORD",\s*null\)/);
});

test("user registration inserts the profile into PostgreSQL", async () => {
    const calls = [];
    const user = { id: 7, name: "Asha", email: "asha@example.com", role: "user" };
    const model = loadWithDatabase("../src/models/userModel", async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [user] };
    });

    const saved = await model.createUser("Asha", "asha@example.com", "bcrypt-hash", "user");

    assert.equal(saved, user);
    assert.match(calls[0].sql, /INSERT\s+INTO\s+users/i);
    assert.deepEqual(calls[0].params, ["Asha", "asha@example.com", "bcrypt-hash", "user"]);
});

test("creating an expense inserts it with the signed-in user's id", async () => {
    const calls = [];
    const expense = { id: 11, user_id: 7, title: "Lunch", amount: "250.00" };
    const model = loadWithDatabase("../src/models/expenseModel", async (sql, params) => {
        calls.push({ sql, params });
        return { rows: [expense] };
    });

    const saved = await model.createExpense({
        userId: 7,
        title: "Lunch",
        amount: 250,
        category: "Food",
        expenseDate: "2026-08-07",
        description: "Team lunch",
    });

    assert.equal(saved, expense);
    assert.match(calls[0].sql, /INSERT\s+INTO\s+expenses/i);
    assert.match(calls[0].sql, /RETURNING\s+\*/i);
    assert.deepEqual(calls[0].params, [
        7, "Lunch", 250, "Food", "2026-08-07", "Team lunch",
    ]);
});
