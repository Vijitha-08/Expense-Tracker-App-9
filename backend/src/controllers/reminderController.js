const model = require("../models/reminderModel");
const { describe, FREQUENCIES, LEAD_DAYS } = require("../utils/recurrence");

// Expense reminders for the signed-in user.
//
// SCOPING. Every function here passes req.user.id into the model, and every
// query in the model filters on it. Nothing in a request body chooses whose
// reminders are touched - the same rule the rest of this app follows, stated in
// expenseRoutes.js as "the scoping is not a filter the client asks for and could
// forget". A reminder id belonging to somebody else comes back 404, not 403: the
// difference between "does not exist" and "exists but is not yours" is itself
// information about another account.
//
// DERIVED DATES ARE COMPUTED HERE, not in the page. utils/recurrence.js owns the
// projection rules, this controller applies them, and the frontend formats what
// it is handed. One implementation, so the due date can never disagree with the
// status printed next to it.

const validId = (id) => /^\d+$/.test(String(id));

// One list, one shape. The page reads `reminders` for the table, `available` for
// the picker and `counts` for the tiles.
const decorate = (row, now) => ({ ...row, ...describe(row, now) });

// Sorted by the projected due date, soonest first - which is the whole point of
// a page called "upcoming" and cannot be an ORDER BY, because the date does not
// exist in the database. Disabled reminders sink to the bottom: they are still
// listed (you have to be able to switch one back on) but they are not upcoming.
const byDueDate = (a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    return String(a.dueOn).localeCompare(String(b.dueOn));
};

const listReminders = async (req, res) => {
    try {
        const now = new Date();
        const [rows, available] = await Promise.all([
            model.listForUser(req.user.id),
            model.availableExpenses(req.user.id),
        ]);

        const reminders = rows.map((row) => decorate(row, now)).sort(byDueDate);

        return res.json({
            reminders,
            available,
            // Returned rather than counted in the page, so the tiles and the
            // table can never disagree about how many are due.
            counts: {
                total: reminders.length,
                active: reminders.filter((r) => r.enabled).length,
                due: reminders.filter((r) => r.status === "due").length,
            },
            // The picker's cap, sent so the page can say "showing your 100 most
            // recent" instead of quietly offering a truncated list.
            availableLimit: model.AVAILABLE_LIMIT,
            options: { frequencies: FREQUENCIES, leadDays: LEAD_DAYS },
        });
    } catch (err) {
        console.error("listReminders failed:", err);
        return res.status(500).json({ message: "Could not load your reminders" });
    }
};

// Shared by create and update. Returns the parsed values or the first error, and
// treats an absent field as "leave it alone" only when `partial` is set - a
// create with no frequency should be told so, not silently defaulted.
const parseBody = (body, { partial } = {}) => {
    const out = {};

    if (body.frequency !== undefined) {
        const frequency = String(body.frequency).trim().toLowerCase();
        if (!FREQUENCIES.includes(frequency)) {
            return { error: `Frequency must be one of: ${FREQUENCIES.join(", ")}` };
        }
        out.frequency = frequency;
    } else if (!partial) {
        return { error: "Choose how often this expense comes round" };
    }

    if (body.leadDays !== undefined || body.lead_days !== undefined) {
        const leadDays = Number(body.leadDays ?? body.lead_days);
        if (!LEAD_DAYS.includes(leadDays)) {
            return { error: `Remind me must be one of: ${LEAD_DAYS.join(", ")} days before` };
        }
        out.leadDays = leadDays;
    } else if (!partial) {
        return { error: "Choose when to be reminded" };
    }

    if (body.enabled !== undefined) {
        // Only a real boolean. A string "false" arriving from a form would be
        // truthy, which would turn "switch this off" into "switch this on".
        if (typeof body.enabled !== "boolean") {
            return { error: "Enabled must be true or false" };
        }
        out.enabled = body.enabled;
    } else if (!partial) {
        out.enabled = true;
    }

    return { data: out };
};

// Set (or re-set) the reminder on one expense.
//
// A PUT-like POST on purpose: the model's UNIQUE (expense_id) makes this an
// upsert, so saving twice on the same expense edits the reminder rather than
// failing on a duplicate. That is what the page wants - the same form both
// creates and corrects.
const saveReminder = async (req, res) => {
    try {
        const expenseId = req.body?.expenseId ?? req.body?.expense_id;
        if (!validId(expenseId)) {
            return res.status(400).json({ message: "Choose an expense to remind you about" });
        }

        const { data, error } = parseBody(req.body);
        if (error) return res.status(400).json({ message: error });

        const reminder = await model.upsert({
            userId: req.user.id,
            expenseId: Number(expenseId),
            ...data,
        });

        // Null means the SELECT inside the INSERT matched nothing: the expense
        // does not exist, or it is not on this account. Same answer for both.
        if (!reminder) {
            return res.status(404).json({ message: "That expense is not on your account" });
        }

        return res.status(201).json({
            message: `Reminder set for "${reminder.title}"`,
            reminder: decorate(reminder, new Date()),
        });
    } catch (err) {
        console.error("saveReminder failed:", err);
        return res.status(500).json({ message: "Could not save the reminder" });
    }
};

// Edit an existing reminder: frequency, lead time, or the on/off switch. Partial
// on purpose, so the switch can send `{ enabled: false }` on its own without
// having to resend settings it is not changing.
const updateReminder = async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(404).json({ message: "Reminder not found" });
        }

        const { data, error } = parseBody(req.body, { partial: true });
        if (error) return res.status(400).json({ message: error });
        if (!Object.keys(data).length) {
            return res.status(400).json({ message: "Nothing to change" });
        }

        const reminder = await model.update(req.user.id, Number(req.params.id), data);
        if (!reminder) return res.status(404).json({ message: "Reminder not found" });

        return res.json({
            message: data.enabled === false
                ? `Reminder for "${reminder.title}" switched off`
                : "Reminder updated",
            reminder: decorate(reminder, new Date()),
        });
    } catch (err) {
        console.error("updateReminder failed:", err);
        return res.status(500).json({ message: "Could not update the reminder" });
    }
};

// Remove a reminder. The expense itself is untouched - that is the difference
// between this and Delete on the dashboard, and the reply says so, because
// "Removed" on a page full of expenses is exactly the wrong thing to be unsure
// about.
const deleteReminder = async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(404).json({ message: "Reminder not found" });
        }

        const existing = await model.findById(req.user.id, Number(req.params.id));
        if (!existing) return res.status(404).json({ message: "Reminder not found" });

        await model.remove(req.user.id, Number(req.params.id));
        return res.json({
            message: `Reminder removed. The expense "${existing.title}" is still there.`,
            id: existing.id,
        });
    } catch (err) {
        console.error("deleteReminder failed:", err);
        return res.status(500).json({ message: "Could not remove the reminder" });
    }
};

module.exports = { listReminders, saveReminder, updateReminder, deleteReminder };
