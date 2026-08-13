import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    FiPlus, FiCreditCard, FiCalendar, FiAlertCircle, FiBarChart2, FiTrendingUp,
} from "react-icons/fi";
import DashboardLayout from "../Layouts/DashboardLayout";
import StatCards from "../components/StatCards";
import MonthlyTrend from "../components/MonthlyTrend";
import CategoryDonut from "../components/CategoryDonut";
import ExpenseTable from "../components/ExpenseTable";
import ExpenseDrawer from "../components/ExpenseDrawer";
import { useAuth } from "../context/useAuth";
import { money, currentMonthKey, percent, movementWords } from "../services/format";
import * as svc from "../services/expenseService";

const loadAll = () =>
    Promise.all([svc.getExpenses({ limit: 500 }), svc.getSummary()])
        .then(([expenses, summary]) => ({ expenses, summary }));

const firstName = (name) => String(name || "there").trim().split(/\s+/)[0];

// Calendar-based periods, not rolling day-counts. "Last month" means the
// previous calendar month ONLY (in August that is July 1-31) - a 30-day
// rolling window would mostly show the present month, which is exactly the
// bug this replaced. Multi-month ranges start on the 1st of the earliest
// month and run to today, so "Last 3 months" in August means Jun + Jul + Aug.
const PERIODS = [
    { id: "7d",  label: "Last week" },
    { id: "tm",  label: "This month" },
    { id: "lm",  label: "Last month" },
    { id: "3m",  label: "Last 3 months" },
    { id: "6m",  label: "Last 6 months" },
    { id: "1y",  label: "Last 1 year" },
    { id: "all", label: "Total" },
];

// Compare dates as local calendar days, not timestamps: an expense dated
// today at "00:00 UTC" must still count as today in IST.
const dayKey = (d) => {
    const x = new Date(d);
    return new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
};

// First day of the month `offset` months from the current one (0 = this
// month, -1 = last month...). Date handles year rollover for us.
const monthStart = (offset) => {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + offset, 1).getTime();
};

// Inclusive [from, to] day range for a period, or null for "everything".
const rangeFor = (id) => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    switch (id) {
        case "7d": {
            const from = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 6);
            return { from: from.getTime(), to: today };
        }
        case "tm": return { from: monthStart(0), to: today };
        // Previous calendar month only: from its 1st up to (not including)
        // this month's 1st.
        case "lm": return { from: monthStart(-1), to: monthStart(0) - 1 };
        case "3m": return { from: monthStart(-2), to: today };
        case "6m": return { from: monthStart(-5), to: today };
        case "1y": return { from: monthStart(-11), to: today };
        default:   return null;
    }
};

const UserDashboard = () => {
    const { user } = useAuth();
    const [state, setState] = useState({ data: null, error: "", loading: true });
    const alive = useRef(true);

    // Every setState happens inside a promise callback rather than synchronously
    // in the effect body, so React is never asked to re-render mid-effect.
    const reload = useCallback(
        () =>
            loadAll()
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

    const setError = (error) => setState((prev) => ({ ...prev, error }));
    const { data, error, loading } = state;

    const [drawerOpen, setDrawerOpen] = useState(false);
    const [editing, setEditing] = useState(null);
    const [categoryFilter, setCategoryFilter] = useState("All");
    const [period, setPeriod] = useState("all");

    // Memoised so the `?? []` fallback is a stable reference - without this,
    // every render creates a fresh empty array and the period useMemo below
    // recomputes (and re-triggers) on every render.
    const expenses = useMemo(() => data?.expenses ?? [], [data]);
    const totals = data?.summary?.summary;
    const categories = data?.summary?.categories ?? [];
    const months = data?.summary?.months ?? [];

    const openNew = () => { setEditing(null); setDrawerOpen(true); };
    const openEdit = (row) => { setEditing(row); setDrawerOpen(true); };
    const closeDrawer = () => { setDrawerOpen(false); setEditing(null); };

    const handleSubmit = async (payload) => {
        if (editing) await svc.updateExpense(editing.id, payload);
        else await svc.createExpense(payload);
        closeDrawer();
        await reload();
    };

    const handleDelete = async (row) => {
        try {
            await svc.deleteExpense(row.id);
            await reload();
        } catch (err) {
            setError(err.message);
        }
    };

    const thisMonthKey = currentMonthKey();
    const thisMonth = months.find((m) => m.month === thisMonthKey);
    const lastMonth = months.find((m) => m.month !== thisMonthKey);

    // Month-on-month movement, phrased in plain words. Only shown when there is
    // a previous month to compare against - "up 100%" from nothing is noise.
    const trendNote = useMemo(() => {
        if (!thisMonth || !lastMonth) return "Compared to last month";
        return movementWords(thisMonth.total, lastMonth.total);
    }, [thisMonth, lastMonth]);

    const topCategory = categories[0];

    // Period first, category second - both filters apply to the table, and the
    // period total reflects the period alone so the figure matches its label.
    const activePeriod = PERIODS.find((p) => p.id === period) || PERIODS[PERIODS.length - 1];
    const inPeriod = useMemo(() => {
        const range = rangeFor(activePeriod.id);
        if (!range) return expenses;
        return expenses.filter((e) => {
            const day = dayKey(e.expense_date);
            return day >= range.from && day <= range.to;
        });
    }, [expenses, activePeriod]);

    const periodTotal = inPeriod.reduce((sum, e) => sum + Number(e.amount), 0);

    const visible =
        categoryFilter === "All"
            ? inPeriod
            : inPeriod.filter((e) => e.category === categoryFilter);

    const usedCategories = ["All", ...categories.map((c) => c.category)];

    return (
        <DashboardLayout
            title={`Hi ${firstName(user?.name)}`}
            subtitle="Track what you spend. Every figure here is exact, to the rupee."
            actions={
                <button className="btn btn-primary btn-lg" onClick={openNew}>
                    <FiPlus aria-hidden="true" /> New expense
                </button>
            }
        >
            {error && (
                <div className="alert alert-error" role="alert">
                    <FiAlertCircle aria-hidden="true" /> {error}
                </div>
            )}

            {totals && (
                <StatCards
                    items={[
                        {
                            label: "This month",
                            value: money(thisMonth?.total || 0),
                            sub: trendNote,
                            Icon: FiCalendar,
                            tone: "accent",
                        },
                        {
                            label: "Total spent",
                            value: money(totals.total_amount),
                            sub: `${totals.total_count} ${
                                totals.total_count === 1 ? "entry" : "entries"
                            } all time`,
                            Icon: FiCreditCard,
                        },
                        {
                            label: "Average entry",
                            value: money(totals.average_amount),
                            sub: `Largest ${money(totals.largest_amount)}`,
                            Icon: FiBarChart2,
                        },
                        {
                            label: "Top category",
                            value: topCategory ? topCategory.category : "—",
                            sub: topCategory
                                ? `${money(topCategory.total)} · ${percent(
                                      topCategory.total,
                                      totals.total_amount
                                  )}% of your spend`
                                : "Add an expense to find out",
                            Icon: FiTrendingUp,
                            tone: "ok",
                        },
                    ]}
                />
            )}

            <div className="grid-2">
                <MonthlyTrend months={months} title="Your spend over time" />
                <CategoryDonut categories={categories} title="Where your money goes" />
            </div>

            <section className="panel">
                {/* Option 1 (confirmed): two compact dropdowns instead of two
                    rows of buttons. Dropdowns stay one line tall no matter how
                    many typed categories accumulate. */}
                <div className="panel-head">
                    <h3>Your expenses</h3>

                    <div className="table-controls">
                        <label className="select-inline">
                            Period
                            <select value={period} onChange={(e) => setPeriod(e.target.value)}>
                                {PERIODS.map((p) => (
                                    <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                            </select>
                        </label>

                        <label className="select-inline">
                            Category
                            <select value={categoryFilter}
                                    onChange={(e) => setCategoryFilter(e.target.value)}>
                                {usedCategories.map((c) => (
                                    <option key={c} value={c}>
                                        {c === "All" ? "All categories" : c}
                                    </option>
                                ))}
                            </select>
                        </label>

                        <span className="period-note" aria-live="polite">
                            <strong>{activePeriod.label}:</strong> {money(periodTotal)} ·{" "}
                            {inPeriod.length} {inPeriod.length === 1 ? "entry" : "entries"}
                        </span>
                    </div>
                </div>

                {loading ? (
                    <div className="empty-state">Loading...</div>
                ) : (
                    <ExpenseTable
                        expenses={visible}
                        onEdit={openEdit}
                        onDelete={handleDelete}
                        emptyText={
                            expenses.length === 0
                                ? "No expenses yet. Use New expense to add your first one."
                                : `Nothing in ${activePeriod.label.toLowerCase()}${
                                      categoryFilter === "All" ? "" : ` under ${categoryFilter}`
                                  }.`
                        }
                    />
                )}
            </section>

            <ExpenseDrawer
                open={drawerOpen}
                onClose={closeDrawer}
                editing={editing}
                onSubmit={handleSubmit}
            />
        </DashboardLayout>
    );
};

export default UserDashboard;
