import { money, percent } from "../services/format";

// Fixed palette rather than a random hue per render, so the same category is
// always the same colour between reloads and between the two dashboards.
//
// Only the FIRST entry is a custom property. Measured against the dark card
// surface, ten of these eleven hues already clear the 3.0:1 a graphical object
// needs, so they stay literal and shared between the themes - a categorical
// palette that changes per theme means a category changes colour when you flip
// the switch, which defeats the point of a fixed palette. The exception is
// #4f46e5 at 2.68:1, the deep indigo that reads on white and sinks into a dark
// card; `--chart-1` carries it, defaulting to the original value so nothing
// changes in light. See the note in index.css.
//
// A var() must be applied through `style`, never as an SVG presentation
// attribute - `stroke="var(--x)"` is not resolved by the attribute parser.
const PALETTE = [
    "var(--chart-1, #4f46e5)", "#0ea5e9", "#10b981", "#f59e0b", "#ef4444",
    "#8b5cf6", "#14b8a6", "#f97316", "#6366f1", "#84cc16", "#64748b",
];

const RADIUS = 62;
const STROKE = 22;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;

// A donut drawn with stroke-dasharray on concentric circles. Each slice is one
// circle whose dash covers only its own share of the ring; the group is rotated
// -90deg so the first slice starts at 12 o'clock instead of 3 o'clock.
const CategoryDonut = ({ categories, title = "Where it goes", topN = 6 }) => {
    const total = categories.reduce((sum, c) => sum + Number(c.total), 0);

    if (!categories.length || total <= 0) {
        return (
            <section className="panel">
                <div className="panel-head"><h3>{title}</h3></div>
                <div className="empty-state">Add an expense to see the breakdown.</div>
            </section>
        );
    }

    // Everything past the top N is rolled into one "Other categories" slice, so
    // a long tail cannot turn the legend into thirty unreadable slivers.
    const sorted = [...categories].sort((a, b) => b.total - a.total);
    const head = sorted.slice(0, topN);
    const tail = sorted.slice(topN);
    const slices = tail.length
        ? [...head, {
            category: `${tail.length} more`,
            total: tail.reduce((s, c) => s + Number(c.total), 0),
            count: tail.reduce((s, c) => s + Number(c.count), 0),
        }]
        : head;

    // Each arc needs the total length of every arc before it as its dash offset.
    // That is computed up front rather than accumulated inside the JSX map: a
    // variable mutated during render is not safe to reuse across renders, and
    // the React compiler rejects it. With at most topN + 1 slices the repeated
    // prefix sum costs nothing.
    const arcs = slices.map((c, i) => {
        const dash = (Number(c.total) / total) * CIRCUMFERENCE;
        const offset = slices
            .slice(0, i)
            .reduce((sum, prev) => sum + (Number(prev.total) / total) * CIRCUMFERENCE, 0);
        return { ...c, dash, offset, color: PALETTE[i % PALETTE.length] };
    });

    return (
        <section className="panel">
            <div className="panel-head"><h3>{title}</h3></div>

            <div className="donut-wrap">
                <div className="donut">
                    <svg viewBox="0 0 160 160" role="img"
                         aria-label={`Spending split across ${slices.length} categories`}>
                        <g transform="rotate(-90 80 80)">
                            {/* `style`, not `stroke=`. An SVG presentation
                                attribute is not a CSS declaration, so a
                                var() in one does not resolve - the track was
                                already written as stroke="var(--border)" and
                                was silently falling back rather than picking
                                up the token. Both are moved to style so the
                                track and the slices actually follow the
                                theme. */}
                            <circle cx="80" cy="80" r={RADIUS} fill="none"
                                    style={{ stroke: "var(--border)" }} strokeWidth={STROKE} />
                            {arcs.map((c) => (
                                <circle
                                    key={c.category}
                                    cx="80" cy="80" r={RADIUS} fill="none"
                                    style={{ stroke: c.color }}
                                    strokeWidth={STROKE}
                                    strokeDasharray={`${c.dash} ${CIRCUMFERENCE - c.dash}`}
                                    strokeDashoffset={-c.offset}
                                />
                            ))}
                        </g>
                    </svg>
                    <div className="donut-centre">
                        <span className="donut-centre-label">Total</span>
                        <strong className="donut-centre-value">{money(total)}</strong>
                    </div>
                </div>

                <ul className="donut-legend">
                    {arcs.map((c) => (
                        <li key={c.category}>
                            <span className="legend-dot" style={{ background: c.color }} />
                            <span className="legend-name">{c.category}</span>
                            <span className="legend-pct">{percent(c.total, total)}%</span>
                            <span className="legend-value mono">{money(c.total)}</span>
                        </li>
                    ))}
                </ul>
            </div>
        </section>
    );
};

export default CategoryDonut;
