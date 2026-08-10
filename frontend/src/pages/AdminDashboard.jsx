import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiRefreshCw, FiAlertCircle, FiInfo } from "react-icons/fi";
import AdminLayout from "../components/AdminLayout";
import UserPanel from "../components/UserPanel";
import PeriodPicker from "../components/PeriodPicker";
import { inPeriod, periodLabel } from "../services/period";
import { MonthBars, TopSpenders } from "../components/AdminCharts";
import { useDisplay } from "../context/useDisplay";
import { currentMonthKey, percent } from "../services/format";
import * as admin from "../services/adminService";

// Deliberately lean: three headline figures, the counts strip, one chart, the
// top spenders and the user list. Every detailed breakdown moved to Insights
// and Reports, with a pointer at the bottom so nobody hunts for it.
const AdminDashboard = () => {
    const display = useDisplay();
    const [period, setPeriod] = useState(display.defaultPeriod);
    const [state, setState] = useState({ data: null, error: "", loading: true });
    const alive = useRef(true);

    const load = useCallback(
        () =>
            Promise.all([admin.getOverview(), admin.getPeople(), admin.getAllExpenses({ limit: 500 })])
                .then(([overview, people, expenses]) => {
                    if (alive.current) {
                        setState({ data: { overview, people, expenses }, error: "", loading: false });
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

    const { data, error, loading } = state;

    const expenses = useMemo(() => data?.expenses ?? [], [data]);
    const counts = data?.overview?.userCounts ?? {};
    const categories = data?.overview?.categories ?? [];
    const months = data?.overview?.months ?? [];
    const people = data?.people?.people ?? [];

    // The period filter applies to the money figures. It is done client-side
    // because every expense is already loaded for the table anyway, so a
    // second round trip per period change would be wasted.
    const scoped = useMemo(() => inPeriod(expenses, period), [expenses, period]);
    const grossInPeriod = scoped.reduce((sum, e) => sum + Number(e.amount), 0);

    const thisMonthKey = currentMonthKey();
    const thisMonth = months.find((m) => m.month === thisMonthKey);
    const lastMonth = months.find((m) => m.month !== thisMonthKey);

    const trendNote = useMemo(() => {
        if (!thisMonth || !lastMonth || !lastMonth.total) return "Compared to last month";
        const delta = percent(thisMonth.total - lastMonth.total, lastMonth.total);
        if (delta === 0) return "Level with last month";
        return delta > 0
            ? <><b>▲ {delta}%</b> more than last month</>
            : <><b className="adm-down">▼ {Math.abs(delta)}%</b> less than last month</>;
    }, [thisMonth, lastMonth]);

    const topCategory = categories[0];
    const grossTotal = data?.overview?.summary?.total_amount ?? 0;

    if (loading) {
        return (
            <AdminLayout title="Dashboard" subtitle="Loading the figures...">
                <p className="adm-empty">Loading...</p>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title="Dashboard"
            subtitle="The numbers that matter, at a glance."
            counts={{ users: counts.total, expenses: expenses.length }}
            actions={
                <>
                    <PeriodPicker value={period} onChange={setPeriod} />
                    <button type="button" className="adm-btn" onClick={load}>
                        <FiRefreshCw aria-hidden="true" /> Refresh
                    </button>
                </>
            }
        >
            {error && (
                <div className="adm-alert" role="alert">
                    <FiAlertCircle aria-hidden="true" /> {error}
                </div>
            )}

            <div className="adm-grid-3">
                <div className="adm-kpi adm-kpi-lead">
                    <div className="adm-kpi-lab">Gross amount</div>
                    <div className="adm-kpi-val">{display.amount(grossInPeriod)}</div>
                    <div className="adm-kpi-sub">
                        {scoped.length} {scoped.length === 1 ? "expense" : "expenses"}
                        {period === "all" ? ", all time" : ` in ${periodLabel(period).toLowerCase()}`}
                    </div>
                </div>
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">This month</div>
                    <div className="adm-kpi-val">{display.amount(thisMonth?.total || 0)}</div>
                    <div className="adm-kpi-sub">{trendNote}</div>
                </div>
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">Biggest category</div>
                    <div className="adm-kpi-val adm-kpi-val-sm">
                        {topCategory ? topCategory.category : "—"}
                    </div>
                    <div className="adm-kpi-sub">
                        {topCategory
                            ? `${display.amount(topCategory.total)} · ${percent(topCategory.total, grossTotal)}% of gross`
                            : "No expenses yet"}
                    </div>
                </div>
            </div>

            <UserPanel counts={counts} />

            <div className="adm-grid-32">
                <div className="adm-panel">
                    <div className="adm-panel-head">
                        <h3>Spend over time</h3><span className="adm-hint">Last 6 months</span>
                    </div>
                    <MonthBars months={months} format={display.amount} />
                </div>

                <div>
                    <TopSpenders people={people} format={display.amount} />
                    <p className="adm-note">
                        <FiInfo aria-hidden="true" />
                        Charts live in <Link to="/admin/insights"><b>Insights</b></Link>
                        {" · per person in "}
                        <Link to="/admin/reports"><b>Reports</b></Link>
                    </p>
                </div>
            </div>

            <div className="adm-panel">
                <div className="adm-panel-head">
                    <h3>Users</h3>
                    <span className="adm-hint">
                        {counts.total} {counts.total === 1 ? "account" : "accounts"} · newest first ·
                        {" "}open <Link to="/admin/users"><b>Users</b></Link> to manage
                    </span>
                </div>
                {people.length === 0 ? (
                    <p className="adm-empty">No accounts yet.</p>
                ) : (
                    [...people]
                        .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
                        .map((p) => (
                            <div className="adm-urow-static" key={p.id}>
                                <span className={`adm-pip${p.role === "admin" ? " adm-pip-accent" : ""}`}>
                                    {initials(p.name)}
                                </span>
                                <span className="adm-urow-name">
                                    {p.name}
                                    <small>joined {display.date(p.created_at)}</small>
                                </span>
                                <span className={`adm-role adm-role-${roleTag(p)}`}>{roleLabel(p)}</span>
                                <span className={`adm-urow-amt${p.count === 0 ? " adm-zero" : ""}`}>
                                    {p.role === "admin" ? "—" : display.amount(p.total)}
                                    <small>
                                        {p.role === "admin"
                                            ? "oversees only"
                                            : `${p.count} ${p.count === 1 ? "expense" : "expenses"}`}
                                    </small>
                                </span>
                            </div>
                        ))
                )}
            </div>
        </AdminLayout>
    );
};

const initials = (name) =>
    String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Accounts created in the last 30 days read as "New" so the reviewer can see
// at a glance who has just joined, which is what "new users" is counting.
const isNew = (p) =>
    (Date.now() - new Date(p.created_at).getTime()) / 86400000 <= 30;

const roleTag = (p) => (p.role === "admin" ? "admin" : isNew(p) ? "new" : "user");
const roleLabel = (p) => (p.role === "admin" ? "Administrator" : isNew(p) ? "New" : "User");

export default AdminDashboard;
