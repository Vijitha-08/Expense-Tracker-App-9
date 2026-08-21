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

const FREQUENCIES = ["weekly", "monthly", "quarterly", "yearly"];

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
const nextOccurrence = (anchorValue, frequency, fromValue) => {
    const anchor = toUtcDay(anchorValue);
    if (!anchor) return null;
    const from = toUtcDay(fromValue) || todayUtc();
    if (anchor > from) return anchor;

    if (frequency === "weekly") {
        // Exact: a week is always 7 days, so there is nothing to clamp. The
        // floor of 1 is the "after the anchor" rule - without it an anchor dated
        // today would come back as today.
        const weeks = Math.max(1, Math.ceil((from - anchor) / (7 * DAY_MS)));
        return new Date(anchor.getTime() + weeks * 7 * DAY_MS);
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
    // Both bounds floor at ONE period, never zero - the "after the anchor" rule
    // above. Period zero is the anchor itself, which is the expense already
    // recorded.
    const monthsApart =
        (from.getUTCFullYear() - anchor.getUTCFullYear()) * 12 +
        (from.getUTCMonth() - anchor.getUTCMonth());
    let periods = Math.max(1, Math.floor(monthsApart / step));

    while (addMonths(anchor, periods * step) < from) periods += 1;
    while (periods > 1 && addMonths(anchor, (periods - 1) * step) >= from) periods -= 1;

    return addMonths(anchor, periods * step);
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
//   due       - the remind-on date has arrived and the expense has not come
//               round yet: today is inside the reminder window.
//   scheduled - remind-on is still ahead.
const statusFor = ({ enabled, remindOn, lastSentAt, today }) => {
    if (!enabled) return "off";
    const day = today || todayUtc();
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
const describe = (row, now = new Date()) => {
    const today = todayUtc(now);
    const dueOn = nextOccurrence(row.expense_date, row.frequency, today);
    const remindOn = reminderDate(dueOn, row.lead_days);

    return {
        dueOn: isoUtc(dueOn),
        remindOn: isoUtc(remindOn),
        // Whole days, and never negative: dueOn is >= today by construction and
        // remindOn is at most `lead_days` behind it.
        daysUntilDue: dueOn ? Math.round((dueOn - today) / DAY_MS) : null,
        daysUntilRemind: remindOn ? Math.round((remindOn - today) / DAY_MS) : null,
        status: statusFor({
            enabled: row.enabled,
            remindOn,
            lastSentAt: row.last_sent_at,
            today,
        }),
    };
};

module.exports = {
    DAY_MS,
    FREQUENCIES,
    LEAD_DAYS,
    addMonths,
    describe,
    isoUtc,
    nextOccurrence,
    reminderDate,
    statusFor,
    todayUtc,
    toUtcDay,
};
