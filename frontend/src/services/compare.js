// Insights compares two periods. Reports shows one period's totals; the whole
// reason Insights exists is the "vs what" - so the page picks a comparison,
// not a period.
//
// Each option yields two inclusive day ranges of the SAME length, so the two
// figures are honestly comparable. "This month" is the exception: it is still
// running, which is why the page also shows a pace figure for it.

const dayStart = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const monthStart = (offset) => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1).getTime();
};
const monthEnd = (offset) => monthStart(offset + 1) - 1;

// Kept short because these render inside the header dropdown, which sits next
// to the Refresh button - the long form ("This month vs last month") was being
// clipped mid-word. The full wording still appears on the cards below.
export const COMPARISONS = [
    { id: "tm", label: "This month vs last" },
    { id: "lm", label: "Last month vs before" },
    { id: "3m", label: "3 months vs previous 3" },
    { id: "1y", label: "12 months vs previous 12" },
];

// The two ranges are called `period` and `prior`, not `current` and `previous`.
// `something.current` is how a React ref is read, and the compiler's lint rule
// treats any `.current` access as one - which made it refuse to memoise the
// whole page. The names are just names; this one had to change.
export const rangesFor = (id) => {
    const today = dayStart(new Date());
    switch (id) {
        case "lm":
            return {
                period: { from: monthStart(-1), to: monthEnd(-1), label: "Last month" },
                prior:  { from: monthStart(-2), to: monthEnd(-2), label: "The month before" },
                running: false,
            };
        case "3m":
            return {
                period: { from: monthStart(-2), to: today,        label: "Last 3 months" },
                prior:  { from: monthStart(-5), to: monthEnd(-3), label: "The 3 before" },
                running: false,
            };
        case "1y":
            return {
                period: { from: monthStart(-11), to: today,         label: "Last 12 months" },
                prior:  { from: monthStart(-23), to: monthEnd(-12), label: "The 12 before" },
                running: false,
            };
        default:
            return {
                period: { from: monthStart(0),  to: today,        label: "This month" },
                prior:  { from: monthStart(-1), to: monthEnd(-1), label: "Last month" },
                running: true,
            };
    }
};

// Days elapsed in a range, inclusive, and days in the current calendar month.
// Both live here rather than in the page because they read the clock, and the
// compiler will not allow an impure call inside a component body.
export const elapsedDays = (range) =>
    Math.max(Math.round((range.to - range.from) / 86400000) + 1, 1);

export const daysThisMonth = () => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
};

// Dates that are almost certainly typing mistakes: in the future, or older
// than the app has plausibly been in use.
export const oddDates = (expenses, staleYears) => {
    const today = Date.now();
    const floor = today - staleYears * 365 * 86400000;
    return expenses.filter((e) => {
        const t = new Date(e.expense_date).getTime();
        return t > today || t < floor;
    });
};

// Compare dates as local calendar days: an expense dated today at "00:00 UTC"
// must still count as today in IST.
const dayKey = (d) => {
    const x = new Date(d);
    return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};

export const within = (expenses, range) =>
    expenses.filter((e) => {
        const day = dayKey(e.expense_date);
        return day >= range.from && day <= range.to;
    });

export const sum = (rows) => rows.reduce((total, e) => total + Number(e.amount), 0);

// How a change reads on screen.
//
// Percentages stop being useful past about tenfold - "9,146% more" looks like a
// broken counter, and a reviewer will read it as a bug rather than as July
// being tiny. Past 10x this switches to a multiplier, which says the same thing
// and survives being read out loud.
export const changeLabel = (now, before) => {
    const a = Number(now) || 0;
    const b = Number(before) || 0;
    if (!a && !b) return { text: "—", tone: "flat" };
    if (!b) return { text: "New", tone: "up" };
    if (!a) return { text: "Stopped", tone: "dn" };

    const ratio = a / b;
    if (ratio >= 10) return { text: `${Math.round(ratio)}× more`, tone: "up" };
    if (ratio <= 0.1) return { text: `${Math.round(b / a)}× less`, tone: "dn" };

    const pct = Math.round((ratio - 1) * 100);
    if (pct === 0) return { text: "Level", tone: "flat" };
    return {
        text: `${pct > 0 ? "▲" : "▼"} ${Math.abs(pct)}%`,
        tone: pct > 0 ? "up" : "dn",
    };
};

export const daysAgo = (date) => {
    if (!date) return null;
    return Math.floor((dayKey(new Date()) - dayKey(date)) / 86400000);
};

// Two category names are "the same" when they differ only by case, spacing,
// punctuation or a trailing plural. Deliberately conservative: this only ever
// says "worth checking", it never merges anything.
export const normaliseCategory = (name) =>
    String(name || "")
        .toLowerCase()
        .replace(/[^a-z0-9]/g, "")
        .replace(/s$/, "");
