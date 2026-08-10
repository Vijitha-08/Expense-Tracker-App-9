import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiPrinter, FiAlertCircle } from "react-icons/fi";
import AdminLayout from "../components/AdminLayout";
import PeriodPicker from "../components/PeriodPicker";
import { inPeriod, periodLabel } from "../services/period";
import { MonthBars, CategoryDonut } from "../components/AdminCharts";
import { useDisplay } from "../context/useDisplay";
import { shareLabel } from "../services/format";
import * as admin from "../services/adminService";

// Design B, organisation-wide.
//
// This page used to be a per-person drill-down: pick somebody on the left, see
// their detail on the right. The reviewer replaced that with "Reports ante
// entire motham gurinchi undali" - Reports means the whole total. So the page
// is now four figures, two charts, and two full tables: every person, and every
// category. Nothing here is about one person at a time.
//
// Per-person detail still exists on the Users page, and GET /admin/people/:id
// is still live and tested, so the old view can come back without new backend
// work if the brief moves again.

// A share bar never renders as literally nothing when there is money in the
// row - 1.5% minimum, so a small spender is still visible next to a huge one.
const barWidth = (part, whole) => {
    if (!Number(whole) || !Number(part)) return 0;
    return Math.max((Number(part) / Number(whole)) * 100, 1.5);
};

const initials = (name) =>
    String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Months a set of expenses spans, at least 1, so "approx per month" never
// divides by zero and a single expense reads as that expense.
const monthsSpanned = (rows) => {
    if (rows.length === 0) return 1;
    const times = rows.map((e) => new Date(e.expense_date));
    const first = new Date(Math.min(...times));
    const last = new Date(Math.max(...times));
    const months =
        (last.getFullYear() - first.getFullYear()) * 12 +
        (last.getMonth() - first.getMonth()) + 1;
    return Math.max(months, 1);
};

const AdminReports = () => {
    const display = useDisplay();
    const [period, setPeriod] = useState(display.defaultPeriod);
    const [state, setState] = useState({
        people: [], expenses: [], months: [], counts: {}, error: "", loading: true,
    });
    const alive = useRef(true);

    const load = useCallback(
        () =>
            Promise.all([
                admin.getPeople(),
                admin.getAllExpenses({ limit: 500 }),
                admin.getOverview(),
            ])
                .then(([{ people, counts }, expenses, overview]) => {
                    if (alive.current) {
                        setState({
                            people, expenses, counts,
                            months: overview.months ?? [],
                            error: "", loading: false,
                        });
                    }
                })
                .catch((err) => {
                    if (alive.current) setState((p) => ({ ...p, error: err.message, loading: false }));
                }),
        []
    );

    useEffect(() => {
        alive.current = true;
        load();
        return () => { alive.current = false; };
    }, [load]);

    const { people, expenses, months, counts, error, loading } = state;

    // Everything below is derived from the expenses inside the chosen period,
    // not from the API totals - otherwise the tables would ignore the dropdown.
    const scoped = useMemo(() => inPeriod(expenses, period), [expenses, period]);
    const gross = scoped.reduce((sum, e) => sum + Number(e.amount), 0);

    const users = useMemo(() => people.filter((p) => p.role === "user"), [people]);

    // One pass over the period's expenses, grouped by person and by category.
    const { byPerson, byCategory } = useMemo(() => {
        const persons = new Map();
        const cats = new Map();

        scoped.forEach((e) => {
            const amount = Number(e.amount);

            const p = persons.get(e.user_id) || {
                id: e.user_id, name: e.owner_name, rows: [], total: 0, largest: 0,
                categories: new Map(),
            };
            p.rows.push(e);
            p.total += amount;
            p.largest = Math.max(p.largest, amount);
            p.categories.set(e.category, (p.categories.get(e.category) || 0) + amount);
            persons.set(e.user_id, p);

            const c = cats.get(e.category) || { category: e.category, count: 0, total: 0, who: new Set() };
            c.count += 1;
            c.total += amount;
            c.who.add(e.owner_name);
            cats.set(e.category, c);
        });

        // Every user appears, including those who recorded nothing in this
        // period - a report that silently drops people is a worse report.
        const rows = users.map((u) => {
            const p = persons.get(u.id);
            if (!p) {
                return { ...u, entries: 0, total: 0, largest: 0, perMonth: 0, topCategory: null };
            }
            const topCategory = [...p.categories.entries()]
                .sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
            return {
                ...u,
                entries: p.rows.length,
                total: p.total,
                largest: p.largest,
                perMonth: p.total / monthsSpanned(p.rows),
                topCategory,
            };
        }).sort((a, b) => b.total - a.total);

        return {
            byPerson: rows,
            byCategory: [...cats.values()].sort((a, b) => b.total - a.total),
        };
    }, [scoped, users]);

    const activeCount = byPerson.filter((p) => p.entries > 0).length;
    const silent = byPerson.length - activeCount;
    const topCategory = byCategory[0] ?? null;
    const averagePerPerson = activeCount ? gross / activeCount : 0;

    const totalEntries = byPerson.reduce((sum, p) => sum + p.entries, 0);
    const biggestSingle = byPerson.reduce((best, p) => Math.max(best, p.largest), 0);

    return (
        <AdminLayout
            title="Reports"
            subtitle="Everyone's spending in one place — totals, people and categories."
            counts={{ users: counts.total, expenses: expenses.length }}
            actions={
                <>
                    <PeriodPicker value={period} onChange={setPeriod} />
                    <button type="button" className="adm-btn" onClick={admin.downloadExpensesCsv}>
                        <FiDownload aria-hidden="true" /> Export CSV
                    </button>
                    <button type="button" className="adm-btn adm-btn-primary" onClick={() => window.print()}>
                        <FiPrinter aria-hidden="true" /> Print
                    </button>
                </>
            }
        >
            {error && (
                <div className="adm-alert" role="alert">
                    <FiAlertCircle aria-hidden="true" /> {error}
                </div>
            )}

            <div className="adm-grid-4">
                <div className="adm-kpi adm-kpi-lead">
                    <div className="adm-kpi-lab">Gross amount</div>
                    <div className="adm-kpi-val">{display.amount(gross)}</div>
                    <div className="adm-kpi-sub">
                        {scoped.length} {scoped.length === 1 ? "expense" : "expenses"},{" "}
                        {periodLabel(period).toLowerCase()}
                    </div>
                </div>
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">People spending</div>
                    <div className="adm-kpi-val">{activeCount} of {byPerson.length}</div>
                    <div className="adm-kpi-sub">
                        {silent === 0
                            ? "Everyone recorded something"
                            : `${silent} ${silent === 1 ? "account" : "accounts"} recorded nothing`}
                    </div>
                </div>
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">Max spend on</div>
                    <div className="adm-kpi-val adm-kpi-val-sm">
                        {topCategory ? topCategory.category : "—"}
                    </div>
                    <div className="adm-kpi-sub">
                        {topCategory
                            ? `${display.amount(topCategory.total)} · ${shareLabel(topCategory.total, gross)} of gross`
                            : "No expenses yet"}
                    </div>
                </div>
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">Average per person</div>
                    <div className="adm-kpi-val">{display.amount(averagePerPerson)}</div>
                    <div className="adm-kpi-sub">across those spending</div>
                </div>
            </div>

            <div className="adm-grid-32">
                <div className="adm-panel">
                    <div className="adm-panel-head">
                        <h3>Spend over time</h3>
                        <span className="adm-hint">Whole organisation · last 6 months</span>
                    </div>
                    <MonthBars months={months} format={display.amount} />
                </div>
                <CategoryDonut
                    categories={byCategory}
                    format={display.amount}
                    title="Spend by category"
                    centreLabel="Gross"
                />
            </div>

            <div className="adm-panel">
                <div className="adm-panel-head">
                    <h3>Every person</h3>
                    <span className="adm-hint">
                        All {byPerson.length} {byPerson.length === 1 ? "user" : "users"} · highest spend first
                    </span>
                </div>

                {loading ? (
                    <p className="adm-empty">Loading...</p>
                ) : byPerson.length === 0 ? (
                    <p className="adm-empty">No user accounts yet.</p>
                ) : (
                    <table className="adm-table">
                        <thead>
                            <tr>
                                <th>Person</th>
                                <th className="adm-right">Expenses</th>
                                <th className="adm-right">Approx / month</th>
                                <th className="adm-right">Largest one</th>
                                <th>Biggest category</th>
                                <th className="adm-right">Total spend</th>
                                <th className="adm-share-col">Share of gross</th>
                            </tr>
                        </thead>
                        <tbody>
                            {byPerson.map((p) => (
                                <tr key={p.id}>
                                    <td>
                                        <span className="adm-who">
                                            <span className="adm-pip">{initials(p.name)}</span>
                                            <b>{p.name}</b>
                                        </span>
                                    </td>
                                    <td className={`adm-right adm-mono${p.entries === 0 ? " adm-zero" : ""}`}>
                                        {p.entries}
                                    </td>
                                    <td className={`adm-right adm-mono${p.entries === 0 ? " adm-zero" : ""}`}>
                                        {p.entries === 0 ? "—" : display.amount(p.perMonth)}
                                    </td>
                                    <td className={`adm-right adm-mono${p.entries === 0 ? " adm-zero" : ""}`}>
                                        {p.entries === 0 ? "—" : display.amount(p.largest)}
                                    </td>
                                    <td>
                                        {p.topCategory
                                            ? <span className="adm-tag">{p.topCategory}</span>
                                            : <span className="adm-zero">—</span>}
                                    </td>
                                    <td className={`adm-right adm-mono${p.entries === 0 ? " adm-zero" : ""}`}>
                                        {display.amount(p.total)}
                                    </td>
                                    <td>
                                        <span className="adm-share">
                                            <span className="adm-meter">
                                                <i style={{ width: `${barWidth(p.total, gross)}%` }} />
                                            </span>
                                            <b>{shareLabel(p.total, gross)}</b>
                                        </span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td>Total</td>
                                <td className="adm-right adm-mono">{totalEntries}</td>
                                <td className="adm-right adm-mono">—</td>
                                <td className="adm-right adm-mono">{display.amount(biggestSingle)}</td>
                                <td>{topCategory ? topCategory.category : "—"}</td>
                                <td className="adm-right adm-mono">{display.amount(gross)}</td>
                                <td />
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>

            <div className="adm-panel">
                <div className="adm-panel-head">
                    <h3>Every category</h3>
                    <span className="adm-hint">Across everyone · {periodLabel(period).toLowerCase()}</span>
                </div>

                {byCategory.length === 0 ? (
                    <p className="adm-empty">Nothing recorded in {periodLabel(period).toLowerCase()}.</p>
                ) : (
                    <table className="adm-table">
                        <thead>
                            <tr>
                                <th>Category</th>
                                <th className="adm-right">Entries</th>
                                <th>Who spends on it</th>
                                <th className="adm-right">Total</th>
                                <th className="adm-share-col">Share of gross</th>
                            </tr>
                        </thead>
                        <tbody>
                            {byCategory.map((c) => {
                                const who = [...c.who];
                                return (
                                    <tr key={c.category}>
                                        <td><b>{c.category}</b></td>
                                        <td className="adm-right adm-mono">{c.count}</td>
                                        <td className="adm-dim">
                                            {who.slice(0, 2).join(", ")}
                                            {who.length > 2 && ` +${who.length - 2} more`}
                                        </td>
                                        <td className="adm-right adm-mono">{display.amount(c.total)}</td>
                                        <td>
                                            <span className="adm-share">
                                                <span className="adm-meter">
                                                    <i style={{ width: `${barWidth(c.total, gross)}%` }} />
                                                </span>
                                                <b>{shareLabel(c.total, gross)}</b>
                                            </span>
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                        <tfoot>
                            <tr>
                                <td>Total — {byCategory.length} {byCategory.length === 1 ? "category" : "categories"}</td>
                                <td className="adm-right adm-mono">{scoped.length}</td>
                                <td />
                                <td className="adm-right adm-mono">{display.amount(gross)}</td>
                                <td />
                            </tr>
                        </tfoot>
                    </table>
                )}
            </div>
        </AdminLayout>
    );
};

export default AdminReports;
