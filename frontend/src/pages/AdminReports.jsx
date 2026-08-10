import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FiDownload, FiPrinter, FiSearch, FiAlertCircle } from "react-icons/fi";
import AdminLayout from "../components/AdminLayout";
import PeriodPicker from "../components/PeriodPicker";
import { inPeriod, periodLabel } from "../services/period";
import { MonthBars } from "../components/AdminCharts";
import { useDisplay } from "../context/useDisplay";
import { percent } from "../services/format";
import * as admin from "../services/adminService";

// Design R1: everyone on the left, the selected person's full breakdown on the
// right. Answers the three things the reviewer asked for - how many people and
// how much each spends, what the biggest category is, and what one person's
// approximate spending looks like when you click them.
const initials = (name) =>
    String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const AdminReports = () => {
    const display = useDisplay();
    const [period, setPeriod] = useState(display.defaultPeriod);
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState(null);
    const [list, setList] = useState({ people: [], counts: {}, error: "", loading: true });
    const [detail, setDetail] = useState({ data: null, error: "", loading: false });
    const alive = useRef(true);

    useEffect(() => {
        alive.current = true;
        return () => { alive.current = false; };
    }, []);

    const [orgCategories, setOrgCategories] = useState([]);

    const loadList = useCallback(
        () =>
            Promise.all([admin.getPeople(), admin.getOverview()])
                .then(([{ people, counts }, overview]) => {
                    if (!alive.current) return;
                    setOrgCategories(overview.categories ?? []);
                    setList({ people, counts, error: "", loading: false });
                    // Preselect the biggest spender so the page is never a
                    // blank right-hand column on first open.
                    const first = people.find((p) => p.role === "user");
                    setSelectedId((current) => current ?? first?.id ?? null);
                })
                .catch((err) => {
                    if (alive.current) setList((p) => ({ ...p, error: err.message, loading: false }));
                }),
        []
    );

    useEffect(() => { loadList(); }, [loadList]);

    // Every setState happens inside a promise callback, never synchronously in
    // the effect body - otherwise React is asked to re-render mid-effect.
    // "Loading" is derived from whether the loaded person matches the selected
    // one, so no extra flag is needed.
    useEffect(() => {
        if (!selectedId) return undefined;
        let cancelled = false;
        admin.getPerson(selectedId)
            .then((data) => {
                if (!cancelled && alive.current) setDetail({ data, error: "", loading: false });
            })
            .catch((err) => {
                if (!cancelled && alive.current) {
                    setDetail({ data: null, error: err.message, loading: false });
                }
            });
        return () => { cancelled = true; };
    }, [selectedId]);

    const spenders = list.people.filter((p) => p.role === "user");

    const visible = useMemo(() => {
        const q = query.trim().toLowerCase();
        if (!q) return spenders;
        return spenders.filter((p) => p.name.toLowerCase().includes(q));
    }, [spenders, query]);

    const gross = spenders.reduce((sum, p) => sum + Number(p.total), 0);
    const activeCount = spenders.filter((p) => p.count > 0).length;
    const silent = spenders.length - activeCount;

    // Biggest category across everyone - the reviewer's "max spend dheni midha".
    // Organisation-wide on purpose: the per-person split is below, in the
    // selected person's panel.
    const orgTopCategory = orgCategories[0] ?? null;

    const loaded = detail.data?.person;
    const person = loaded?.id === selectedId ? loaded : null;
    const detailLoading = Boolean(selectedId) && !person && !detail.error;
    const personExpenses = useMemo(
        () => inPeriod(detail.data?.expenses ?? [], period),
        [detail.data, period]
    );
    const personCategories = detail.data?.categories ?? [];
    const personTotalInPeriod = personExpenses.reduce((sum, e) => sum + Number(e.amount), 0);

    return (
        <AdminLayout
            title="Reports"
            subtitle="Who is spending, how much, and on what. Pick a person to open their detail."
            counts={{ users: list.counts.total, expenses: undefined }}
            actions={
                <>
                    <button type="button" className="adm-btn" onClick={admin.downloadExpensesCsv}>
                        <FiDownload aria-hidden="true" /> Export CSV
                    </button>
                    <button type="button" className="adm-btn adm-btn-primary" onClick={() => window.print()}>
                        <FiPrinter aria-hidden="true" /> Print
                    </button>
                </>
            }
        >
            {list.error && (
                <div className="adm-alert" role="alert">
                    <FiAlertCircle aria-hidden="true" /> {list.error}
                </div>
            )}

            <div className="adm-toolbar">
                <PeriodPicker value={period} onChange={setPeriod} />
                <label className="adm-search">
                    <FiSearch aria-hidden="true" />
                    <input
                        type="search"
                        value={query}
                        onChange={(e) => setQuery(e.target.value)}
                        placeholder="Search a person..."
                        aria-label="Search a person"
                    />
                </label>
            </div>

            <div className="adm-grid-3">
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">People spending</div>
                    <div className="adm-kpi-val">{activeCount} of {spenders.length}</div>
                    <div className="adm-kpi-sub">
                        {silent === 0
                            ? "Everyone has recorded something"
                            : `${silent} ${silent === 1 ? "account has" : "accounts have"} recorded nothing`}
                    </div>
                </div>
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">Gross amount</div>
                    <div className="adm-kpi-val">{display.amount(gross)}</div>
                    <div className="adm-kpi-sub">
                        across {activeCount} {activeCount === 1 ? "person" : "people"}
                    </div>
                </div>
                <div className="adm-kpi">
                    <div className="adm-kpi-lab">Max spend on</div>
                    <div className="adm-kpi-val adm-kpi-val-sm">
                        {orgTopCategory ? orgTopCategory.category : "—"}
                    </div>
                    <div className="adm-kpi-sub">
                        {orgTopCategory
                            ? `${display.amount(orgTopCategory.total)} · ${percent(orgTopCategory.total, gross)}% of gross`
                            : "No expenses yet"}
                    </div>
                </div>
            </div>

            <div className="adm-split">
                <div className="adm-list">
                    <div className="adm-list-head">Everyone · highest first</div>
                    {list.loading ? (
                        <p className="adm-empty">Loading...</p>
                    ) : visible.length === 0 ? (
                        <p className="adm-empty">Nobody matches that search.</p>
                    ) : (
                        visible.map((p) => (
                            <button
                                type="button"
                                key={p.id}
                                className={`adm-urow${p.id === selectedId ? " adm-urow-on" : ""}`}
                                onClick={() => setSelectedId(p.id)}
                            >
                                <span className="adm-pip">{initials(p.name)}</span>
                                <span className="adm-urow-name">
                                    {p.name}
                                    <small>
                                        {p.count === 0
                                            ? "no expenses yet"
                                            : `${p.count} ${p.count === 1 ? "expense" : "expenses"}`}
                                    </small>
                                </span>
                                <span className={`adm-urow-amt${p.count === 0 ? " adm-zero" : ""}`}>
                                    {display.amount(p.total)}
                                    <small>{gross > 0 ? `${percent(p.total, gross)}%` : "—"}</small>
                                </span>
                            </button>
                        ))
                    )}
                </div>

                <div className="adm-panel">
                    {detail.error && (
                        <div className="adm-alert" role="alert">
                            <FiAlertCircle aria-hidden="true" /> {detail.error}
                        </div>
                    )}

                    {!person ? (
                        <p className="adm-empty">
                            {detailLoading ? "Loading..." : "Pick somebody on the left to see their spending."}
                        </p>
                    ) : (
                        <>
                            <div className="adm-detail-head">
                                <span className="adm-pip adm-pip-accent">{initials(person.name)}</span>
                                <div>
                                    <h3>{person.name}</h3>
                                    <p>
                                        {person.email} · joined {display.date(person.created_at)}
                                        {person.last_expense && ` · last expense ${display.date(person.last_expense)}`}
                                    </p>
                                </div>
                            </div>

                            <div className="adm-dstats">
                                <div className="adm-ds adm-ds-hi">
                                    <div className="adm-ds-l">Their spend</div>
                                    <div className="adm-ds-v">{display.amount(personTotalInPeriod)}</div>
                                </div>
                                <div className="adm-ds">
                                    <div className="adm-ds-l">Expenses</div>
                                    <div className="adm-ds-v">{personExpenses.length}</div>
                                </div>
                                <div className="adm-ds">
                                    <div className="adm-ds-l">Approx / month</div>
                                    <div className="adm-ds-v">{display.amount(person.approx_per_month)}</div>
                                </div>
                                <div className="adm-ds">
                                    <div className="adm-ds-l">Largest one</div>
                                    <div className="adm-ds-v">{display.amount(person.largest)}</div>
                                </div>
                            </div>

                            <div className="adm-grid-2">
                                <div>
                                    <p className="adm-sub-label">Their spend by month</p>
                                    <MonthBars
                                        months={detail.data.months}
                                        format={display.amount}
                                        emptyText="Nothing recorded yet."
                                    />
                                </div>
                                <div>
                                    <p className="adm-sub-label">Where their money went</p>
                                    {personCategories.length === 0 ? (
                                        <p className="adm-empty">Nothing recorded yet.</p>
                                    ) : (
                                        <div className="adm-legend">
                                            {personCategories.slice(0, 5).map((c, i) => (
                                                <div key={c.category}>
                                                    <div className="adm-legend-row">
                                                        <span
                                                            className="adm-swatch"
                                                            style={{ background: SHADES[i % SHADES.length] }}
                                                        />
                                                        <span className="adm-legend-name">{c.category}</span>
                                                        <span className="adm-legend-val">{display.amount(c.total)}</span>
                                                    </div>
                                                    <div className="adm-meter">
                                                        <i style={{
                                                            width: `${Math.max(percent(c.total, person.total), 1)}%`,
                                                            background: SHADES[i % SHADES.length],
                                                        }} />
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>

                            <p className="adm-sub-label" style={{ marginTop: 24 }}>
                                Their expenses <span>— {periodLabel(period).toLowerCase()}</span>
                            </p>
                            {personExpenses.length === 0 ? (
                                <p className="adm-empty">Nothing in {periodLabel(period).toLowerCase()}.</p>
                            ) : (
                                <table className="adm-table">
                                    <thead>
                                        <tr>
                                            <th>Date</th><th>Details</th><th>Category</th>
                                            <th className="adm-right">Amount</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {personExpenses.map((e) => (
                                            <tr key={e.id}>
                                                <td className="adm-dim">{display.date(e.expense_date)}</td>
                                                <td><b>{e.title}</b></td>
                                                <td><span className="adm-tag">{e.category}</span></td>
                                                <td className="adm-right adm-mono">{display.amount(e.amount)}</td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}
                        </>
                    )}
                </div>
            </div>
        </AdminLayout>
    );
};

const SHADES = ["#4f46e5", "#7c8cf8", "#a5b0fb", "#c3c9fb", "#e2e6fd"];

export default AdminReports;
