import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    FiRefreshCw, FiAlertCircle, FiInfo, FiAlertTriangle, FiClock,
    FiTrendingUp, FiCheck, FiCalendar,
} from "react-icons/fi";
import AdminLayout from "../components/AdminLayout";
import { useDisplay } from "../context/useDisplay";
import { shareLabel } from "../services/format";
import {
    COMPARISONS, rangesFor, within, sum, changeLabel, daysAgo, normaliseCategory,
    elapsedDays, daysThisMonth, oddDates,
} from "../services/compare";
import * as admin from "../services/adminService";

// Insights answers "compared to what". Reports answers "how much".
//
// The rule this page is built on: if a number can be read straight off Reports,
// it does not belong here. Everything below compares two things - this period
// against the last one, one person against the group, or one expense against
// that person's own normal.
//
// Layout B (chosen): the comparison cards and the movers tables come first,
// then the written signals, then the checks.
const initials = (name) =>
    String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const QUIET_DAYS = 30;
const OUTLIER_MULTIPLE = 1.4;   // an expense this much above that person's own average
const STALE_YEARS = 2;

const AdminInsights = () => {
    const display = useDisplay();
    const [comparison, setComparison] = useState("tm");
    const [state, setState] = useState({ people: [], expenses: [], error: "", loading: true });
    const alive = useRef(true);

    const load = useCallback(
        () =>
            Promise.all([admin.getPeople(), admin.getAllExpenses({ limit: 500 })])
                .then(([{ people }, expenses]) => {
                    if (alive.current) setState({ people, expenses, error: "", loading: false });
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

    const { people, expenses, error, loading } = state;
    const users = useMemo(() => people.filter((p) => p.role === "user"), [people]);
    const ranges = useMemo(() => rangesFor(comparison), [comparison]);

    // Everything the comparison band, the movers tables and the signals need is
    // derived in one pass. It was five separate useMemos, each feeding the next;
    // the React compiler refuses to memoise that shape, because a value derived
    // from a memo is not itself guaranteed stable. One memo, one dependency
    // list, no chain.
    const view = useMemo(() => {
        const now = within(expenses, ranges.period);
        const before = within(expenses, ranges.prior);
        const nowTotal = sum(now);
        const beforeTotal = sum(before);
        const headline = changeLabel(nowTotal, beforeTotal);

        // --- concentration: how much of this period comes from one person ---
        let concentration = null;
        if (now.length > 0) {
            const byPerson = new Map();
            now.forEach((e) =>
                byPerson.set(e.owner_name, (byPerson.get(e.owner_name) || 0) + Number(e.amount))
            );
            const [name, total] = [...byPerson.entries()].sort((a, b) => b[1] - a[1])[0];
            concentration = { name, total, share: shareLabel(total, nowTotal), people: byPerson.size };
        }

        // --- pace: only honest while the period is still running ------------
        let pace = null;
        if (ranges.running && now.length > 0) {
            const elapsed = elapsedDays(ranges.period);
            pace = {
                elapsed,
                entries: now.length,
                projected: (nowTotal / elapsed) * daysThisMonth(),
            };
        }

        // --- movers: categories and people, this period vs the previous -----
        const build = (keyOf) => {
            const map = new Map();
            const add = (rows, field) =>
                rows.forEach((e) => {
                    const key = keyOf(e);
                    const row = map.get(key) || { key, now: 0, before: 0 };
                    row[field] += Number(e.amount);
                    map.set(key, row);
                });
            add(now, "now");
            add(before, "before");
            return [...map.values()]
                .map((r) => ({ ...r, change: changeLabel(r.now, r.before) }))
                .sort((a, b) => Math.max(b.now, b.before) - Math.max(a.now, a.before));
        };

        // Every user appears in the people table, even one who recorded in
        // neither period - "nobody has started yet" is itself the finding.
        const byName = new Map(build((e) => e.owner_name).map((r) => [r.key, r]));
        const peopleRows = users.map((u) =>
            byName.get(u.name) || { key: u.name, now: 0, before: 0, change: changeLabel(0, 0) }
        ).sort((a, b) => Math.max(b.now, b.before) - Math.max(a.now, a.before));

        const movers = { categories: build((e) => e.category), people: peopleRows };

        // --- signals: things worth saying in words --------------------------
        const out = [];

        // 1. expenses far above that person's own average
        const averages = new Map();
        const totals = new Map();
        const counts = new Map();
        expenses.forEach((e) => {
            totals.set(e.user_id, (totals.get(e.user_id) || 0) + Number(e.amount));
            counts.set(e.user_id, (counts.get(e.user_id) || 0) + 1);
        });
        totals.forEach((total, id) => averages.set(id, total / counts.get(id)));

        const outliers = now
            .filter((e) => Number(e.amount) >= (averages.get(e.user_id) || 0) * OUTLIER_MULTIPLE)
            .sort((a, b) => Number(b.amount) - Number(a.amount))
            .slice(0, 2);

        if (outliers.length) {
            const share = shareLabel(sum(outliers), nowTotal);
            // Each outlier names its OWN owner and its OWN multiple. An earlier
            // draft printed one name for the whole list, which read as "Cinema
            // and Cinema by Browser User" when the two entries belonged to two
            // different people who happened to use the same title.
            out.push({
                tone: "bad", Icon: FiAlertTriangle,
                title: outliers.length === 1
                    ? "One expense is far bigger than the rest"
                    : "A few expenses carry most of the total",
                body: (
                    <>
                        {outliers.map((e, i) => (
                            <span key={e.id}>
                                {i > 0 && "; "}
                                <em>{e.title}</em>{" "}<em>({display.amount(e.amount)})</em>
                                {" by "}<em>{e.owner_name}</em>{", "}
                                <em>{(Number(e.amount) / (averages.get(e.user_id) || 1)).toFixed(1)}×</em>
                                {" their own average"}
                            </span>
                        ))}
                        {outliers.length === 1 ? ". That is " : ". Together they are "}
                        <em>{share}</em>
                        {" of everything in this period. Worth confirming the amounts."}
                    </>
                ),
            });
        }

        // 2. people who used to record and have stopped
        const quiet = users
            .filter((u) => u.count > 0 && daysAgo(u.last_expense) >= QUIET_DAYS)
            .sort((a, b) => daysAgo(b.last_expense) - daysAgo(a.last_expense));
        if (quiet.length) {
            out.push({
                tone: "warn", Icon: FiClock,
                title: quiet.length === 1
                    ? `${quiet[0].name} has gone quiet`
                    : `${quiet.length} people have gone quiet`,
                body: (
                    <>
                        {quiet.length === 1 ? "Last recorded " : null}
                        {quiet.slice(0, 3).map((u, i) => (
                            <span key={u.id}>
                                {i > 0 && ", "}
                                {quiet.length > 1 && <><em>{u.name}</em>{" last recorded "}</>}
                                <em>{display.date(u.last_expense)}</em>{` (${daysAgo(u.last_expense)} days ago)`}
                            </span>
                        ))}
                        {". They recorded before, so this is a change in behaviour rather than a new account."}
                    </>
                ),
            });
        }

        // 3. categories used for the first time in this period
        const seenBefore = new Set(
            expenses
                .filter((e) => new Date(e.expense_date).getTime() < ranges.period.from)
                .map((e) => e.category)
        );
        const fresh = [...new Set(now.map((e) => e.category))].filter((c) => !seenBefore.has(c));
        if (fresh.length) {
            out.push({
                tone: "info", Icon: FiTrendingUp,
                title: fresh.length === 1
                    ? "One category is new this period"
                    : `${fresh.length} categories are new this period`,
                body: (
                    <>
                        {fresh.slice(0, 4).map((c, i) => (
                            <span key={c}>{i > 0 && ", "}<em>{c}</em></span>
                        ))}
                        {" had never been used before. Categories are typed by hand, so new ones are worth a glance."}
                    </>
                ),
            });
        }

        return {
            now, before, nowTotal, beforeTotal, headline,
            concentration, pace, movers, signals: out,
        };
    }, [expenses, users, ranges, display]);

    const {
        now, before, nowTotal, beforeTotal, headline,
        concentration, pace, movers, signals,
    } = view;

    // --- checks: things that are often mistakes ----------------------------
    const checks = useMemo(() => {
        const list = [];

        // category names that differ only by case, spacing or a plural
        const groups = new Map();
        expenses.forEach((e) => {
            const key = normaliseCategory(e.category);
            if (!key) return;
            const set = groups.get(key) || new Set();
            set.add(e.category);
            groups.set(key, set);
        });
        const dupes = [...groups.values()].filter((s) => s.size > 1);
        list.push({
            pass: dupes.length === 0,
            title: dupes.length === 0
                ? "No category names look like duplicates"
                : `${dupes.length} set${dupes.length === 1 ? "" : "s"} of category names look alike`,
            body: dupes.length === 0
                ? "Nothing differs only by capitals, spacing or a plural."
                : dupes.map((s) => [...s].join(" / ")).slice(0, 3).join(" · ")
                  + " — counted separately in every total.",
            result: dupes.length === 0 ? "All clear" : `${dupes.length} to check`,
        });

        // categories used exactly once
        const useCount = new Map();
        expenses.forEach((e) => useCount.set(e.category, (useCount.get(e.category) || 0) + 1));
        // One or two one-off categories is normal. It stops being normal when
        // most of the list is one-offs - that is the shape of people inventing
        // a new name every time instead of reusing one. Half is the line.
        const once = [...useCount.entries()].filter(([, n]) => n === 1);
        const mostlyOnce = useCount.size > 0 && once.length * 2 > useCount.size;
        list.push({
            pass: !mostlyOnce,
            title: once.length === useCount.size && useCount.size > 0
                ? "Every category has been used exactly once"
                : mostlyOnce
                    ? `Most categories are used only once (${once.length} of ${useCount.size})`
                    : `${once.length} categor${once.length === 1 ? "y is" : "ies are"} used only once`,
            body: once.length === 0
                ? "Every category is being reused."
                : mostlyOnce
                    ? "Categories are typed by hand, so this usually means people are inventing a new name each time instead of reusing one."
                    : "The rest are being reused, so the list is not drifting.",
            result: `${once.length} of ${useCount.size}`,
        });

        // accounts that have never recorded anything
        const never = users.filter((u) => u.count === 0);
        list.push({
            pass: never.length === 0,
            title: never.length === 0
                ? "Every account has recorded something"
                : `${never.length} account${never.length === 1 ? " has" : "s have"} never recorded anything`,
            body: never.length === 0
                ? "Nobody is sitting unused."
                : never.map((u) => u.name).join(", ") + ". New accounts often just need a nudge.",
            result: never.length === 0 ? "All clear" : `${never.length} account${never.length === 1 ? "" : "s"}`,
        });

        // dates that look wrong
        const odd = oddDates(expenses, STALE_YEARS);
        list.push({
            pass: odd.length === 0,
            title: odd.length === 0 ? "No dates look wrong" : `${odd.length} expense${odd.length === 1 ? "" : "s"} have an odd date`,
            body: odd.length === 0
                ? `Nothing is dated in the future, and nothing is more than ${STALE_YEARS} years old.`
                : odd.slice(0, 3).map((e) => `${e.title} — ${display.date(e.expense_date)}`).join(" · "),
            result: odd.length === 0 ? "All clear" : `${odd.length} to check`,
        });

        return list;
    }, [expenses, users, display]);

    if (loading) {
        return (
            <AdminLayout title="Insights" subtitle="Working out what changed...">
                <p className="adm-empty">Loading...</p>
            </AdminLayout>
        );
    }

    return (
        <AdminLayout
            title="Insights"
            subtitle="The comparisons Reports cannot make — movement first, then what to look at."
            counts={{ users: users.length, expenses: expenses.length }}
            actions={
                <>
                    <label className="adm-drop">
                        <FiCalendar aria-hidden="true" />
                        <span>Compare</span>
                        <select value={comparison} onChange={(e) => setComparison(e.target.value)}
                                aria-label="Comparison">
                            {COMPARISONS.map((c) => (
                                <option key={c.id} value={c.id}>{c.label}</option>
                            ))}
                        </select>
                    </label>
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

            {/* 1, 2, 3 - the comparison band */}
            <div className="adm-cmp">
                <div className="adm-kpi adm-kpi-lead">
                    <div className="adm-kpi-lab">{ranges.period.label} vs {ranges.prior.label.toLowerCase()}</div>
                    <div className="adm-kpi-val">{display.amount(nowTotal)}</div>
                    <div className="adm-kpi-sub">
                        was {display.amount(beforeTotal)}{" "}
                        <span className={`adm-vs adm-vs-${headline.tone}`}>{headline.text}</span>
                    </div>
                </div>

                <div className="adm-kpi">
                    <div className="adm-kpi-lab">Spending is concentrated</div>
                    <div className="adm-kpi-val">{concentration ? concentration.share : "—"}</div>
                    <div className="adm-kpi-sub">
                        {concentration
                            ? <>of this period comes from <b>{concentration.name}</b>
                               {concentration.people > 1 ? `, out of ${concentration.people} people spending` : " alone"}</>
                            : "Nothing recorded in this period"}
                    </div>
                </div>

                <div className="adm-kpi">
                    {pace ? (
                        <>
                            <div className="adm-kpi-lab">Pace this month</div>
                            <div className="adm-kpi-val">
                                {pace.entries} <span className="adm-kpi-unit">
                                    {pace.entries === 1 ? "entry" : "entries"} in {pace.elapsed} days
                                </span>
                            </div>
                            <div className="adm-kpi-sub">
                                At this rate, about <b>{display.amount(pace.projected)}</b> by month end
                            </div>
                        </>
                    ) : (
                        <>
                            <div className="adm-kpi-lab">Entries this period</div>
                            <div className="adm-kpi-val">{now.length}</div>
                            <div className="adm-kpi-sub">
                                was {before.length} in {ranges.prior.label.toLowerCase()}
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 4, 5 - the movers */}
            <div className="adm-grid-2">
                <MoverTable
                    title="Categories on the move"
                    heading="Category"
                    rows={movers.categories}
                    ranges={ranges}
                    display={display}
                    empty="Nothing recorded in either period."
                />
                <MoverTable
                    title="People on the move"
                    heading="Person"
                    rows={movers.people}
                    ranges={ranges}
                    display={display}
                    withAvatar
                    empty="No user accounts yet."
                />
            </div>

            {/* 6 - what stands out */}
            <div className="adm-panel">
                <div className="adm-panel-head">
                    <h3>What stands out</h3>
                    <span className="adm-hint">Compared to each person&rsquo;s own normal</span>
                </div>
                {signals.length === 0 ? (
                    <p className="adm-empty">
                        Nothing unusual in this period — no outsized expenses, nobody has gone
                        quiet, and no new categories.
                    </p>
                ) : (
                    signals.map((s) => (
                        <div className={`adm-sig adm-sig-${s.tone}`} key={s.title}>
                            <span className="adm-sig-ico" aria-hidden="true"><s.Icon /></span>
                            <div className="adm-sig-body">
                                <b>{s.title}</b>
                                <p>{s.body}</p>
                            </div>
                        </div>
                    ))
                )}
            </div>

            {/* 7 - worth checking */}
            <div className="adm-panel">
                <div className="adm-panel-head">
                    <h3>Worth checking</h3>
                    <span className="adm-hint">
                        Nothing here is an error — just things that are often mistakes
                    </span>
                </div>
                {checks.map((c) => (
                    <div className={`adm-chk adm-chk-${c.pass ? "pass" : "look"}`} key={c.title}>
                        <span className="adm-chk-mark" aria-hidden="true">
                            {c.pass ? <FiCheck /> : <FiInfo />}
                        </span>
                        <div className="adm-chk-text">
                            <b>{c.title}</b>
                            <p>{c.body}</p>
                        </div>
                        <span className="adm-chk-res">{c.result}</span>
                    </div>
                ))}
            </div>

            <p className="adm-note">
                <FiInfo aria-hidden="true" />
                Insights compares. For the itemised totals, go to{" "}
                <Link to="/admin/reports"><b>Reports</b></Link>
            </p>
        </AdminLayout>
    );
};

const MoverTable = ({ title, heading, rows, ranges, display, withAvatar = false, empty }) => (
    <div className="adm-panel">
        <div className="adm-panel-head">
            <h3>{title}</h3>
            <span className="adm-hint">
                {ranges.period.label} vs {ranges.prior.label.toLowerCase()}
            </span>
        </div>
        {rows.length === 0 ? (
            <p className="adm-empty">{empty}</p>
        ) : (
            <table className="adm-table">
                <thead>
                    <tr>
                        <th>{heading}</th>
                        <th className="adm-right">{ranges.prior.label}</th>
                        <th className="adm-right">{ranges.period.label}</th>
                        <th className="adm-right">Change</th>
                    </tr>
                </thead>
                <tbody>
                    {rows.slice(0, 6).map((r) => (
                        <tr key={r.key}>
                            <td>
                                {withAvatar ? (
                                    <span className="adm-who">
                                        <span className="adm-pip">{initials(r.key)}</span>
                                        <b>{r.key}</b>
                                    </span>
                                ) : <b>{r.key}</b>}
                            </td>
                            <td className={`adm-right adm-mono${r.before === 0 ? " adm-zero" : ""}`}>
                                {display.amount(r.before)}
                            </td>
                            <td className={`adm-right adm-mono${r.now === 0 ? " adm-zero" : ""}`}>
                                {display.amount(r.now)}
                            </td>
                            <td className="adm-right">
                                <span className={`adm-pill adm-pill-${r.change.tone}`}>{r.change.text}</span>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        )}
    </div>
);

export default AdminInsights;
