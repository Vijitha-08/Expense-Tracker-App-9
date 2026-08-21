// Where a reminder's date actually comes from.
//
// THE PROBLEM THIS SOLVES
// This app's expenses are records of money already spent. `expense_date` is
// `DATE NOT NULL DEFAULT CURRENT_DATE`, and ExpenseForm.jsx puts `max={today()}`
// on the input, so no row can be dated in the future. There is therefore no
// stored "due date" anywhere to remind anybody about, and adding a second kind
// of expense that the rest of the app knows nothing about would have put a bill
// tracker beside the expense tracker with nothing joining them.
//
// So a reminder attaches to an expense the user marks as RECURRING. The
// expense's own `expense_date` is the anchor, the frequency says how often it
// comes round, and the next occurrence is projected forward from that anchor.
// Every figure on the Reminders page is therefore derived from a real row the
// user already entered - nothing is typed twice and nothing is invented.
//
// The honest caveat, which the page states in plain words rather than hiding:
// the projected date is an expectation drawn from history ("expected 05 Sep"),
// not a deadline somebody committed to.
//
// Everything in this file is pure - dates in, dates out, no database and no
// Express. That is deliberate: the month arithmetic below is the part of this
// feature most likely to be subtly wrong, and it should be readable and
// testable on its own.

const DAY_MS = 86400000;

// Months between occurrences. "weekly" is deliberately absent: seven days is
// not a month count and is handled by its own branch, which needs no clamping.
const MONTHS_PER = { monthly: 1, quarterly: 3, yearly: 12 };

// "once" is a real frequency here rather than a null: a bill that happens once
// still needs a due date, a reminder and a status, and every code path that
// takes a frequency would otherwise need a null check. It is listed FIRST
// because it is only offered alongside a typed due date, and reading the list
// top-down then goes "just this once, then every week, every month...".
const FREQUENCIES = ["once", "weekly", "monthly", "quarterly", "yearly"];

// The frequencies that can be projected from a past expense. "once" cannot -
// there is nothing to project - so it is only valid with an explicit due date,
// and the controller enforces that.
const RECURRING = ["weekly", "monthly", "quarterly", "yearly"];

// The three lead times the page offers - "1 day before", "3 days before",
// "1 week before". Kept here rather than in the controller so the CHECK
// constraint in reminderModel.js, the validator and the UI all trace back to
// one list.
const LEAD_DAYS = [1, 3, 7];

// ------------------------------------------------------------------
// Days, pinned to UTC midnight
// ------------------------------------------------------------------
// Every date in this file is a Date at UTC midnight, so a comparison is a
// comparison of calendar days and nothing else. Mixing a timestamp into that
// would make "is the reminder due today" depend on the hour it was asked.
const toUtcDay = (value) => {
    if (value === null || value === undefined) return null;
    // A pg DATE column arrives as a JavaScript Date at LOCAL midnight, so read
    // its local parts; a plain "YYYY-MM-DD" string is already what we want.
    const iso =
        value instanceof Date
            ? `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`
            : String(value).slice(0, 10);
    const [y, m, d] = iso.split("-").map(Number);
    if (!y || !m || !d) return null;
    return new Date(Date.UTC(y, m - 1, d));
};

// Back to "YYYY-MM-DD", reading UTC parts.
//
// NOT csv.js's isoDay(): that reads LOCAL parts, which is correct for a pg DATE
// (handed back at local midnight) and wrong here, where every date is pinned to
// UTC midnight on purpose. West of Greenwich the local getters would render
// 5 Sep as "2026-09-04" - a reminder a day early, every time, for half the
// world.
const isoUtc = (date) =>
    date
        ? `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`
        : null;

// Today, as a UTC-midnight day built from the server's LOCAL calendar parts.
// Not `new Date().toISOString().slice(0, 10)`: in IST the UTC date is still
// yesterday for the first 5.5 hours of every day, which would hold every
// reminder back by one. The same trap is called out in ExpenseForm.jsx's
// today() and csv.js's isoDay, and handled the same way in all three.
const todayUtc = (now = new Date()) =>
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));

// ------------------------------------------------------------------
// Month arithmetic
// ------------------------------------------------------------------
// Add whole calendar months to an anchor, keeping the anchor's day-of-month and
// clamping to the last valid day when the target month is shorter:
//
//   31 Jan + 1 month  ->  29 Feb (2024) / 28 Feb (2025)
//   31 Jan + 2 months ->  31 MARCH, not 29 March
//
// That second line is the whole reason this measures from the anchor every
// time instead of stepping forward from the previously computed date. Stepped,
// January's 31st clamps to the 29th in February and then STAYS on the 29th for
// good - a monthly rent reminder walks backwards through the calendar, one day
// at a time, and nobody notices for months.
//
// Postgres gets this right for the same reason
// (`date '2024-01-31' + interval '2 months'` is `2024-03-31`, verified), so
// this matches the database rather than disagreeing with it.
const addMonths = (anchor, months) => {
    const year = anchor.getUTCFullYear();
    const month = anchor.getUTCMonth() + months;
    // Day 0 of the month AFTER the target is the last day of the target month,
    // and Date.UTC rolls a month index past 11 (or below 0) into the right year
    // by itself.
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return new Date(Date.UTC(year, month, Math.min(anchor.getUTCDate(), lastDay)));
};

// The next occurrence: the first one AFTER the anchor that is also on or after
// `from` (today).
//
// "After the anchor" is the subtle half, and getting it wrong is the most
// obvious way this feature could look broken. The anchor is an expense the user
// has already recorded - money already spent. So the occurrence ON the anchor
// date is the one that has just been dealt with, and the next one is a period
// later:
//
//   * rent recorded TODAY, monthly  -> due next month, NOT "due today". Telling
//     somebody their rent is due today, seconds after they logged paying it, is
//     the bug that made this rule explicit.
//   * rent recorded exactly a month ago, monthly -> due TODAY. Here today IS
//     the next occurrence, and saying so is the useful answer.
//   * rent recorded 40 days ago, monthly -> the occurrence 10 days ago is in the
//     past, so the answer is the one ~20 days out. Nothing is reported as
//     overdue, because whether a past occurrence was actually paid is not
//     something this app knows.
//
// An anchor genuinely in the FUTURE is returned untouched instead. The form
// blocks future dates with max={today()}, but the server's parseBody does not,
// so a PUT to /api/expenses can still set one - and skipping past it would hide
// the very date the user chose.
//
// `inclusive` FLIPS THAT WHOLE RULE, and it is the difference between the two
// kinds of anchor this app now has:
//
//   * an EXPENSE date (inclusive: false, the default) is money already spent, so
//     the occurrence on it is done and the next one is a period later.
//   * a STATED due date (inclusive: true) is a bill the user typed in and has
//     NOT paid. Its own date is the answer, and "due today" is exactly what
//     should be shown on the day. Rolling it forward a month would hide the
//     date they just chose.
// `after` SKIPS OCCURRENCES ALREADY SETTLED, and it has to be the occurrence's
// own date rather than the date somebody paid. Paying early is the case that
// makes this necessary: a monthly bill due the 23rd, paid on the 21st, must
// advance to the 23rd of NEXT month. Comparing against the payment date (21st)
// would leave this month's 23rd still showing as due in two days, when it has
// just been paid. So markPaid records which occurrence it settled, and that
// date is what is passed here.
const nextOccurrence = (anchorValue, frequency, fromValue, { inclusive = false, after = null } = {}) => {
    const anchor = toUtcDay(anchorValue);
    if (!anchor) return null;
    const from = toUtcDay(fromValue) || todayUtc();
    const settled = toUtcDay(after);

    // The first candidate is the plain answer; `advance` below then steps past
    // anything already settled.
    const advance = (date) => {
        if (!date || !settled || date > settled) return date;
        // At most a handful of steps in practice - `settled` is an occurrence of
        // this same series, so it is one period behind at worst. Bounded anyway,
        // because an unbounded while loop over user data is how a request hangs.
        let out = date;
        for (let i = 0; i < 600 && out && out <= settled; i += 1) {
            out = frequency === "weekly"
                ? new Date(out.getTime() + 7 * DAY_MS)
                : addMonths(out, MONTHS_PER[frequency] || 1);
        }
        return out;
    };

    if (anchor > from) return advance(anchor);
    // A stated due date that has arrived, or passed and does not recur, IS the
    // answer. Recurring stated dates fall through and roll forward below.
    if (inclusive && anchor.getTime() === from.getTime()) return advance(anchor);

    // "Just once" never projects. A one-off in the past stays in the past - it
    // is overdue, and statusFor() says so rather than quietly inventing a next
    // occurrence for a bill that only ever happens once. `advance` is not
    // applied: a settled one-off is finished, and describe() answers "paid"
    // rather than inventing a date it will never come round on again.
    if (frequency === "once") return anchor;

    if (frequency === "weekly") {
        // Exact: a week is always 7 days, so there is nothing to clamp. The
        // floor of 1 is the "after the anchor" rule - without it an anchor dated
        // today would come back as today. An inclusive anchor floors at 0
        // instead, so a stated due date can be today.
        const floor = inclusive ? 0 : 1;
        const weeks = Math.max(floor, Math.ceil((from - anchor) / (7 * DAY_MS)));
        // advance() here too, not just on the monthly path below. Leaving it off
        // meant a paid weekly occurrence came back unchanged - the row still read
        // "due today" after being marked paid. Every return from this function
        // has to go through advance() or the skip silently does nothing.
        return advance(new Date(anchor.getTime() + weeks * 7 * DAY_MS));
    }

    const step = MONTHS_PER[frequency];
    if (!step) return null;

    // Start from the plain month difference, then correct in both directions.
    // Both loops are needed, not one, because clamping can only ever pull a
    // date EARLIER in its month - so the first estimate can land on either side
    // of `from`. Forward while the candidate is still in the past; back while
    // the occurrence before it is also on or after `from`. Each runs once or
    // twice at most.
    //
    // Both bounds floor at ONE period for an expense anchor, never zero - the
    // "after the anchor" rule above, where period zero is the expense already
    // recorded. An inclusive (stated) anchor floors at ZERO, because period zero
    // is the due date the user typed and it has not been paid.
    const floor = inclusive ? 0 : 1;
    const monthsApart =
        (from.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
        (from.getUTCMonth() - anchor.getUTCMonth());
    let periods = Math.max(floor, Math.floor(monthsApart / step));

    while (addMonths(anchor, periods * step) < from) periods += 1;
    while (periods > floor && addMonths(anchor, (periods - 1) * step) >= from) periods -= 1;

    return advance(addMonths(anchor, periods * step));
};

// The reminder lands `leadDays` before the occurrence. Plain day subtraction,
// with no clamping to do: "7 days before 1 March" is 22 February whatever the
// lengths of the months either side.
const reminderDate = (occurrence, leadDays) =>
    occurrence ? new Date(occurrence.getTime() - Number(leadDays) * DAY_MS) : null;

// ------------------------------------------------------------------
// Status
// ------------------------------------------------------------------
// What the Status column says, in the order the checks have to happen:
//
//   off       - the user switched this reminder off. Checked FIRST, because a
//               disabled reminder is not "overdue" or "due today", it is simply
//               not running.
//   sent      - already notified for this occurrence. Nothing sets last_sent_at
//               yet (delivery is in-app for now, by decision), but the column
//               exists and is compared here so adding the email job later does
//               not mean coming back and rewriting this.
//   overdue   - a "just once" bill whose due date has gone past. Only reachable
//               for frequency 'once': everything that recurs is projected
//               forward, so its due date is never behind today. Checked before
//               `sent`, because a bill that was emailed about and then went
//               unpaid is still unpaid, and "Reminded" would read as settled.
//   due       - the remind-on date has arrived and the expense has not come
//               round yet: today is inside the reminder window.
//   scheduled - remind-on is still ahead.
const statusFor = ({ enabled, remindOn, dueOn, lastSentAt, paid, today }) => {
    if (!enabled) return "off";
    // Paid outranks overdue: a one-off settled after its due date is finished,
    // not late, and telling somebody a bill they have paid is overdue is worse
    // than saying nothing.
    if (paid) return "paid";
    const day = today || todayUtc();
    if (dueOn && dueOn < day) return "overdue";
    if (!remindOn) return "scheduled";
    const sent = toUtcDay(lastSentAt);
    if (sent && sent >= remindOn) return "sent";
    return remindOn <= day ? "due" : "scheduled";
};

// ------------------------------------------------------------------
// One row's derived facts
// ------------------------------------------------------------------
// Computed on the server rather than in the page, so there is exactly one
// implementation of these rules. The frontend formats what it is given and does
// no date arithmetic of its own - which is also why a projection can never
// disagree with the status shown beside it.
//
// FOUR DATES CAN BE IN PLAY AND ONLY TWO ARE SHOWN. In precedence order:
//
//   row.due_on       a due date the user TYPED. Wins outright, and counts on the
//                    day itself, because they have not paid it.
//   row.expense_date the date on the expense this reminder hangs off. Projected
//                    forward, and the occurrence on it is treated as done.
//   row.remind_on    a reminder date the user TYPED. Wins over lead_days.
//   row.lead_days    1, 3 or 7. Used only when remind_on is null.
//
// `dueSource` goes back to the page so it can label a stated date differently
// from a projected one - "due 26 Aug" is a fact, "expected 26 Aug" is a guess
// drawn from history, and showing them identically would be dishonest.
const describe = (row, now = new Date()) => {
    const today = todayUtc(now);

    // A stated due date is inclusive; an expense anchor is not. See
    // nextOccurrence for why that distinction is the whole ballgame.
    const stated = Boolean(row.due_on);
    const anchor = stated ? row.due_on : row.expense_date;

    // `paid_for` is the occurrence a payment settled - not the date it was paid.
    // See the comment on nextOccurrence's `after` option for why the difference
    // matters when somebody pays early.
    const paidFor = toUtcDay(row.paid_for);
    const paidOn = toUtcDay(row.paid_on);

    // A ONE-OFF THAT HAS BEEN PAID IS FINISHED, and it stops moving. Its due
    // date stays on the occurrence that was settled, as a record of what
    // happened, rather than being projected to a date it will never come round
    // on again. Handled before the projection because there is nothing to
    // project.
    if (row.frequency === "once" && paidFor) {
        return {
            dueOn: isoUtc(paidFor),
            remindOn: isoUtc(reminderDate(paidFor, row.lead_days)),
            dueSource: stated ? "stated" : "projected",
            paidOn: isoUtc(paidOn),
            daysUntilDue: Math.round((paidFor - today) / DAY_MS),
            daysUntilRemind: null,
            status: statusFor({ enabled: row.enabled, paid: true, today }),
        };
    }

    const dueOn = nextOccurrence(anchor, row.frequency, today, {
        inclusive: stated,
        after: paidFor,
    });

    // An explicit remind_on is used as typed. It is deliberately NOT clamped to
    // be before dueOn: a reminder set after the due date is odd but it is what
    // the user asked for, and silently moving somebody's date is worse than
    // showing it as they set it.
    const remindOn = row.remind_on ? toUtcDay(row.remind_on) : reminderDate(dueOn, row.lead_days);

    return {
        dueOn: isoUtc(dueOn),
        remindOn: isoUtc(remindOn),
        dueSource: stated ? "stated" : "projected",
        // Sent for display only - "last paid 21 Aug" under a recurring row. It
        // deliberately does NOT make the status "paid": a recurring reminder
        // whose occurrence has been settled has already moved on to the next
        // one, and that next one is genuinely scheduled rather than paid.
        paidOn: isoUtc(paidOn),
        // Whole days. Negative only for an overdue one-off, where the count is
        // the point - "3 days late" is the useful reading.
        daysUntilDue: dueOn ? Math.round((dueOn - today) / DAY_MS) : null,
        daysUntilRemind: remindOn ? Math.round((remindOn - today) / DAY_MS) : null,
        status: statusFor({
            enabled: row.enabled,
            remindOn,
            dueOn,
            lastSentAt: row.last_sent_at,
            today,
        }),
    };
};

module.exports = {
    DAY_MS,
    FREQUENCIES,
    LEAD_DAYS,
    RECURRING,
    addMonths,
    describe,
    isoUtc,
    nextOccurrence,
    reminderDate,
    statusFor,
    todayUtc,
    toUtcDay,
};
