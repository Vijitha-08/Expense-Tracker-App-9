const bcrypt = require("bcrypt");
const expenseModel = require("../models/expenseModel");
const userModel = require("../models/userModel");

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

// ---------------------------------------------------------------
// CSV export. Built by hand rather than with a library: five columns
// do not justify a dependency, and quoting is the only real rule.
// ---------------------------------------------------------------
const csvCell = (value) => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

const exportExpenses = async (req, res) => {
    try {
        const expenses = await expenseModel.listExpenses({ limit: 500 });
        const header = ["Date", "Title", "Category", "Amount", "Added by", "Email", "Description"];
        const rows = expenses.map((e) => [
            String(e.expense_date).slice(0, 10),
            e.title, e.category, e.amount,
            e.owner_name, e.owner_email, e.description,
        ]);

        const csv = [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

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

module.exports = {
    getOverview, getAllExpenses, getTeam, createTeamMember,
    getPeople, getPerson, exportExpenses,
};
