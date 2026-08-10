// Calendar-based periods, shared by every admin page.
//
// "Last month" means the previous calendar month ONLY - in August that is
// 1-31 July. A rolling 30-day window would mostly show the present month,
// which is exactly the bug this replaced.
//
// Kept out of PeriodPicker.jsx on purpose: a file that exports a component
// must not also export helpers, or fast refresh stops working.
export const PERIODS = [
    { id: "7d",  label: "Last week" },
    { id: "tm",  label: "This month" },
    { id: "lm",  label: "Last month" },
    { id: "3m",  label: "Last 3 months" },
    { id: "6m",  label: "Last 6 months" },
    { id: "1y",  label: "Last 1 year" },
    { id: "all", label: "All time" },
];

// First day of the month `offset` months from this one (0 = this month,
// -1 = last month). Date handles year rollover.
const monthStart = (offset) => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1).getTime();
};

// Inclusive [from, to] day range, or null for "everything".
export const rangeFor = (id) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    switch (id) {
        case "7d": {
            const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
            return { from: from.getTime(), to: today };
        }
        case "tm": return { from: monthStart(0), to: today };
        case "lm": return { from: monthStart(-1), to: monthStart(0) - 1 };
        case "3m": return { from: monthStart(-2), to: today };
        case "6m": return { from: monthStart(-5), to: today };
        case "1y": return { from: monthStart(-11), to: today };
        default:   return null;
    }
};

// Compare dates as local calendar days, not timestamps: an expense dated today
// at "00:00 UTC" must still count as today in IST.
export const dayKey = (d) => {
    const x = new Date(d);
    return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};

export const inPeriod = (expenses, periodId) => {
    const range = rangeFor(periodId);
    if (!range) return expenses;
    return expenses.filter((e) => {
        const day = dayKey(e.expense_date);
        return day >= range.from && day <= range.to;
    });
};

export const periodLabel = (id) =>
    (PERIODS.find((p) => p.id === id) || PERIODS[PERIODS.length - 1]).label;
