import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FiBell, FiBellOff, FiClock, FiCalendar, FiEdit2, FiTrash2,
    FiAlertCircle, FiCheckCircle, FiInfo, FiPlus,
} from "react-icons/fi";
import DashboardLayout from "../Layouts/DashboardLayout";
import { useDisplay } from "../context/useDisplay";
import * as svc from "../services/reminderService";

// Reminders for recurring expenses.
//
// WHERE THE DATES COME FROM. This app's expenses are records of money already
// spent - expense_date defaults to CURRENT_DATE and ExpenseForm.jsx puts
// max={today()} on the input - so no expense has a due date to remind anybody
// about. A reminder is therefore attached to an expense the user marks as
// recurring: its own date is the anchor, and the next occurrence is projected
// forward from it.
//
// The projection is an expectation drawn from the user's own history, not a
// deadline somebody committed to, and the page says so in as many words rather
// than presenting a guess as a fact.
//
// EVERY DATE ON THIS PAGE IS COMPUTED SERVER-SIDE. dueOn, remindOn, the day
// counts and the status all arrive on the reminder. There is no date arithmetic
// in this file on purpose: a second implementation in the browser is how a due
// date ends up disagreeing with the status printed beside it.

// Reminder options, exactly the three the brief asks for. The values are the
// lead_days the API accepts (validated there and CHECK-constrained in the
// table), so this list cannot drift into offering something the server refuses.
const LEADS = [
    { days: 1, label: "1 day before" },
    { days: 3, label: "3 days before" },
    { days: 7, label: "1 week before" },
];

const FREQUENCIES = [
    { id: "weekly",    label: "Every week" },
    { id: "monthly",   label: "Every month" },
    { id: "quarterly", label: "Every 3 months" },
    { id: "yearly",    label: "Every year" },
];

const LEAD_LABEL = Object.fromEntries(LEADS.map((l) => [l.days, l.label]));
const FREQ_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.id, f.label]));

// The four states statusFor() in the backend's utils/recurrence.js can return.
// "sent" is unreachable today - delivery is in-app, so nothing writes
// last_sent_at - but it is handled here so switching email on later is a backend
// change only.
const STATUS = {
    due:       { label: "Due now",   cls: "rem-due" },
    scheduled: { label: "Scheduled", cls: "rem-scheduled" },
    sent:      { label: "Reminded",  cls: "rem-sent" },
    off:       { label: "Off",       cls: "rem-off" },
};

// Whole days in words. "in 0 days" and "in 1 days" both read as a bug.
const inDays = (n) => {
    if (n === null || n === undefined) return "";
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    return `in ${n} days`;
};

const UserReminders = () => {
    const display = useDisplay();

    const [state, setState] = useState({ data: null, error: "", loading: true });
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    // Which reminder's settings are open, and the unsaved draft for it. One
    // object rather than two states because they are only meaningful together.
    const [editing, setEditing] = useState(null);
    // Inline remove confirmation, the same pattern ExpenseTable.jsx uses - a
    // native confirm() blocks the page and cannot be styled.
    const [confirmId, setConfirmId] = useState(null);
    const [adding, setAdding] = useState({ expenseId: "", frequency: "monthly", leadDays: 3 });

    const alive = useRef(true);

    // Every setState happens inside a promise callback rather than synchronously
    // in the effect body - the same shape UserDashboard.jsx uses, and what this
    // repo's react-hooks/set-state-in-effect rule requires.
    const reload = useCallback(
        () =>
            svc.getReminders()
                .then((data) => {
                    if (alive.current) setState({ data, error: "", loading: false });
                })
                .catch((err) => {
                    if (alive.current) {
                        setState((prev) => ({ ...prev, error: err.message, loading: false }));
                    }
                }),
        []
    );

    useEffect(() => {
        alive.current = true;
        reload();
        return () => { alive.current = false; };
    }, [reload]);

    const { data, error, loading } = state;
    const reminders = useMemo(() => data?.reminders ?? [], [data]);
    const available = useMemo(() => data?.available ?? [], [data]);
    const counts = data?.counts ?? { total: 0, active: 0, due: 0 };

    // The soonest reminder still running. The list arrives sorted by due date
    // with disabled ones pushed to the end, so this is the first enabled row.
    const nextUp = useMemo(() => reminders.find((r) => r.enabled) || null, [reminders]);

    const flash = (message) => {
        setNotice(message);
        setState((prev) => ({ ...prev, error: "" }));
    };
    const fail = (err) => setState((prev) => ({ ...prev, error: err.message }));

    // One wrapper for every write: clear the last message, run it, reload, and
    // never leave `busy` stuck on a thrown error.
    const run = async (action) => {
        setBusy(true);
        setNotice("");
        setState((prev) => ({ ...prev, error: "" }));
        try {
            const result = await action();
            await reload();
            if (result?.message) flash(result.message);
            return true;
        } catch (err) {
            fail(err);
            return false;
        } finally {
            setBusy(false);
        }
    };

    const toggle = (reminder) =>
        run(() => svc.updateReminder(reminder.id, { enabled: !reminder.enabled }));

    const saveEdit = async () => {
        const ok = await run(() =>
            svc.updateReminder(editing.id, {
                frequency: editing.frequency,
                leadDays: editing.leadDays,
            })
        );
        if (ok) setEditing(null);
    };

    const removeReminder = async (id) => {
        const ok = await run(() => svc.deleteReminder(id));
        if (ok) { setConfirmId(null); setEditing(null); }
    };

    const addReminder = async (e) => {
        e.preventDefault();
        if (!adding.expenseId) return;
        const ok = await run(() => svc.saveReminder(adding));
        // The frequency and lead time are kept: somebody setting up several
        // monthly bills in a row should not have to re-pick "Every month" each
        // time. Only the expense is cleared, because it can only be used once.
        if (ok) setAdding((prev) => ({ ...prev, expenseId: "" }));
    };

    return (
        <DashboardLayout
            title="Expense Reminders"
            subtitle="Reminders for the expenses that come round again — rent, bills, EMIs."
        >
            {error && (
                <div className="alert alert-error" role="alert">
                    <FiAlertCircle aria-hidden="true" /> {error}
                </div>
            )}
            {notice && (
                <div className="alert alert-ok" role="status">
                    <FiCheckCircle aria-hidden="true" /> {notice}
                </div>
            )}

            <div className="stat-grid">
                <article className="stat-card tone-accent">
                    <div className="stat-top">
                        <span className="stat-label">Reminders on</span>
                        <span className="stat-icon"><FiBell aria-hidden="true" /></span>
                    </div>
                    <p className="stat-value">{counts.active}</p>
                    <p className="stat-sub">
                        {counts.total === counts.active
                            ? "All of your reminders are running"
                            : `${counts.total - counts.active} switched off`}
                    </p>
                </article>

                <article className={`stat-card ${counts.due ? "tone-warn" : "tone-ok"}`}>
                    <div className="stat-top">
                        <span className="stat-label">Due now</span>
                        <span className="stat-icon"><FiClock aria-hidden="true" /></span>
                    </div>
                    <p className="stat-value">{counts.due}</p>
                    <p className="stat-sub">
                        {counts.due
                            ? "Inside the reminder window"
                            : "Nothing needs your attention"}
                    </p>
                </article>

                <article className="stat-card tone-accent">
                    <div className="stat-top">
                        <span className="stat-label">Next one up</span>
                        <span className="stat-icon"><FiCalendar aria-hidden="true" /></span>
                    </div>
                    <p className="stat-value">
                        {nextUp ? display.date(nextUp.dueOn) : "—"}
                    </p>
                    <p className="stat-sub">
                        {nextUp
                            ? `${nextUp.title} · ${inDays(nextUp.daysUntilDue)}`
                            : "No reminders set yet"}
                    </p>
                </article>
            </div>

            <div className="panel">
                <div className="panel-head">
                    <h3>
                        Upcoming
                        {counts.due > 0 && <span className="count-pill">{counts.due}</span>}
                    </h3>
                    <span className="dash-hint">Soonest first</span>
                </div>

                {loading && <div className="empty-state">Loading your reminders…</div>}

                {!loading && !reminders.length && (
                    <div className="empty-state">
                        No reminders yet. Pick one of your expenses below and it will appear here.
                    </div>
                )}

                {!loading && reminders.length > 0 && (
                    <div className="table-wrap">
                        <table className="expense-table">
                            {/* COLUMN ORDER IS DELIBERATE. `.expense-table` is
                                min-width: 720px inside a horizontally scrolling
                                wrapper - this file's own answer for tables on a
                                phone - so on a 390px screen only the first three
                                columns are visible without a swipe. Expense, due
                                date and status are what answer "is there anything
                                I need to deal with", so they go first. Amount and
                                the reminder date are the follow-up question and
                                can sit behind the scroll. */}
                            <thead>
                                <tr>
                                    <th>Expense</th>
                                    <th>Due date</th>
                                    <th>Status</th>
                                    <th className="right">Amount</th>
                                    <th>Reminder</th>
                                    <th className="right">Actions</th>
                                </tr>
                            </thead>
                            <tbody>
                                {reminders.map((r) => {
                                    const status = STATUS[r.status] || STATUS.scheduled;
                                    const open = editing?.id === r.id;
                                    const confirming = confirmId === r.id;
                                    const rowClass = [
                                        r.enabled ? "" : "rem-row-off",
                                        open ? "rem-row-editing" : "",
                                    ].filter(Boolean).join(" ") || undefined;

                                    return (
                                        <tr key={r.id} className={rowClass}>
                                            <td>
                                                <div className="title-cell">
                                                    <strong>{r.title}</strong>
                                                    <small>{FREQ_LABEL[r.frequency] || r.frequency}</small>
                                                </div>
                                            </td>
                                            <td className="nowrap">
                                                <div className="title-cell">
                                                    <strong>{display.date(r.dueOn)}</strong>
                                                    <small>{inDays(r.daysUntilDue)}</small>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`rem-pill ${status.cls}`}>{status.label}</span>
                                            </td>
                                            <td className="right mono">{display.amount(r.amount)}</td>
                                            <td className="nowrap">
                                                <div className="title-cell">
                                                    <strong>{display.date(r.remindOn)}</strong>
                                                    <small>{LEAD_LABEL[r.lead_days]}</small>
                                                </div>
                                            </td>
                                            <td className="right">
                                                {confirming ? (
                                                    <span className="confirm-row">
                                                        <button type="button" className="btn btn-tiny btn-ghost"
                                                                onClick={() => setConfirmId(null)}>
                                                            Cancel
                                                        </button>
                                                        <button type="button" className="btn btn-tiny btn-danger"
                                                                disabled={busy}
                                                                onClick={() => removeReminder(r.id)}>
                                                            Remove
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <span className="action-row rem-actions">
                                                        {/* A real <button role="switch">, the same control
                                                            Settings > Display uses, so the state is
                                                            announced rather than only coloured. */}
                                                        <button
                                                            type="button"
                                                            role="switch"
                                                            aria-checked={r.enabled}
                                                            aria-label={`Reminder for ${r.title}`}
                                                            title={r.enabled ? "Switch this reminder off" : "Switch this reminder on"}
                                                            className={`dash-switch${r.enabled ? " dash-switch-on" : ""}`}
                                                            disabled={busy}
                                                            onClick={() => toggle(r)}
                                                        >
                                                            <i />
                                                        </button>
                                                        <button type="button" className="btn btn-tiny btn-ghost"
                                                                aria-expanded={open}
                                                                onClick={() => setEditing(open ? null : {
                                                                    id: r.id,
                                                                    title: r.title,
                                                                    // Carried into the draft so the editor can
                                                                    // name the anchor date without looking the
                                                                    // row up again.
                                                                    anchor: r.expense_date,
                                                                    frequency: r.frequency,
                                                                    leadDays: r.lead_days,
                                                                })}>
                                                            <FiEdit2 aria-hidden="true" /> Edit
                                                        </button>
                                                        {/* Icon only, so the switch and Edit keep their
                                                            room on a narrow table. The action is named
                                                            for a screen reader and on hover instead. */}
                                                        <button type="button" className="btn btn-tiny btn-danger"
                                                                aria-label={`Remove the reminder for ${r.title}`}
                                                                title="Remove this reminder"
                                                                onClick={() => setConfirmId(r.id)}>
                                                            <FiTrash2 aria-hidden="true" />
                                                        </button>
                                                    </span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}

                {/* THE EDITOR SITS OUTSIDE THE TABLE, not in a row spanning it.
                    It started life as a <tr> with colSpan={6} and looked right on
                    a laptop, but the table is min-width: 720px inside a
                    horizontally scrolling wrapper - so on a 390px phone the
                    editor was 720px wide too, and reaching Edit meant scrolling
                    right, which left its labels off the left of the screen.
                    Measured and screenshotted; it was unusable.

                    Below the table it is one implementation that works at every
                    width, and the row it belongs to is tinted (.rem-row-editing)
                    so the pairing is still obvious. */}
                {editing && (
                    <div className="rem-edit">
                        <p className="rem-edit-title">
                            Reminder settings for <strong>{editing.title}</strong>
                        </p>
                        <div className="form-row">
                            <label htmlFor="rem-edit-freq">
                                How often
                                <select id="rem-edit-freq" value={editing.frequency}
                                        onChange={(e) => setEditing({ ...editing, frequency: e.target.value })}>
                                    {FREQUENCIES.map((f) => (
                                        <option key={f.id} value={f.id}>{f.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label htmlFor="rem-edit-lead">
                                Remind me
                                <select id="rem-edit-lead" value={editing.leadDays}
                                        onChange={(e) => setEditing({
                                            ...editing, leadDays: Number(e.target.value),
                                        })}>
                                    {LEADS.map((l) => (
                                        <option key={l.days} value={l.days}>{l.label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>
                        <p className="dash-hint">
                            Counted from {display.date(editing.anchor)}, the date on this expense.
                            Changing how often it comes round moves the due date with it.
                        </p>
                        <div className="form-actions">
                            <button type="button" className="btn btn-primary"
                                    disabled={busy} onClick={saveEdit}>
                                {busy ? "Saving…" : "Save reminder"}
                            </button>
                            <button type="button" className="btn btn-ghost"
                                    onClick={() => setEditing(null)}>
                                Cancel
                            </button>
                        </div>
                    </div>
                )}

                <p className="dash-note">
                    <FiInfo aria-hidden="true" />
                    Due dates are worked out from the date on each expense, so they are what this
                    app expects from your own history rather than a bill somebody sent you. The
                    reminder shows on this page — nothing is emailed yet.
                </p>
            </div>

            <div className="panel">
                <div className="panel-head">
                    <h3>Add a reminder</h3>
                    <span className="dash-hint">
                        {available.length
                            ? `${available.length} of your expenses have none`
                            : "Every expense already has one"}
                    </span>
                </div>

                {!available.length && !loading ? (
                    <div className="empty-state">
                        {reminders.length
                            ? "Every expense on your account already has a reminder."
                            : "Record an expense on your dashboard first, then come back and set a reminder on it."}
                    </div>
                ) : (
                    <form className="dash-set-form" onSubmit={addReminder}>
                        <label htmlFor="rem-expense">
                            Which expense comes round again?
                            <select id="rem-expense" value={adding.expenseId} required
                                    onChange={(e) => setAdding({ ...adding, expenseId: e.target.value })}>
                                <option value="">Choose one of your expenses</option>
                                {available.map((e) => (
                                    <option key={e.id} value={e.id}>
                                        {e.title} — {display.exact(e.amount)} — {display.date(e.expense_date)}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <div className="form-row">
                            <label htmlFor="rem-add-freq">
                                How often
                                <select id="rem-add-freq" value={adding.frequency}
                                        onChange={(e) => setAdding({ ...adding, frequency: e.target.value })}>
                                    {FREQUENCIES.map((f) => (
                                        <option key={f.id} value={f.id}>{f.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label htmlFor="rem-add-lead">
                                Remind me
                                <select id="rem-add-lead" value={adding.leadDays}
                                        onChange={(e) => setAdding({ ...adding, leadDays: Number(e.target.value) })}>
                                    {LEADS.map((l) => (
                                        <option key={l.days} value={l.days}>{l.label}</option>
                                    ))}
                                </select>
                            </label>
                        </div>

                        {/* Amounts in the dropdown are exact rather than estimated: picking the
                            right row out of several similar ones is the one place a rounded
                            figure would actively get in the way. */}
                        <p className="dash-hint">
                            The expense you pick stays exactly as it is — this only adds a reminder
                            to it. Showing your {available.length >= (data?.availableLimit ?? 100)
                                ? `${data.availableLimit} most recent expenses without one`
                                : "expenses that do not have one yet"}.
                        </p>

                        <div className="form-actions">
                            <button type="submit" className="btn btn-primary"
                                    disabled={busy || !adding.expenseId}>
                                <FiPlus aria-hidden="true" /> {busy ? "Saving…" : "Set reminder"}
                            </button>
                        </div>
                    </form>
                )}
            </div>

            {counts.total > 0 && counts.active === 0 && (
                <p className="page-note">
                    <FiBellOff aria-hidden="true" />
                    {" "}Every reminder is switched off, so nothing will be flagged. Use the switch
                    on any row to turn one back on.
                </p>
            )}
        </DashboardLayout>
    );
};

export default UserReminders;
