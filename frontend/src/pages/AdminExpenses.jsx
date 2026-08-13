import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiSearch, FiAlertCircle, FiLock } from "react-icons/fi";
import AdminLayout from "../Layouts/AdminLayout";
import PeriodPicker from "../components/PeriodPicker";
import { inPeriod, periodLabel } from "../services/period";
import { useDisplay } from "../context/useDisplay";
import * as admin from "../services/adminService";

const initials = (name) =>
    String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

// Every expense from every person, read only. Period, category and person are
// all dropdowns so the toolbar stays one line however many categories people
// type in.
const AdminExpenses = () => {
    const display = useDisplay();
    const [period, setPeriod] = useState(display.defaultPeriod);
    const [category, setCategory] = useState("All");
    const [owner, setOwner] = useState("all");
    const [query, setQuery] = useState("");
    const [state, setState] = useState({ expenses: [], people: [], counts: {}, error: "", loading: true });
    const alive = useRef(true);

    const load = useCallback(
        () =>
            Promise.all([admin.getAllExpenses({ limit: 500 }), admin.getPeople()])
                .then(([expenses, { people, counts }]) => {
                    if (alive.current) setState({ expenses, people, counts, error: "", loading: false });
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

    const { expenses, people, counts, error, loading } = state;

    const categories = useMemo(
        () => ["All", ...[...new Set(expenses.map((e) => e.category))].sort()],
        [expenses]
    );

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        return inPeriod(expenses, period)
            .filter((e) => category === "All" || e.category === category)
            .filter((e) => owner === "all" || String(e.user_id) === String(owner))
            .filter((e) => !q || e.title.toLowerCase().includes(q));
    }, [expenses, period, category, owner, query]);

    const gross = visible.reduce((sum, e) => sum + Number(e.amount), 0);
    const average = visible.length ? gross / visible.length : 0;
    const largest = visible.reduce(
        (best, e) => (!best || Number(e.amount) > Number(best.amount) ? e : best),
        null
    );

    return (
        <AdminLayout
            title="All expenses"
            subtitle="Every entry from every person. Read only — administrators do not edit other people's records."
            counts={{ users: counts.total, expenses: expenses.length }}
            actions={
                <button type="button" className="adm-btn" onClick={admin.downloadExpensesCsv}>
                    <FiDownload aria-hidden="true" /> Export CSV
                </button>
            }
        >
            {error && (
                <div className="adm-alert" role="alert">
                    <FiAlertCircle aria-hidden="true" /> {error}
                </div>
            )}

            <div className="adm-toolbar">
                <PeriodPicker value={period} onChange={setPeriod} />

                <label className="adm-select">
                    Category
                    <select value={category} onChange={(e) => setCategory(e.target.value)}>
                        {categories.map((c) => (
                            <option key={c} value={c}>{c === "All" ? "All categories" : c}</option>
                        ))}
                    </select>
                </label>

                <label className="adm-select">
                    Person
                    <select value={owner} onChange={(e) => setOwner(e.target.value)}>
                        <option value="all">Everyone</option>
                        {people.filter((p) => p.role === "user").map((p) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                        ))}
                    </select>
                </label>

                <label className="adm-search">
                    <FiSearch aria-hidden="true" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search a title..."
                        aria-label="Search expenses by title"
                    />
                </label>
            </div>

            <div className="adm-grid-3">
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">Showing</div>
                    <div className="adm-kpi-val">
                        {visible.length} {visible.length === 1 ? "expense" : "expenses"}
                    </div>
                    <div className="adm-kpi-sub">out of {expenses.length} recorded in total</div>
                </div>
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">Gross amount</div>
                    <div className="adm-kpi-val">{display.amount(gross)}</div>
                    <div className="adm-kpi-sub">average {display.amount(average)} per entry</div>
                </div>
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">Largest single expense</div>
                    <div className="adm-kpi-val">{display.amount(largest?.amount || 0)}</div>
                    <div className="adm-kpi-sub">
                        {largest
                            ? `${largest.title} · ${largest.owner_name} · ${display.date(largest.expense_date)}`
                            : "Nothing recorded"}
                    </div>
                </div>
            </div>

            <div className="adm-panel">
                <div className="adm-panel-head">
                    <h3>Every expense</h3>
                    <span className="adm-hint">Newest first · {periodLabel(period)}</span>
                </div>

                {loading ? (
                    <p className="adm-empty">Loading...</p>
                ) : visible.length === 0 ? (
                    <p className="adm-empty">
                        {expenses.length === 0
                            ? "Nobody has recorded an expense yet."
                            : "Nothing matches these filters."}
                    </p>
                ) : (
                    <table className="adm-table">
                        <thead>
                            <tr>
                                <th>Date</th><th>Details</th><th>Added by</th>
                                <th>Category</th><th className="adm-right">Amount</th>
                            </tr>
                        </thead>
                        <tbody>
                            {visible.map((e) => (
                                <tr key={e.id}>
                                    <td className="adm-dim">{display.date(e.expense_date)}</td>
                                    <td><b>{e.title}</b></td>
                                    <td>
                                        <span className="adm-who">
                                            <span className="adm-pip">{initials(e.owner_name)}</span>
                                            {e.owner_name}
                                        </span>
                                    </td>
                                    <td><span className="adm-tag">{e.category}</span></td>
                                    <td className="adm-right adm-mono">{display.amount(e.amount)}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}

                <p className="adm-note">
                    <FiLock aria-hidden="true" />
                    No Edit or Delete here by design — an administrator oversees expenses,
                    they do not rewrite somebody else&apos;s records.
                </p>
            </div>
        </AdminLayout>
    );
};

export default AdminExpenses;
