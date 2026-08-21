import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FiBell, FiBellOff, FiClock, FiCalendar, FiEdit2, FiTrash2,
    FiAlertCircle, FiCheckCircle, FiInfo, FiPlus, FiAlertTriangle,
    FiCheck, FiRotateCcw,
} from "react-icons/fi";
import DashboardLayout from "../Layouts/DashboardLayout";
import { useDisplay } from "../context/useDisplay";
import * as svc from "../services/reminderService";

// Reminders for expenses that come round again.
//
// WHERE THE DATES COME FROM. This app's expenses are records of money already
// spent - expense_date defaults to CURRENT_DATE and ExpenseForm.jsx puts
// max={today()} on the input - so no expense has a due date to remind anybody
// about. A reminder therefore hangs off one of three things:
//
//   * an expense already recorded, whose date is the anchor for a projection;
//   * an expense typed in here that the user paid but never recorded, which
//     really is added to their expenses;
//   * an upcoming BILL typed in here, which is deliberately NOT an expense -
//     see the note by KINDS below, because that distinction is the whole reason
//     this page can be trusted.
//
// EVERY DATE IS COMPUTED SERVER-SIDE. dueOn, remindOn, the day counts, the
// status and whether a due date was stated or projected all arrive on the
// reminder. There is no date arithmetic in this file on purpose: a second
// implementation in the browser is how a due date ends up disagreeing with the
// status printed beside it.

// The three reminder options the brief asks for, plus the custom escape hatch.
// The `days` values are the lead_days the API accepts (validated there and
// CHECK-constrained in the table), so this list cannot drift into offering
// something the server refuses.
const LEADS = [
    { days: 1, label: "1 day before" },
    { days: 3, label: "3 days before" },
    { days: 7, label: "1 week before" },
];

// A sentinel, never sent to the server. The double underscores make that obvious
// and cannot collide with a real value. Same trick ExpenseForm.jsx uses for its
// Others category, and for the same reason.
const CUSTOM = "__custom__";
const OTHER = "__other__";

const FREQUENCIES = [
    { id: "once",      label: "Just once" },
    { id: "weekly",    label: "Every week" },
    { id: "monthly",   label: "Every month" },
    { id: "quarterly", label: "Every 3 months" },
    { id: "yearly",    label: "Every year" },
];

// "Just once" has nothing to project from, so it is only offered where a due
// date is actually being given. RECURRING mirrors the server's own list.
const RECURRING = FREQUENCIES.filter((f) => f.id !== "once");

const LEAD_LABEL = Object.fromEntries(LEADS.map((l) => [l.days, l.label]));
const FREQ_LABEL = Object.fromEntries(FREQUENCIES.map((f) => [f.id, f.label]));

// The five states statusFor() in the backend's utils/recurrence.js can return.
// "sent" is unreachable today - delivery is in-app, so nothing writes
// last_sent_at - but it is handled here so switching email on later is a backend
// change only.
const STATUS = {
    paid:      { label: "Paid",      cls: "rem-paid" },
    overdue:   { label: "Overdue",   cls: "rem-overdue" },
    due:       { label: "Due now",   cls: "rem-due" },
    scheduled: { label: "Scheduled", cls: "rem-scheduled" },
    sent:      { label: "Reminded",  cls: "rem-sent" },
    off:       { label: "Off",       cls: "rem-off" },
};

// Whole days in words. "in 0 days" and "in 1 days" both read as a bug, and a
// negative count needs saying out loud rather than printing "in -4 days".
const inDays = (n) => {
    if (n === null || n === undefined) return "";
    if (n === 0) return "today";
    if (n === 1) return "tomorrow";
    if (n === -1) return "1 day late";
    if (n < 0) return `${Math.abs(n)} days late`;
    return `in ${n} days`;
};

// Local calendar date as YYYY-MM-DD, for the min/max bounds on the pickers.
// Built from local parts, not toISOString(): in IST the UTC date is still
// yesterday for the first 5.5 hours of every day, which would let a "paid" date
// of today fail its own max check. Same trap ExpenseForm.jsx's today() calls out.
const todayIso = () => {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

const BLANK_ADD = {
    expenseId: "",        // "" = nothing chosen, OTHER = the typed paths
    kind: "bill",         // which typed path, once OTHER is chosen
    title: "",
    amount: "",
    category: "",
    paidOn: "",
    dueOn: "",
    frequency: "monthly",
    leadDays: 3,
    remindOn: "",
};

const UserReminders = () => {
    const display = useDisplay();

    const [state, setState] = useState({ data: null, error: "", loading: true });
    const [notice, setNotice] = useState("");
    const [busy, setBusy] = useState(false);
    const [editing, setEditing] = useState(null);
    const [confirmId, setConfirmId] = useState(null);
    const [adding, setAdding] = useState(BLANK_ADD);
    // Which slice of the list is on screen. Needed because a paid one-off stays
    // listed for ever by design, and without a filter it eventually buries the
    // things that are actually coming up.
    const [view, setView] = useState("upcoming");
    // Mark paid creates a real expense, so it gets the same inline confirmation
    // Remove has. Held separately from `confirmId` so arming one does not arm
    // the other on the same row.
    const [payId, setPayId] = useState(null);

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
    const counts = data?.counts ?? { total: 0, active: 0, due: 0, overdue: 0, bills: 0 };

    const nextUp = useMemo(
        () => reminders.find((r) => r.enabled && r.status !== "paid") || null,
        [reminders]
    );

    // Filtered in the page rather than the API: the whole list is already here,
    // a round trip per chip would be slower than a re-render, and the counts on
    // the chips have to come from the same array the table renders or they can
    // disagree with it.
    //
    // UPCOMING KEEPS ANYTHING PAID TODAY, and that is not a fudge. Without it,
    // pressing Paid made the row vanish from the default view - so the one thing
    // the user asked for ("the row stays, marked Paid") appeared not to happen,
    // and the only evidence a ₹35,000 expense had just been created was a toast
    // that fades. Keeping today's payments visible means you watch the pill turn
    // green, and by tomorrow the row has moved out of the way on its own.
    const isUpcoming = (r) => r.status !== "paid" || r.paidOn === todayIso();

    const visible = useMemo(() => {
        if (view === "paid") return reminders.filter((r) => r.status === "paid");
        if (view === "all") return reminders;
        return reminders.filter(isUpcoming);
    }, [reminders, view]);

    const VIEWS = [
        { id: "upcoming", label: "Upcoming", n: reminders.filter(isUpcoming).length },
        { id: "paid",     label: "Paid",     n: counts.paid ?? 0 },
        { id: "all",      label: "All",      n: reminders.length },
    ];

    const typing = adding.expenseId === OTHER;
    const addingBill = typing && adding.kind === "bill";
    // "Just once" only makes sense where a due date is being supplied.
    const freqOptions = addingBill || adding.dueOn ? FREQUENCIES : RECURRING;

    const flash = (message) => {
        setNotice(message);
        setState((prev) => ({ ...prev, error: "" }));
    };

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
            setState((prev) => ({ ...prev, error: err.message }));
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
                // "" is how the API is told to CLEAR a date, which is how you go
                // back to a projected due date or a plain 1/3/7-day lead. null
                // would work too; "" is what an emptied <input type="date">
                // actually gives us, so it is passed through unchanged.
                dueOn: editing.dueOn || "",
                remindOn: editing.custom ? (editing.remindOn || "") : "",
            })
        );
        if (ok) setEditing(null);
    };

    const pay = async (id) => {
        const ok = await run(() => svc.markPaid(id));
        if (ok) setPayId(null);
    };

    const undoPay = (id) => run(() => svc.unmarkPaid(id));

    const removeReminder = async (id) => {
        const ok = await run(() => svc.deleteReminder(id));
        if (ok) { setConfirmId(null); setEditing(null); }
    };

    const addReminder = async (e) => {
        e.preventDefault();

        const shared = {
            frequency: adding.frequency,
            leadDays: adding.leadDays,
            remindOn: adding.remindOn || "",
        };

        const payload = !typing
            ? { kind: "existing", expenseId: adding.expenseId, dueOn: adding.dueOn || "", ...shared }
            : adding.kind === "bill"
                ? { kind: "bill", title: adding.title, amount: Number(adding.amount),
                    dueOn: adding.dueOn, ...shared }
                : { kind: "expense", title: adding.title, amount: Number(adding.amount),
                    paidOn: adding.paidOn, dueOn: adding.dueOn || "", ...shared };

        const ok = await run(() => svc.saveReminder(payload));
        // The frequency and lead time are kept: somebody setting up several
        // monthly bills in a row should not have to re-pick "Every month" each
        // time. Everything identifying one expense is cleared.
        if (ok) {
            setAdding((prev) => ({
                ...BLANK_ADD, frequency: prev.frequency, leadDays: prev.leadDays,
            }));
        }
    };

    const canSubmit = typing
        ? Boolean(adding.title.trim()) && Number(adding.amount) > 0
            && Boolean(addingBill ? adding.dueOn : adding.paidOn)
        : Boolean(adding.expenseId);

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

                {/* Overdue replaces "Due now" when there is anything overdue: a
                    bill you have missed matters more than one coming up, and two
                    tiles saying almost the same thing would bury it. */}
                {counts.overdue > 0 ? (
                    <article className="stat-card tone-bad">
                        <div className="stat-top">
                            <span className="stat-label">Overdue</span>
                            <span className="stat-icon"><FiAlertTriangle aria-hidden="true" /></span>
                        </div>
                        <p className="stat-value">{counts.overdue}</p>
                        <p className="stat-sub">
                            {counts.due > 0 ? `and ${counts.due} due now` : "Past its due date"}
                        </p>
                    </article>
                ) : (
                    <article className={`stat-card ${counts.due ? "tone-warn" : "tone-ok"}`}>
                        <div className="stat-top">
                            <span className="stat-label">Due now</span>
                            <span className="stat-icon"><FiClock aria-hidden="true" /></span>
                        </div>
                        <p className="stat-value">{counts.due}</p>
                        <p className="stat-sub">
                            {counts.due ? "Inside the reminder window" : "Nothing needs your attention"}
                        </p>
                    </article>
                )}

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
                        {counts.due + counts.overdue > 0 && (
                            <span className="count-pill">{counts.due + counts.overdue}</span>
                        )}
                    </h3>
                    <span className="dash-hint">
                        {counts.bills > 0
                            ? `Soonest first · ${counts.bills} not yet paid`
                            : "Soonest first"}
                    </span>
                </div>

                {/* Only shown once something has actually been paid. Three chips
                    on a page with nothing to filter is furniture, and it would
                    make the panel look busier than it is on day one. */}
                {(counts.paid ?? 0) > 0 && (
                    <div className="filter-row rem-views" role="group" aria-label="Which reminders to show">
                        {VIEWS.map((v) => (
                            <button key={v.id} type="button"
                                    aria-pressed={view === v.id}
                                    className={`chip${view === v.id ? " chip-active" : ""}`}
                                    onClick={() => { setView(v.id); setPayId(null); setConfirmId(null); }}>
                                {v.label}
                                <span className="chip-count">{v.n}</span>
                            </button>
                        ))}
                    </div>
                )}

                {loading && <div className="empty-state">Loading your reminders…</div>}

                {!loading && !visible.length && (
                    <div className="empty-state">
                        {view === "paid"
                            ? "Nothing marked paid yet."
                            : reminders.length
                                ? "Everything here has been paid. Switch to Paid or All to see it."
                                : "No reminders yet. Pick one of your expenses below — or choose Others and type in something that is not there yet."}
                    </div>
                )}

                {!loading && visible.length > 0 && (
                    <div className="table-wrap">
                        <table className="expense-table">
                            {/* COLUMN ORDER IS DELIBERATE. `.expense-table` is
                                min-width: 720px inside a horizontally scrolling
                                wrapper - this file's own answer for tables on a
                                phone - so on a 390px screen only the first three
                                columns are visible without a swipe. Expense, due
                                date and status are what answer "is there anything
                                I need to deal with", so they go first. */}
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
                                {visible.map((r) => {
                                    const status = STATUS[r.status] || STATUS.scheduled;
                                    const open = editing?.id === r.id;
                                    const confirming = confirmId === r.id;
                                    const paid = r.status === "paid";
                                    const paying = payId === r.id;
                                    const rowClass = [
                                        r.enabled ? "" : "rem-row-off",
                                        // A settled row is dimmed the same way a
                                        // switched-off one is: still readable,
                                        // clearly not asking for anything.
                                        paid ? "rem-row-paid" : "",
                                        open ? "rem-row-editing" : "",
                                    ].filter(Boolean).join(" ") || undefined;

                                    return (
                                        <tr key={r.id} className={rowClass}>
                                            <td>
                                                <div className="title-cell">
                                                    <strong>{r.title}</strong>
                                                    <small>
                                                        {FREQ_LABEL[r.frequency] || r.frequency}
                                                        {/* A bill has no expense behind it, and that
                                                            is worth saying on the row rather than
                                                            only in a note - it is why this amount is
                                                            missing from the dashboard.
                                                            Suppressed once paid, because the tag is
                                                            driven by the row TYPE and a settled bill
                                                            was otherwise reading "Paid" and "not
                                                            paid yet" on the same line. */}
                                                        {r.source === "bill" && !paid && (
                                                            <> · <span className="rem-tag">not paid yet</span></>
                                                        )}
                                                    </small>
                                                </div>
                                            </td>
                                            <td className="nowrap">
                                                <div className="title-cell">
                                                    <strong>{display.date(r.dueOn)}</strong>
                                                    <small>
                                                        {inDays(r.daysUntilDue)}
                                                        {/* "expected" vs a bare date: a projection
                                                            drawn from history is a guess and must
                                                            not be dressed as a fact. */}
                                                        {r.dueSource === "projected" && " · expected"}
                                                    </small>
                                                </div>
                                            </td>
                                            <td>
                                                <span className={`rem-pill ${status.cls}`}>{status.label}</span>
                                            </td>
                                            <td className="right mono">{display.amount(r.amount)}</td>
                                            <td className="nowrap">
                                                <div className="title-cell">
                                                    <strong>{display.date(r.remindOn)}</strong>
                                                    <small>
                                                        {r.paidOn
                                                            ? `paid ${display.date(r.paidOn)}`
                                                            : r.remind_on
                                                                ? "date you chose"
                                                                : LEAD_LABEL[r.lead_days]}
                                                    </small>
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
                                                ) : paying ? (
                                                    /* Marking paid CREATES a real expense, so it
                                                       cannot be one click. The amount is named in
                                                       the button, because "Confirm" on a row full
                                                       of numbers does not say what is about to
                                                       land on the dashboard. */
                                                    <span className="confirm-row">
                                                        <button type="button" className="btn btn-tiny btn-ghost"
                                                                onClick={() => setPayId(null)}>
                                                            Cancel
                                                        </button>
                                                        <button type="button" className="btn btn-tiny btn-primary"
                                                                disabled={busy}
                                                                onClick={() => pay(r.id)}>
                                                            Add {display.exact(r.amount)} as paid
                                                        </button>
                                                    </span>
                                                ) : (
                                                    <span className="action-row rem-actions">
                                                        {/* A real <button role="switch">, the same
                                                            control Settings > Display uses, so the
                                                            state is announced rather than only
                                                            coloured. */}
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
                                                        {/* Paid rows offer Undo instead. One slot,
                                                            two states, so the row never grows a
                                                            fourth control on a narrow table. */}
                                                        {paid ? (
                                                            <button type="button" className="btn btn-tiny btn-ghost"
                                                                    disabled={busy}
                                                                    title="This stays in your expenses — undo only clears the paid mark"
                                                                    onClick={() => undoPay(r.id)}>
                                                                <FiRotateCcw aria-hidden="true" /> Undo
                                                            </button>
                                                        ) : (
                                                            <button type="button" className="btn btn-tiny btn-ok"
                                                                    disabled={busy || !r.enabled}
                                                                    title={r.enabled
                                                                        ? "Record this as paid and add it to your expenses"
                                                                        : "Switch this reminder on first"}
                                                                    onClick={() => { setPayId(r.id); setConfirmId(null); }}>
                                                                <FiCheck aria-hidden="true" /> Paid
                                                            </button>
                                                        )}
                                                        <button type="button" className="btn btn-tiny btn-ghost"
                                                                aria-expanded={open}
                                                                onClick={() => setEditing(open ? null : {
                                                                    id: r.id,
                                                                    title: r.title,
                                                                    source: r.source,
                                                                    anchor: r.expense_date,
                                                                    frequency: r.frequency,
                                                                    leadDays: r.lead_days,
                                                                    dueOn: r.due_on ? String(r.due_on).slice(0, 10) : "",
                                                                    remindOn: r.remind_on ? String(r.remind_on).slice(0, 10) : "",
                                                                    custom: Boolean(r.remind_on),
                                                                })}>
                                                            <FiEdit2 aria-hidden="true" /> Edit
                                                        </button>
                                                        {/* Icon only, so the switch and Edit keep
                                                            their room on a narrow table. The action
                                                            is named for a screen reader and on
                                                            hover instead. */}
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
                                    {(editing.dueOn || editing.source === "bill"
                                        ? FREQUENCIES : RECURRING).map((f) => (
                                        <option key={f.id} value={f.id}>{f.label}</option>
                                    ))}
                                </select>
                            </label>
                            <label htmlFor="rem-edit-lead">
                                Remind me
                                <select id="rem-edit-lead"
                                        value={editing.custom ? CUSTOM : editing.leadDays}
                                        onChange={(e) => {
                                            const v = e.target.value;
                                            setEditing(v === CUSTOM
                                                ? { ...editing, custom: true }
                                                : { ...editing, custom: false, remindOn: "", leadDays: Number(v) });
                                        }}>
                                    {LEADS.map((l) => (
                                        <option key={l.days} value={l.days}>{l.label}</option>
                                    ))}
                                    <option value={CUSTOM}>Custom date…</option>
                                </select>
                            </label>
                        </div>

                        <div className="form-row">
                            {/* Optional on an expense-backed reminder, mandatory on
                                a bill - which is why the label and the hint differ
                                rather than showing one vague wording for both. */}
                            <label htmlFor="rem-edit-due">
                                Due date{" "}
                                {editing.source === "bill"
                                    ? <span className="optional">(required)</span>
                                    : <span className="optional">(optional)</span>}
                                <input id="rem-edit-due" type="date" value={editing.dueOn}
                                       onChange={(e) => setEditing({ ...editing, dueOn: e.target.value })} />
                            </label>
                            {editing.custom && (
                                <label htmlFor="rem-edit-remind">
                                    Remind me on
                                    <input id="rem-edit-remind" type="date" value={editing.remindOn}
                                           onChange={(e) => setEditing({ ...editing, remindOn: e.target.value })} />
                                </label>
                            )}
                        </div>

                        <p className="dash-hint">
                            {editing.source === "bill"
                                ? "This is a bill you have not paid, so it has no expense behind it — the due date is the one you set here."
                                : editing.dueOn
                                    ? `Using the due date you set. Clear the box to go back to working it out from ${display.date(editing.anchor)}, the date on this expense.`
                                    : `Counted from ${display.date(editing.anchor)}, the date on this expense. Set a due date above to override it.`}
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

                {/* The text is wrapped in a single <span>, and that is not
                    decoration. `.dash-note` is display: flex, so every child is a
                    flex ITEM - a bare <b> in the middle of the sentence became a
                    third column and broke it into "A date / marked / expected /
                    is worked out from...". One element, one item, one paragraph.
                    Caught by screenshot; computed styles all looked correct. */}
                <p className="dash-note">
                    <FiInfo aria-hidden="true" />
                    <span>
                        <b>Paid</b> records the payment as a real expense dated today, so it shows
                        on your dashboard and counts in your totals. A repeating reminder then
                        moves to its next date on its own; a one-off is finished and stays here
                        marked Paid.{" "}
                        A date marked <b>expected</b> is worked out from the date on your expense,
                        so it is what this app predicts from your own history rather than a bill
                        somebody sent you. Anything you give a due date for is shown as that date
                        exactly. Reminders show on this page — nothing is emailed yet.
                    </span>
                </p>
            </div>

            <div className="panel">
                <div className="panel-head">
                    <h3>Add a reminder</h3>
                    <span className="dash-hint">
                        {available.length
                            ? `${available.length} of your expenses have none`
                            : "Or type in something new"}
                    </span>
                </div>

                <form className="dash-set-form" onSubmit={addReminder}>
                    <label htmlFor="rem-expense">
                        Which expense comes round again?
                        <select id="rem-expense" value={adding.expenseId} required
                                onChange={(e) => setAdding({
                                    ...BLANK_ADD,
                                    frequency: adding.frequency,
                                    leadDays: adding.leadDays,
                                    expenseId: e.target.value,
                                })}>
                            <option value="">Choose one of your expenses</option>
                            {available.map((e) => (
                                <option key={e.id} value={e.id}>
                                    {e.title} — {display.exact(e.amount)} — {display.date(e.expense_date)}
                                </option>
                            ))}
                            {/* Last, and separated by the label, so it reads as an
                                escape hatch rather than another expense. Same
                                position ExpenseForm.jsx gives its own Others. */}
                            <option value={OTHER}>Others — type it in myself</option>
                        </select>
                    </label>

                    {typing && (
                        <div className="rem-typed">
                            {/* TWO GENUINELY DIFFERENT THINGS, so a choice rather
                                than one form that guesses. An expense is money
                                already spent and lands in every total on the
                                dashboard; a bill is money owed and lands in none
                                of them. Getting this wrong either inflates the
                                user's spending by a bill they have not paid, or
                                loses a payment they did make. */}
                            <span className="dash-set-txt">
                                <b>What are you adding?</b>
                                <small>
                                    This changes whether it counts as spending, so it is worth
                                    getting right.
                                </small>
                            </span>
                            <span className="dash-pick" role="group" aria-label="What are you adding">
                                {/* Two words each, and parallel, so the pair reads
                                    as one choice. They were "A bill still coming
                                    up" / "Something I already paid", which
                                    measured 201px per button - 402px inside a
                                    390px phone, and the page scrolled sideways.
                                    The full consequence is spelled out in the
                                    note below rather than crammed into a label. */}
                                <button type="button"
                                        aria-pressed={adding.kind === "bill"}
                                        className={adding.kind === "bill" ? "dash-pick-on" : ""}
                                        onClick={() => setAdding({ ...adding, kind: "bill", paidOn: "" })}>
                                    Not paid yet
                                </button>
                                <button type="button"
                                        aria-pressed={adding.kind === "expense"}
                                        className={adding.kind === "expense" ? "dash-pick-on" : ""}
                                        onClick={() => setAdding({
                                            ...adding, kind: "expense", dueOn: "",
                                            frequency: adding.frequency === "once" ? "monthly" : adding.frequency,
                                        })}>
                                    Already paid
                                </button>
                            </span>

                            <div className="form-row">
                                <label htmlFor="rem-title">
                                    Name
                                    <input id="rem-title" value={adding.title} maxLength={150}
                                           placeholder={addingBill ? "e.g. Health insurance" : "e.g. Broadband"}
                                           onChange={(e) => setAdding({ ...adding, title: e.target.value })} />
                                </label>
                                <label htmlFor="rem-amount">
                                    Amount
                                    <input id="rem-amount" type="number" step="0.01" min="0.01"
                                           value={adding.amount} placeholder="0.00"
                                           onChange={(e) => setAdding({ ...adding, amount: e.target.value })} />
                                </label>
                            </div>

                            <div className="form-row">
                                {addingBill ? (
                                    <label htmlFor="rem-due">
                                        Due date
                                        {/* min, not max: a bill is something owed, so
                                            a past date is refused by the server and
                                            the picker says so first. */}
                                        <input id="rem-due" type="date" min={todayIso()}
                                               value={adding.dueOn}
                                               onChange={(e) => setAdding({ ...adding, dueOn: e.target.value })} />
                                    </label>
                                ) : (
                                    <label htmlFor="rem-paid">
                                        Date paid
                                        {/* max={today}, the same bound ExpenseForm.jsx
                                            puts on its own date input - this route
                                            must not become a way around a rule the
                                            rest of the app enforces. */}
                                        <input id="rem-paid" type="date" max={todayIso()}
                                               value={adding.paidOn}
                                               onChange={(e) => setAdding({ ...adding, paidOn: e.target.value })} />
                                    </label>
                                )}
                                <label htmlFor="rem-category">
                                    Category <span className="optional">(optional)</span>
                                    <input id="rem-category" maxLength={50}
                                           placeholder="Other"
                                           disabled={addingBill}
                                           title={addingBill ? "A bill has no category until it becomes an expense" : undefined}
                                           value={adding.category ?? ""}
                                           onChange={(e) => setAdding({ ...adding, category: e.target.value })} />
                                </label>
                            </div>

                            <p className={`dash-note ${addingBill ? "rem-note-bill" : ""}`}>
                                <FiInfo aria-hidden="true" />
                                {addingBill
                                    ? "This is NOT added to your expenses. Your dashboard total, category breakdown and export are untouched — a bill you have not paid is not spending."
                                    : "This IS added to your expenses, exactly as if you had entered it on the dashboard, so it counts towards your totals."}
                            </p>
                        </div>
                    )}

                    <div className="form-row">
                        <label htmlFor="rem-add-freq">
                            How often
                            <select id="rem-add-freq" value={adding.frequency}
                                    onChange={(e) => setAdding({ ...adding, frequency: e.target.value })}>
                                {freqOptions.map((f) => (
                                    <option key={f.id} value={f.id}>{f.label}</option>
                                ))}
                            </select>
                        </label>
                        <label htmlFor="rem-add-lead">
                            Remind me
                            <select id="rem-add-lead"
                                    value={adding.remindOn ? CUSTOM : adding.leadDays}
                                    onChange={(e) => {
                                        const v = e.target.value;
                                        setAdding(v === CUSTOM
                                            ? { ...adding, remindOn: todayIso() }
                                            : { ...adding, remindOn: "", leadDays: Number(v) });
                                    }}>
                                {LEADS.map((l) => (
                                    <option key={l.days} value={l.days}>{l.label}</option>
                                ))}
                                <option value={CUSTOM}>Custom date…</option>
                            </select>
                        </label>
                    </div>

                    <div className="form-row">
                        {adding.remindOn && (
                            <label htmlFor="rem-add-remind">
                                Remind me on
                                <input id="rem-add-remind" type="date" value={adding.remindOn}
                                       onChange={(e) => setAdding({ ...adding, remindOn: e.target.value })} />
                            </label>
                        )}
                        {/* A due-date override is offered on an existing expense too,
                            so "my rent is actually due on the 1st" does not need the
                            expense itself edited. Hidden for a bill, which already
                            has its own required due date above. */}
                        {!addingBill && (
                            <label htmlFor="rem-add-due">
                                Due date <span className="optional">(optional)</span>
                                <input id="rem-add-due" type="date" value={adding.dueOn}
                                       onChange={(e) => setAdding({ ...adding, dueOn: e.target.value })} />
                            </label>
                        )}
                    </div>

                    <p className="dash-hint">
                        {adding.dueOn || addingBill
                            ? "Using the due date you set."
                            : "Leave the due date blank and it is worked out from the date on the expense."}
                        {" "}
                        {adding.remindOn
                            ? "You will be reminded on the exact date you picked."
                            : "The reminder lands the chosen number of days before it."}
                    </p>

                    <div className="form-actions">
                        <button type="submit" className="btn btn-primary" disabled={busy || !canSubmit}>
                            <FiPlus aria-hidden="true" /> {busy ? "Saving…" : "Set reminder"}
                        </button>
                        {typing && (
                            <button type="button" className="btn btn-ghost"
                                    onClick={() => setAdding({
                                        ...BLANK_ADD,
                                        frequency: adding.frequency, leadDays: adding.leadDays,
                                    })}>
                                Cancel
                            </button>
                        )}
                    </div>
                </form>
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
