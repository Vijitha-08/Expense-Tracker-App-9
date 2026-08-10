import { monthLabel, percent } from "../services/format";

// Chart primitives for the admin panel. Small, dependency-free and scoped to
// `.adm` styling, so they cannot be reached by the marketing-page CSS that
// broke the dashboard cards in an earlier round.

// ---------------------------------------------------------------
// Monthly bars. `months` arrives newest-first from the API; reversed here so
// time runs left to right on screen.
// ---------------------------------------------------------------
export const MonthBars = ({ months = [], format, tall = false, emptyText = "No spending recorded yet." }) => {
    if (months.length === 0) return <p className="adm-empty">{emptyText}</p>;

    const ordered = [...months].reverse();
    const peak = Math.max(...ordered.map((m) => Number(m.total) || 0), 1);

    return (
        <div className={`adm-bars${tall ? " adm-bars-tall" : ""}`}>
            {ordered.map((m) => {
                const total = Number(m.total) || 0;
                // A floor of 2% so an empty month is still a visible tick
                // rather than nothing at all under its label.
                const height = Math.max((total / peak) * 100, 2);
                return (
                    <div className="adm-bar-wrap" key={m.month}>
                        <span className="adm-bar-cap">{format(total)}</span>
                        <span
                            className={`adm-bar${total === 0 ? " adm-bar-soft" : ""}`}
                            style={{ height: `${height}%` }}
                        />
                        <span className="adm-bar-x">{monthLabel(m.month)}</span>
                    </div>
                );
            })}
        </div>
    );
};

// ---------------------------------------------------------------
// Category donut. Arc offsets are pre-computed with a prefix sum rather than
// mutated inside the map: reassigning a variable during render is exactly
// what the React compiler rejects.
// ---------------------------------------------------------------
const SHADES = ["#4f46e5", "#7c8cf8", "#a5b0fb", "#c3c9fb", "#e2e6fd"];

export const CategoryDonut = ({ categories = [], format, title, centreLabel = "Total" }) => {
    const total = categories.reduce((sum, c) => sum + Number(c.total), 0);

    if (categories.length === 0 || total === 0) {
        return (
            <div className="adm-panel">
                <div className="adm-panel-head"><h3>{title}</h3></div>
                <p className="adm-empty">No spending recorded yet.</p>
            </div>
        );
    }

    const top = categories.slice(0, 5);
    // Shares first, then offsets as a prefix sum. Reassigning a running total
    // inside the map is what the React compiler rejects, and with at most five
    // slices the repeated slice+reduce costs nothing.
    const shares = top.map((c) => (Number(c.total) / total) * 100);
    const arcs = shares.map((dash, i) => ({
        dash,
        offset: 25 - shares.slice(0, i).reduce((sum, v) => sum + v, 0),
        colour: SHADES[i % SHADES.length],
    }));

    return (
        <div className="adm-panel">
            <div className="adm-panel-head"><h3>{title}</h3></div>
            <div className="adm-donut-wrap">
                <div className="adm-donut">
                    <svg width="140" height="140" viewBox="0 0 42 42" role="img"
                         aria-label={`Spending split across ${top.length} categories`}>
                        <circle cx="21" cy="21" r="15.9" fill="none" stroke="#eef0fa" strokeWidth="6" />
                        {arcs.map((a, i) => (
                            <circle
                                key={top[i].category}
                                cx="21" cy="21" r="15.9" fill="none"
                                stroke={a.colour} strokeWidth="6"
                                strokeDasharray={`${a.dash} ${100 - a.dash}`}
                                strokeDashoffset={a.offset}
                            />
                        ))}
                    </svg>
                    <div className="adm-donut-mid">
                        <span>
                            <small>{centreLabel}</small>
                            <b>{format(total)}</b>
                        </span>
                    </div>
                </div>
                <div className="adm-legend">
                    {top.map((c, i) => (
                        <div className="adm-legend-row" key={c.category}>
                            <span className="adm-swatch" style={{ background: SHADES[i % SHADES.length] }} />
                            <span className="adm-legend-name">{c.category}</span>
                            <span className="adm-legend-val">{format(c.total)}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

// ---------------------------------------------------------------
// Category ranking - the same data as bars, easier to read once there are
// many categories.
// ---------------------------------------------------------------
export const CategoryRanking = ({ categories = [], format, title = "Category ranking" }) => {
    const total = categories.reduce((sum, c) => sum + Number(c.total), 0);

    return (
        <div className="adm-panel">
            <div className="adm-panel-head">
                <h3>{title}</h3><span className="adm-hint">Share of gross</span>
            </div>
            {categories.length === 0 ? (
                <p className="adm-empty">No spending recorded yet.</p>
            ) : (
                <div className="adm-legend">
                    {categories.slice(0, 6).map((c, i) => (
                        <div key={c.category}>
                            <div className="adm-legend-row">
                                <span className="adm-swatch" style={{ background: SHADES[i % SHADES.length] }} />
                                <span className="adm-legend-name">{c.category}</span>
                                <span className="adm-legend-val">
                                    {format(c.total)} · {percent(c.total, total)}%
                                </span>
                            </div>
                            <div className="adm-meter">
                                <i style={{
                                    width: `${Math.max(percent(c.total, total), 1)}%`,
                                    background: SHADES[i % SHADES.length],
                                }} />
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// ---------------------------------------------------------------
// Top spenders.
// ---------------------------------------------------------------
export const TopSpenders = ({ people = [], format, title = "Top spenders", hint = "All time" }) => {
    const ranked = people.filter((p) => Number(p.total) > 0).slice(0, 5);
    const peak = Math.max(...ranked.map((p) => Number(p.total) || 0), 1);

    return (
        <div className="adm-panel">
            <div className="adm-panel-head">
                <h3>{title}</h3><span className="adm-hint">{hint}</span>
            </div>
            {ranked.length === 0 ? (
                <p className="adm-empty">Nobody has recorded an expense yet.</p>
            ) : (
                <div className="adm-rank">
                    {ranked.map((p, i) => (
                        <div className={`adm-rk${i === 0 ? " adm-rk-top" : ""}`} key={p.id}>
                            <span className="adm-rk-num">{i + 1}</span>
                            <div className="adm-rk-body">
                                <div className="adm-rk-t">
                                    {p.name}<span>{format(p.total)}</span>
                                </div>
                                <div className="adm-meter">
                                    <i style={{ width: `${Math.max((Number(p.total) / peak) * 100, 1)}%` }} />
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};
