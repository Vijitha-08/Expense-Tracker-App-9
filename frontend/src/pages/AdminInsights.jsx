import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { FiRefreshCw, FiAlertCircle, FiInfo } from "react-icons/fi";
import AdminLayout from "../components/AdminLayout";
import PeriodPicker from "../components/PeriodPicker";
import { inPeriod, periodLabel } from "../services/period";
import { MonthBars, CategoryDonut, CategoryRanking, TopSpenders } from "../components/AdminCharts";
import { useDisplay } from "../context/useDisplay";
import { currentMonthKey, monthLabel, percent } from "../services/format";
import * as admin from "../services/adminService";

// Organisation-wide only. Anything about ONE person lives in Reports - that
// split is the whole reason both pages exist rather than one, and the note at
// the bottom says so on screen so nobody goes looking here for a drill-down.
const AdminInsights = () => {
    const display = useDisplay();
    const [period, setPeriod] = useState(display.defaultPeriod);
    const [state, setState] = useState({ data: null, error: "", loading: true });
    const alive = useRef(true);

    const load = useCallback(
        () =>
            Promise.all([admin.getOverview(), admin.getAllExpenses({ limit: 500 })])
                .then(([overview, expenses]) => {
                    if (alive.current) setState({ data: { overview, expenses }, error: "", loading: false });
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
    const months = data?.overview?.months ?? [];
    const people = data?.overview?.people ?? [];
    const counts = data?.overview?.userCounts ?? {};

    // Categories are recomputed from the filtered expenses rather than taken
    // from the API, so the donut actually responds to the period dropdown.
    const scoped = useMemo(() => inPeriod(expenses, period), [expenses, period]);

    const categories = useMemo(() => {
        const byName = new Map();
        scoped.forEach((e) => {
            const key = e.category || "Other";
            byName.set(key, (byName.get(key) || 0) + Number(e.amount));
        });
        return [...byName.entries()]
            .map(([category, total]) => ({ category, total }))
            .sort((a, b) => b.total - a.total);
    }, [scoped]);

    const gross = scoped.reduce((sum, e) => sum + Number(e.amount), 0);

    const thisMonth = months.find((m) => m.month === currentMonthKey());
    const lastMonth = months.find((m) => m.month !== currentMonthKey());
    const monthlyAverage = months.length
        ? months.reduce((sum, m) => sum + Number(m.total), 0) / months.length
        : 0;
    const busiest = months.reduce(
        (best, m) => (!best || Number(m.count) > Number(best.count) ? m : best),
        null
    );

    const delta =
        thisMonth && lastMonth && Number(lastMonth.total) > 0
            ? percent(thisMonth.total - lastMonth.total, lastMonth.total)
            : null;

    if (loading) {
        return (
            <AdminLayout title="Insights" subtitle="Loading the charts...">
                <p className="adm-empty">Loading...</p>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title="Insights"
            subtitle="How the whole organisation is spending, over time and by category."
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

            <div className="adm-panel">
                <div className="adm-panel-head">
                    <h3>Spend over time</h3>
                    <span className="adm-hint">
                        {periodLabel(period)} · {display.amount(gross)} across {scoped.length}
                        {scoped.length === 1 ? " expense" : " expenses"}
                    </span>
                </div>
                <MonthBars months={months} format={display.amount} tall />

                <div className="adm-dstats adm-dstats-3" style={{ marginTop: 20, marginBottom: 0 }}>
                    <div className="adm-ds">
                        <div className="adm-ds-l">This month</div>
                        <div className="adm-ds-v">{display.amount(thisMonth?.total || 0)}</div>
                        <p className="adm-fld-hint">
                            {delta === null
                                ? "No previous month to compare"
                                : delta === 0
                                    ? "Level with last month"
                                    : `${delta > 0 ? "▲" : "▼"} ${Math.abs(delta)}% vs last month`}
                        </p>
                    </div>
                    <div className="adm-ds">
                        <div className="adm-ds-l">Monthly average</div>
                        <div className="adm-ds-v">{display.amount(monthlyAverage)}</div>
                        <p className="adm-fld-hint">across {months.length || 0} months</p>
                    </div>
                    <div className="adm-ds">
                        <div className="adm-ds-l">Busiest month</div>
                        <div className="adm-ds-v">{busiest ? monthLabel(busiest.month) : "—"}</div>
                        <p className="adm-fld-hint">
                            {busiest ? `${busiest.count} of ${expenses.length} expenses` : "Nothing recorded"}
                        </p>
                    </div>
                </div>
            </div>

            <div className="adm-grid-2">
                <CategoryDonut
                    categories={categories}
                    format={display.amount}
                    title="Spend by category"
                    centreLabel="Gross"
                />
                <CategoryRanking categories={categories} format={display.amount} />
            </div>

            <TopSpenders
                people={people}
                format={display.amount}
                title="Top spenders"
                hint="Who accounts for the gross"
            />

            <p className="adm-note">
                <FiInfo aria-hidden="true" />
                Insights is organisation-wide. To open one person&apos;s spending, go to{" "}
                <Link to="/admin/reports"><b>Reports</b></Link>
            </p>
        </AdminLayout>
    );
};

export default AdminInsights;
