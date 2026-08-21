const model = require("../models/reminderModel");
const expenseModel = require("../models/expenseModel");
const { describe, FREQUENCIES, LEAD_DAYS, RECURRING, isoUtc, todayUtc } = require("../utils/recurrence");

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

// Sorted by the due date, soonest first - the whole point of a page called
// "upcoming", and it cannot be an ORDER BY because for a projected reminder the
// date does not exist in the database.
//
// Two things jump the queue, in this order:
//   * disabled reminders sink to the bottom. They are still listed - you have to
//     be able to switch one back on - but they are not upcoming.
//   * overdue rises to the top. A one-off bill whose date has gone past is the
//     most urgent thing on the page, and sorting it by date would bury it above
//     the fold with everything else that is merely soon.
const byDueDate = (a, b) => {
    if (a.enabled !== b.enabled) return a.enabled ? -1 : 1;
    const aLate = a.status === "overdue" ? 0 : 1;
    const bLate = b.status === "overdue" ? 0 : 1;
    if (aLate !== bLate) return aLate - bLate;
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
                overdue: reminders.filter((r) => r.status === "overdue").length,
                bills: reminders.filter((r) => r.source === "bill").length,
                paid: reminders.filter((r) => r.status === "paid").length,
            },
            // The picker's cap, sent so the page can say "showing your 100 most
            // recent" instead of quietly offering a truncated list.
            availableLimit: model.AVAILABLE_LIMIT,
            // RECURRING is sent separately from FREQUENCIES so the page can grey
            // out "just once" where it is not valid rather than offering it and
            // then rejecting the save.
            options: { frequencies: FREQUENCIES, recurring: RECURRING, leadDays: LEAD_DAYS },
        });
    } catch (err) {
        console.error("listReminders failed:", err);
        return res.status(500).json({ message: "Could not load your reminders" });
    }
};

// ------------------------------------------------------------------
// Dates arriving from the browser
// ------------------------------------------------------------------
// An <input type="date"> sends "YYYY-MM-DD" and nothing else, so that is all
// that is accepted. Date.parse would happily swallow "next tuesday" or a full
// timestamp and store something the calendar could never show again.
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

const parseDay = (value, label) => {
    const iso = String(value ?? "").slice(0, 10);
    if (!ISO_DAY.test(iso)) return { error: `${label} must be a date` };
    // Round-tripped through the date builder, so "2026-02-31" is rejected rather
    // than silently becoming 3 March.
    const [y, m, d] = iso.split("-").map(Number);
    const built = new Date(Date.UTC(y, m - 1, d));
    if (isoUtc(built) !== iso) return { error: `${label} is not a real date` };
    return { day: iso, date: built };
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

    // dueOn and remindOn are the two the user can CLEAR, so "the key was
    // present" and "the value is null" are different things and both have to
    // survive into the model. `setDueOn` says the field is being written at all;
    // `dueOn` is what to write, null included. See update() in reminderModel.
    for (const [key, flag, label] of [
        ["dueOn", "setDueOn", "Due date"],
        ["remindOn", "setRemindOn", "Reminder date"],
    ]) {
        if (body[key] === undefined) continue;
        out[flag] = true;
        if (body[key] === null || body[key] === "") { out[key] = null; continue; }
        const parsed = parseDay(body[key], label);
        if (parsed.error) return { error: parsed.error };
        out[key] = parsed.day;
    }

    // "Just once" has nothing to project from, so it is only meaningful with a
    // due date. Caught here rather than left to produce a reminder that silently
    // never resolves.
    if (out.frequency === "once" && out.setDueOn && out.dueOn === null) {
        return { error: "A one-off reminder needs a due date" };
    }

    return { data: out };
};

// The name and amount a typed reminder carries. Bounds mirror the columns:
// title VARCHAR(150) and amount NUMERIC(12,2), the same limits
// expenseController.js enforces, so nothing is silently cut on the way in.
const parseTyped = (body) => {
    const title = String(body.title ?? "").trim();
    const amount = Number(body.amount);

    if (!title) return { error: "Give it a name" };
    if (title.length > 150) return { error: "The name must be under 150 characters" };
    if (!Number.isFinite(amount) || amount <= 0) {
        return { error: "Amount must be a number greater than 0" };
    }
    if (amount > 99999999.99) return { error: "Amount is too large" };

    return { data: { title, amount } };
};

// Set a reminder. THREE WAYS IN, chosen by `kind`, and the difference between
// them is the difference between money spent and money owed:
//
//   "existing"  attach a reminder to an expense the user already recorded. The
//               original behaviour, and still the common case.
//
//   "expense"   they picked Others and typed something they HAVE paid but never
//               recorded. This creates a real expense through the same
//               expenseModel the dashboard uses - so it lands in their totals,
//               their category breakdown and their export, exactly as if they
//               had entered it there - and then attaches a reminder to it. The
//               date is refused if it is in the future, matching the
//               max={today()} on ExpenseForm's own date input: this route must
//               not become a way around a rule the UI enforces.
//
//   "bill"      they picked Others and typed something still COMING UP. This
//               creates no expense at all. The row lives only in
//               expense_reminders with a null expense_id, so the money is never
//               counted as spent anywhere in the app. A bill you have not paid
//               is not spending, and putting it in `expenses` would inflate
//               every total on the dashboard and in the admin's reports.
//
// A PUT-like POST for "existing" on purpose: the model's UNIQUE (expense_id)
// makes it an upsert, so saving twice on the same expense edits the reminder
// rather than failing on a duplicate. The same form both creates and corrects.
const KINDS = ["existing", "expense", "bill"];

const saveReminder = async (req, res) => {
    try {
        const kind = String(req.body?.kind ?? "existing").trim().toLowerCase();
        if (!KINDS.includes(kind)) {
            return res.status(400).json({ message: `kind must be one of: ${KINDS.join(", ")}` });
        }

        const { data, error } = parseBody(req.body);
        if (error) return res.status(400).json({ message: error });

        const today = todayUtc();

        // ---------- a bill that is still coming up ----------
        if (kind === "bill") {
            const typed = parseTyped(req.body);
            if (typed.error) return res.status(400).json({ message: typed.error });

            if (!data.dueOn) {
                return res.status(400).json({ message: "An upcoming bill needs a due date" });
            }
            // Refused rather than accepted-and-instantly-overdue. Somebody
            // entering a bill for last month has almost certainly mistyped the
            // year, and the honest place to record a past payment is an expense.
            if (parseDay(data.dueOn, "Due date").date < today) {
                return res.status(400).json({
                    message: "That due date has already passed. If you have already paid it, add it as an expense instead.",
                });
            }

            const reminder = await model.createBill({
                userId: req.user.id,
                ...typed.data,
                dueOn: data.dueOn,
                frequency: data.frequency,
                leadDays: data.leadDays,
                enabled: data.enabled,
                remindOn: data.remindOn ?? null,
            });

            return res.status(201).json({
                message: `Reminder set for "${reminder.title}". No expense was created - this is a bill you have not paid yet, so it is not counted in your spending.`,
                reminder: decorate(reminder, new Date()),
            });
        }

        // ---------- Others: an expense they already paid ----------
        let expenseId = req.body?.expenseId ?? req.body?.expense_id;

        if (kind === "expense") {
            const typed = parseTyped(req.body);
            if (typed.error) return res.status(400).json({ message: typed.error });

            const paid = parseDay(req.body.paidOn ?? req.body.expenseDate, "Date paid");
            if (paid.error) return res.status(400).json({ message: paid.error });
            if (paid.date > today) {
                return res.status(400).json({
                    message: "That date is in the future. An expense records money already spent - if this has not been paid yet, add it as an upcoming bill instead.",
                });
            }

            // "once" makes no sense here unless they also stated a due date:
            // there is nothing to project, and the anchor is a past payment.
            if (data.frequency === "once" && !data.dueOn) {
                return res.status(400).json({
                    message: "A past expense with no due date needs a repeating frequency, not \"just once\".",
                });
            }

            const created = await expenseModel.createExpense({
                userId: req.user.id,
                title: typed.data.title,
                amount: typed.data.amount,
                category: String(req.body.category ?? "").trim() || "Other",
                expenseDate: paid.day,
                description: null,
            });
            expenseId = created.id;
        }

        if (!validId(expenseId)) {
            return res.status(400).json({ message: "Choose an expense to remind you about" });
        }

        if (data.frequency === "once" && !data.dueOn) {
            return res.status(400).json({ message: "A one-off reminder needs a due date" });
        }

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
            message: kind === "expense"
                ? `"${reminder.title}" was added to your expenses and a reminder set on it`
                : `Reminder set for "${reminder.title}"`,
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

        const existing = await model.findById(req.user.id, Number(req.params.id));
        if (!existing) return res.status(404).json({ message: "Reminder not found" });

        // A standalone bill has no expense to project from, so its due date is
        // the only thing it has. Clearing it would leave a row the shape
        // constraint refuses - caught here so the answer is a sentence rather
        // than a database error surfacing as a 500.
        if (existing.source === "bill" && data.setDueOn && data.dueOn === null) {
            return res.status(400).json({
                message: "An upcoming bill has to keep a due date - there is no expense behind it to work one out from.",
            });
        }
        // Same reasoning for the frequency: a bill can be "just once", but an
        // expense-backed reminder set to "just once" with no due date has
        // nothing to resolve to.
        if (data.frequency === "once"
            && !(data.setDueOn ? data.dueOn : existing.due_on)) {
            return res.status(400).json({ message: "A one-off reminder needs a due date" });
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

/* ============================================================
   MARK PAID
   ============================================================
   Creates a real expense dated today from the reminder's own name and amount,
   then records three things: when it was paid, WHICH occurrence that settled,
   and the id of the expense created.

   WHY IT CREATES AN EXPENSE. A payment is money spent, and the only honest place
   for money spent in this app is the `expenses` table - the same table the
   dashboard, the category breakdown, the monthly trend, the admin's reports and
   the CSV export all read. Recording a payment anywhere else would produce a
   reminder that says "paid" beside a dashboard that never saw the money.

   WHY paid_for MATTERS MORE THAN paid_on. The occurrence being settled is
   computed here, before the write, from the reminder as it stands right now.
   Storing the payment date alone is not enough: pay a bill due the 23rd on the
   21st and "paid on the 21st" cannot tell you whether the 23rd is done. See the
   `after` option in utils/recurrence.js.

   WORKS FOR BOTH KINDS, which is the whole reason the button reads the same on
   every row:
     * a typed bill has its own title and amount, and gains its first expense;
     * an expense-backed reminder copies the name and amount of the expense it
       hangs off, so paying rent adds this month's rent without a trip to the
       dashboard, and the projection moves on by itself.
   ============================================================ */
const markPaid = async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(404).json({ message: "Reminder not found" });
        }

        const existing = await model.findById(req.user.id, Number(req.params.id));
        if (!existing) return res.status(404).json({ message: "Reminder not found" });

        const now = new Date();
        const facts = describe(existing, now);

        // Refused rather than allowed to create a second expense for the same
        // occurrence. Without this, two clicks on a slow connection means paying
        // the rent twice in the totals.
        if (existing.paid_for && facts.status === "paid") {
            return res.status(409).json({
                message: `"${existing.title}" is already marked paid.`,
            });
        }
        if (existing.paid_for
            && String(existing.paid_for).slice(0, 10) === facts.dueOn) {
            return res.status(409).json({
                message: `The ${facts.dueOn} instalment of "${existing.title}" is already marked paid.`,
            });
        }

        // The occurrence being settled. For a one-off or a stated date this is
        // the date itself; for a projection it is the date on screen right now,
        // which is what the user believes they are paying.
        const settling = facts.dueOn;
        if (!settling) {
            return res.status(400).json({
                message: "This reminder has no due date to settle.",
            });
        }

        const amount = Number(existing.amount);
        if (!Number.isFinite(amount) || amount <= 0) {
            return res.status(400).json({
                message: "This reminder has no amount, so there is nothing to record as paid.",
            });
        }

        // Dated TODAY, not on the due date: this records when the money actually
        // left, and an expense dated in the future would be refused by the rest
        // of the app anyway.
        const paidOn = isoUtc(todayUtc(now));

        const created = await expenseModel.createExpense({
            userId: req.user.id,
            title: existing.title,
            amount,
            category: existing.category || "Other",
            expenseDate: paidOn,
            description: `Paid from reminders (due ${settling})`,
        });

        const reminder = await model.markPaid(req.user.id, Number(req.params.id), {
            paidOn,
            paidFor: settling,
            expenseId: created.id,
        });
        if (!reminder) return res.status(404).json({ message: "Reminder not found" });

        const after = decorate(reminder, new Date());
        return res.json({
            // Two different truths again. A one-off is finished; a recurring one
            // has simply moved on, and saying when it next comes round is the
            // useful half of the message.
            message: after.status === "paid"
                ? `"${reminder.title}" marked paid and added to your expenses.`
                : `"${reminder.title}" marked paid and added to your expenses. Next one due ${after.dueOn}.`,
            reminder: after,
            expense: created,
        });
    } catch (err) {
        console.error("markPaid failed:", err);
        return res.status(500).json({ message: "Could not mark that as paid" });
    }
};

// Undo a mark-paid. The expense STAYS - see clearPaid in the model for why - and
// the reply says so, because an undo that silently deleted a real expense would
// be the more dangerous of the two behaviours.
const unmarkPaid = async (req, res) => {
    try {
        if (!validId(req.params.id)) {
            return res.status(404).json({ message: "Reminder not found" });
        }
        const existing = await model.findById(req.user.id, Number(req.params.id));
        if (!existing) return res.status(404).json({ message: "Reminder not found" });
        if (!existing.paid_for) {
            return res.status(400).json({ message: "That reminder is not marked paid." });
        }

        const reminder = await model.clearPaid(req.user.id, Number(req.params.id));
        return res.json({
            message: `"${reminder.title}" is no longer marked paid. The expense it created is still in your expenses - delete it on the dashboard if it was a mistake.`,
            reminder: decorate(reminder, new Date()),
        });
    } catch (err) {
        console.error("unmarkPaid failed:", err);
        return res.status(500).json({ message: "Could not undo that" });
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
            // Two different truths, so two different sentences. Removing a
            // reminder on an expense leaves the expense; removing an upcoming
            // bill removes the only record of it, because there never was an
            // expense. Saying "the expense is still there" about a bill that
            // never existed would be a lie the user could not check.
            message: existing.source === "bill"
                ? `Upcoming bill "${existing.title}" removed. Nothing was in your expenses to delete.`
                : `Reminder removed. The expense "${existing.title}" is still there.`,
            id: existing.id,
        });
    } catch (err) {
        console.error("deleteReminder failed:", err);
        return res.status(500).json({ message: "Could not remove the reminder" });
    }
};

module.exports = {
    listReminders, saveReminder, updateReminder, deleteReminder,
    markPaid, unmarkPaid,
};
