export const money = (n) =>
    new Intl.NumberFormat("en-IN", {
        style: "currency",
        currency: "INR",
        maximumFractionDigits: 0,
    }).format(Number(n) || 0);

// Compact form for chart axes and tiles, where the full figure would not fit.
export const moneyShort = (n) => {
    const v = Number(n) || 0;
    if (Math.abs(v) >= 1e7) return `₹${(v / 1e7).toFixed(1)}Cr`;
    if (Math.abs(v) >= 1e5) return `₹${(v / 1e5).toFixed(1)}L`;
    if (Math.abs(v) >= 1e3) return `₹${Math.round(v / 1e3)}k`;
    return `₹${Math.round(v)}`;
};

export const shortDate = (value) => String(value).slice(0, 10);

// "2026-08" -> "Aug 26". Built from the string parts rather than
// new Date(value) so the label cannot slip a month backwards in timezones
// behind UTC, which is what happens when a bare "YYYY-MM" is parsed as UTC
// midnight and then rendered locally.
const MONTH_NAMES = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                     "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export const monthLabel = (ym) => {
    const [year, month] = String(ym).split("-");
    return `${MONTH_NAMES[Number(month) - 1] || "?"} ${String(year).slice(2)}`;
};

// Local calendar month, for the same reason: toISOString() would return the
// UTC month, which is wrong for the first hours of every month in IST.
export const currentMonthKey = () => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
};

export const percent = (part, whole) =>
    Number(whole) > 0 ? Math.round((Number(part) / Number(whole)) * 100) : 0;

// ---------------------------------------------------------------
// Estimated amounts
// ---------------------------------------------------------------
// The admin panel shows rounded figures by default - "~₹1.11 Cr" rather than
// "₹1,10,54,890" - because at a glance nobody reads eleven digits. Indian
// grouping: Cr = 10,000,000 and L = 100,000.
//
// The trade-off is real and worth knowing: rounded rows do not add up to the
// rounded total. Settings -> Display -> "Show estimated amounts" turns this
// off app-wide and every figure becomes exact, which is the honest way to
// resolve it rather than picking a side in code.
export const moneyApprox = (n) => {
    const v = Number(n) || 0;
    const a = Math.abs(v);
    const sign = v < 0 ? "-" : "";
    if (a === 0) return "₹0";
    if (a >= 1e7) return `${sign}~₹${trimZero(v / 1e7)} Cr`;
    if (a >= 1e5) return `${sign}~₹${trimZero(v / 1e5)} L`;
    if (a >= 1e3) return `${sign}~₹${trimZero(v / 1e3)} K`;
    return `${sign}₹${Math.round(a)}`;
};

// 1.10 -> "1.1", 60.0 -> "60", 1.11 -> "1.11". Two decimals at most, and no
// trailing zeros, so the figure stays short without losing a real digit.
const trimZero = (n) => {
    const rounded = Math.abs(n) >= 100 ? Math.round(n) : Number(n.toFixed(2));
    return String(rounded);
};

// Share of a total, as a display string. Whole numbers above 1%, one decimal
// below it: with one dominant spender everybody else rounds to a flat "0%",
// which reads as a bug when they have real money on the same row.
export const shareLabel = (part, whole) => {
    const total = Number(whole);
    const value = Number(part);
    if (!total || !value) return "0%";
    const pct = (value / total) * 100;
    if (pct >= 1) return `${Math.round(pct)}%`;
    if (pct >= 0.1) return `${pct.toFixed(1)}%`;
    return "<0.1%";
};
