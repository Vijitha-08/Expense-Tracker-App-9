const model = require("../models/expenseModel");

// Categories are free text, typed by the user rather than picked from a fixed
// list. Only length is enforced (the column is VARCHAR(50)); an empty value
// falls back to "Other" so the breakdowns always have a bucket to land in.
const parseBody = (body) => {
    const title = (body.title || "").trim();
    const amount = Number(body.amount);
    const category = (body.category || "").trim() || "Other";
    const expenseDate = body.expenseDate || body.expense_date || null;
    const description = (body.description || "").trim() || null;

    const errors = [];
    if (!title) errors.push("Title is required");
    if (title.length > 150) errors.push("Title must be under 150 characters");
    if (!Number.isFinite(amount) || amount <= 0) errors.push("Amount must be a number greater than 0");
    if (amount > 99999999.99) errors.push("Amount is too large");
    if (category.length > 50) errors.push("Category must be under 50 characters");
    if (expenseDate && Number.isNaN(Date.parse(expenseDate))) errors.push("Expense date is invalid");

    return { data: { title, amount, category, expenseDate, description }, errors };
};

const addExpense = async (req, res) => {
    try {
        const { data, errors } = parseBody(req.body);
        if (errors.length) return res.status(400).json({ message: errors[0], errors });

        const expense = await model.createExpense({
            userId: req.user.id,
            ...data,
            expenseDate: data.expenseDate || new Date().toISOString().slice(0, 10),
        });

        return res.status(201).json({ message: "Expense saved", expense });
    } catch (err) {
        console.error("addExpense failed:", err);
        return res.status(500).json({ message: "Could not save the expense" });
    }
};

// Always scoped to the signed-in user - nobody can read anyone else's rows.
const getExpenses = async (req, res) => {
    try {
        const { category, from, to, limit } = req.query;
        const expenses = await model.listExpenses({
            userId: req.user.id, category, from, to, limit,
        });
        return res.json({ expenses });
    } catch (err) {
        console.error("getExpenses failed:", err);
        return res.status(500).json({ message: "Could not load expenses" });
    }
};

// The :id routes must only ever see numbers. Without this, any stray string
// (like a stale bookmark to the removed /categories endpoint) reaches Postgres
// as a non-numeric id and turns into a 500 instead of a clean 404.
const validId = (id) => /^\d+$/.test(String(id));

const getExpense = async (req, res) => {
    try {
        if (!validId(req.params.id)) return res.status(404).json({ message: "Expense not found" });
        const expense = await model.findExpenseById(req.params.id);
        if (!expense) return res.status(404).json({ message: "Expense not found" });
        if (expense.user_id !== req.user.id) {
            return res.status(403).json({ message: "This expense belongs to someone else" });
        }
        return res.json({ expense });
    } catch (err) {
        console.error("getExpense failed:", err);
        return res.status(500).json({ message: "Could not load the expense" });
    }
};

const updateExpense = async (req, res) => {
    try {
        if (!validId(req.params.id)) return res.status(404).json({ message: "Expense not found" });
        const existing = await model.findExpenseById(req.params.id);
        if (!existing) return res.status(404).json({ message: "Expense not found" });
        if (existing.user_id !== req.user.id) {
            return res.status(403).json({ message: "You can only edit your own expenses" });
        }

        const { data, errors } = parseBody(req.body);
        if (errors.length) return res.status(400).json({ message: errors[0], errors });

        const expense = await model.updateExpense(req.params.id, {
            ...data,
            expenseDate: data.expenseDate || existing.expense_date,
        });
        return res.json({ message: "Expense updated", expense });
    } catch (err) {
        console.error("updateExpense failed:", err);
        return res.status(500).json({ message: "Could not update the expense" });
    }
};

const deleteExpense = async (req, res) => {
    try {
        if (!validId(req.params.id)) return res.status(404).json({ message: "Expense not found" });
        const existing = await model.findExpenseById(req.params.id);
        if (!existing) return res.status(404).json({ message: "Expense not found" });
        if (existing.user_id !== req.user.id) {
            return res.status(403).json({ message: "You can only delete your own expenses" });
        }
        await model.deleteExpense(req.params.id);
        return res.json({ message: "Expense deleted", id: Number(req.params.id) });
    } catch (err) {
        console.error("deleteExpense failed:", err);
        return res.status(500).json({ message: "Could not delete the expense" });
    }
};

const getSummary = async (req, res) => {
    try {
        const scope = { userId: req.user.id };
        const [totals, categories, months] = await Promise.all([
            model.summary(scope),
            model.byCategory(scope),
            model.byMonth(scope),
        ]);
        return res.json({ summary: totals, categories, months });
    } catch (err) {
        console.error("getSummary failed:", err);
        return res.status(500).json({ message: "Could not load the summary" });
    }
};

module.exports = {
    addExpense, getExpenses,
    getExpense, updateExpense, deleteExpense, getSummary,
};
