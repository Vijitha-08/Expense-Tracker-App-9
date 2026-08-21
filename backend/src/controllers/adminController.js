const bcrypt = require("bcrypt");
const db = require("../config/db");
const expenseModel = require("../models/expenseModel");
const userModel = require("../models/userModel");
const { toCsv, isoDay } = require("../utils/csv");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

// NOTE ON EMAIL ADDRESSES
// An earlier round masked emails (ge•••@gmail.com) before they left the
// server. That was removed on request: an administrator managing accounts
// needs the real address. Password hashes are still never returned - see
// PUBLIC_COLUMNS in userModel - so an admin can read who somebody is but
// never their credentials.

// ---------------------------------------------------------------
// Overview: everything the admin dashboard needs in one request, so
// the page paints once instead of flickering through four loads.
// ---------------------------------------------------------------
const getOverview = async (req, res) => {
    try {
        const [totals, categories, months, people, headcount, counts] = await Promise.all([
            expenseModel.summary({}),          // no userId -> whole organisation
            expenseModel.byCategory({}),
            expenseModel.byMonth({ months: 6 }),
            expenseModel.spendByUser(),
            userModel.countUsersByRole(),
            userModel.userCounts(),
        ]);

        return res.json({
            summary: totals,
            categories,
            months,
            people,
            headcount,
            userCounts: counts,
        });
    } catch (err) {
        console.error("getOverview failed:", err);
        return res.status(500).json({ message: "Could not load the overview" });
    }
};

// Every expense in the organisation, filterable. This is the admin's
// equivalent of the user's "my expenses" list.
const getAllExpenses = async (req, res) => {
    try {
        const { category, userId, from, to, limit } = req.query;
        const expenses = await expenseModel.listExpenses({
            userId: userId ? Number(userId) : undefined,
            category, from, to, limit,
        });
        return res.json({ expenses });
    } catch (err) {
        console.error("getAllExpenses failed:", err);
        return res.status(500).json({ message: "Could not load expenses" });
    }
};

// The team list, with each person's spend rolled up alongside them.
const getTeam = async (req, res) => {
    try {
        const [people, admins] = await Promise.all([
            expenseModel.spendByUser(),
            userModel.listUsers({ role: "admin" }),
        ]);
        return res.json({ people, admins });
    } catch (err) {
        console.error("getTeam failed:", err);
        return res.status(500).json({ message: "Could not load the team" });
    }
};

// ---------------------------------------------------------------
// People: every account (users AND admins) with their spend, plus the
// four counts the user panel shows. Drives the Users page and the
// person list on Reports.
// ---------------------------------------------------------------
const getPeople = async (req, res) => {
    try {
        const [people, counts] = await Promise.all([
            expenseModel.peopleWithSpend(),
            userModel.userCounts(),
        ]);
        return res.json({ people, counts });
    } catch (err) {
        console.error("getPeople failed:", err);
        return res.status(500).json({ message: "Could not load the people" });
    }
};

const validId = (id) => /^\d+$/.test(String(id));

// Months between two dates, at least 1, so "approx per month" never divides
// by zero and a single expense reads as that expense rather than Infinity.
const monthsBetween = (from, to) => {
    if (!from || !to) return 1;
    const a = new Date(from);
    const b = new Date(to);
    const months =
        (b.getFullYear() - a.getFullYear()) * 12 + (b.getMonth() - a.getMonth()) + 1;
    return Math.max(months, 1);
};

// One person's detail for the Reports drill-down: their totals, their
// category split, their month-by-month spend, and their expenses.
const getPerson = async (req, res) => {
    try {
        const { id } = req.params;
        if (!validId(id)) return res.status(404).json({ message: "Person not found" });

        const person = await expenseModel.findPersonWithSpend(Number(id));
        if (!person) return res.status(404).json({ message: "Person not found" });

        const [categories, months, expenses] = await Promise.all([
            expenseModel.byCategory({ userId: person.id }),
            expenseModel.byMonth({ userId: person.id, months: 6 }),
            expenseModel.listExpenses({ userId: person.id, limit: 200 }),
        ]);

        const spanMonths = monthsBetween(person.first_expense, person.last_expense);

        return res.json({
            person: {
                ...person,
                // Approximate monthly spend: their total spread across the
                // months they have actually been recording in. Deliberately a
                // rough figure - the label on screen says "approx".
                approx_per_month: person.total / spanMonths,
                active_months: spanMonths,
            },
            categories,
            months,
            expenses,
        });
    } catch (err) {
        console.error("getPerson failed:", err);
        return res.status(500).json({ message: "Could not load that person" });
    }
};

const exportExpenses = async (req, res) => {
    try {
        const expenses = await expenseModel.listExpenses({ limit: 500 });
        const header = ["Date", "Title", "Category", "Amount", "Added by", "Email", "Description"];
        const rows = expenses.map((e) => [
            isoDay(e.expense_date),
            e.title, e.category, e.amount,
            e.owner_name, e.owner_email, e.description,
        ]);

        const csv = toCsv(header, rows);

        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", 'attachment; filename="expenses.csv"');
        return res.send(csv);
    } catch (err) {
        console.error("exportExpenses failed:", err);
        return res.status(500).json({ message: "Could not build the export" });
    }
};

// Admins add team members directly, which is why open admin self-registration
// can stay closed after the first account.
const createTeamMember = async (req, res) => {
    try {
        const name = (req.body.name || "").trim();
        const email = (req.body.email || "").trim().toLowerCase();
        const password = req.body.password || "";
        const role = (req.body.role || "user").trim().toLowerCase();

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email and password are required" });
        }
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ message: "Please enter a valid email address" });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }
        if (!["user", "admin"].includes(role)) {
            return res.status(400).json({ message: "Role must be user or admin" });
        }
        if (await userModel.findUserByEmail(email)) {
            return res.status(409).json({ message: "An account with this email already exists" });
        }

        const hashed = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const user = await userModel.createUser(name, email, hashed, role);

        return res.status(201).json({ message: `${user.name} was added`, user });
    } catch (err) {
        console.error("createTeamMember failed:", err);
        return res.status(500).json({ message: "Could not add the team member" });
    }
};

/* ============================================================
   Danger zone. Both endpoints destroy data that belongs to OTHER people, which
   makes them the most dangerous things in this codebase.
   ============================================================
   Four guards on each, and none of them is decoration:

   1. The router already applies auth + requireRole("admin"), so a signed-in
      user cannot reach these at all - they get 403 before the handler runs.
   2. The acting admin's own password is required in the body. A bearer token
      lives in localStorage and travels with every request, so it proves a
      session was opened at some point; only a password proves who is at the
      keyboard now. Same reasoning as changePassword.
   3. The frontend also demands a typed phrase, so neither can be fired by a
      stray click. That is UI, not security - hence 1 and 2.
   4. Deleting a user can never remove the last administrator, and can never be
      used on yourself. See deleteUserAccount.
   ============================================================ */

// Re-checks the password of the admin making the request. Reads the row fresh
// rather than trusting req.user, because req.user comes from PUBLIC_COLUMNS and
// deliberately has no password hash on it.
const confirmAdminPassword = async (req) => {
    const supplied = req.body?.password || "";
    if (!supplied) return { ok: false, status: 400, message: "Enter your password to confirm" };
    const full = await userModel.findUserByEmail(req.user.email);
    if (!full || !(await bcrypt.compare(supplied, full.password))) {
        return { ok: false, status: 401, message: "That password is not correct" };
    }
    return { ok: true };
};

// "Reset all expenses" - every expense in the organisation, from every account.
//
// The accounts themselves are untouched: this is DELETE FROM expenses, never
// DELETE FROM users. Somebody who resets expenses still has their login, their
// name, their role and their preferences - only the spending records go. That is
// the difference between this and the button below it, and the reply says so.
//
// The row count comes back so the page can report what actually happened.
// "Deleted 87 expenses across 5 accounts" is checkable; "Done" is not.
const resetAllExpenses = async (req, res) => {
    try {
        const check = await confirmAdminPassword(req);
        if (!check.ok) return res.status(check.status).json({ message: check.message });

        // Counted before the delete, because DELETE cannot report DISTINCT.
        const { rows: pre } = await db.query(
            "SELECT COUNT(*)::int AS rows, COUNT(DISTINCT user_id)::int AS people FROM expenses"
        );
        const { rowCount } = await db.query("DELETE FROM expenses");

        console.warn(`[admin] ${req.user.email} reset ALL expenses: ${rowCount} rows deleted`);
        return res.json({
            message: rowCount === 0
                ? "There were no expenses to delete"
                : `Deleted ${rowCount} ${rowCount === 1 ? "expense" : "expenses"} across ${pre[0].people} ${pre[0].people === 1 ? "account" : "accounts"}. Every login is untouched.`,
            deleted: rowCount,
            accounts: pre[0].people,
        });
    } catch (err) {
        console.error("resetAllExpenses failed:", err);
        return res.status(500).json({ message: "Could not reset the expenses" });
    }
};

// "Delete a user account" - one named person, and their expenses with them
// through the ON DELETE CASCADE already on expenses.user_id.
//
// THREE REFUSALS, in this order, and the order matters:
//
//   * not yourself. An admin removing their own account from a list of other
//     people's accounts is almost always a misclick, and there is already a
//     deliberate route for it at DELETE /api/users/me behind its own typed
//     confirmation. Refusing here costs nothing and removes a whole class of
//     accident.
//   * not the last administrator. Without this the app can be left with no
//     admin access and no way to create one: register refuses a second admin
//     while one exists, and with none existing the first person to sign up
//     would be handed the whole organisation's data.
//   * the id must exist. Checked by reading the row first, so the reply can
//     name who was deleted instead of saying "1 row affected".
const deleteUserAccount = async (req, res) => {
    try {
        const { id } = req.params;
        if (!validId(id)) return res.status(404).json({ message: "That account does not exist" });
        const targetId = Number(id);

        const check = await confirmAdminPassword(req);
        if (!check.ok) return res.status(check.status).json({ message: check.message });

        if (targetId === req.user.id) {
            return res.status(400).json({
                message: "This is your own account. To delete it, use Settings > My data on your own account - that route asks for a separate confirmation on purpose.",
            });
        }

        const target = await userModel.findUserById(targetId);
        if (!target) return res.status(404).json({ message: "That account does not exist" });

        if (target.role === "admin") {
            const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'");
            if (rows[0].n <= 1) {
                return res.status(409).json({
                    message: "That is the only administrator account. Promote somebody else first, or this app would be left with no admin access at all.",
                });
            }
        }

        // Counted before the delete so the reply can say how much went with the
        // account - an admin about to remove somebody deserves to know it is 84
        // expenses and not 2.
        const { rows: owned } = await db.query(
            "SELECT COUNT(*)::int AS n FROM expenses WHERE user_id = $1", [targetId]
        );
        const { rowCount } = await db.query("DELETE FROM users WHERE id = $1", [targetId]);
        if (!rowCount) return res.status(404).json({ message: "That account does not exist" });

        console.warn(`[admin] ${req.user.email} deleted account ${target.email} (${owned[0].n} expenses)`);
        return res.json({
            message: `Deleted ${target.name} and their ${owned[0].n} ${owned[0].n === 1 ? "expense" : "expenses"}`,
            deleted: { id: target.id, name: target.name, email: target.email, expenses: owned[0].n },
        });
    } catch (err) {
        console.error("deleteUserAccount failed:", err);
        return res.status(500).json({ message: "Could not delete that account" });
    }
};

module.exports = {
    getOverview, getAllExpenses, getTeam, createTeamMember,
    getPeople, getPerson, exportExpenses,
    resetAllExpenses, deleteUserAccount,
};
