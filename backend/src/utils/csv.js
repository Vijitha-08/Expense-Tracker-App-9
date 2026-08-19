// Helpers for building CSV exports: cell quoting, row joining, and the one date
// format a spreadsheet will actually parse.
//
// This lived as a private helper inside adminController.js. The user-facing
// export needs the identical rule, and a copy in a second controller would mean
// two places to fix the same quoting bug - the one thing this function exists to
// get right. `src/utils/` was already in the tree and empty; this is what it is
// for.
//
// Built by hand rather than with a library: quoting is the only real rule, and
// seven columns do not justify a dependency.
//
// A cell is quoted only when it has to be - a comma, a double quote or a newline
// in the value - and an embedded quote is doubled, which is what RFC 4180 asks
// for and what Excel and Sheets both read back correctly.
const csvCell = (value) => {
    const s = value === null || value === undefined ? "" : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// Rows joined with CRLF, again per RFC 4180: a bare \n is fine in most tools but
// Excel on Windows is the one that notices.
const toCsv = (header, rows) =>
    [header, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n");

// A pg DATE column arrives as a JavaScript Date, and the existing exports wrote
// `String(e.expense_date).slice(0, 10)` - which on a Date gives "Mon Aug 17".
// That is not a date any spreadsheet parses, and it silently drops the year.
//
// Built from LOCAL parts, not toISOString(): pg hands back the date at local
// midnight, so in any timezone behind UTC toISOString() rolls it to the previous
// day. The same trap is called out in ExpenseForm.jsx's today() and in
// format.js's prettyDate, for the same reason.
const isoDay = (value) => {
    if (value === null || value === undefined) return "";
    if (value instanceof Date) {
        return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
    }
    // Already a string from the driver or a plain "YYYY-MM-DD": take the day part.
    return String(value).slice(0, 10);
};

module.exports = { csvCell, toCsv, isoDay };
