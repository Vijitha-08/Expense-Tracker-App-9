import { moneyShort, monthLabel, money } from "../services/format";

// A plain CSS column chart. Deliberately not a chart library: one dimension
// over six months does not justify another dependency, and hand-rolled markup
// keeps the bundle and the install small.
//
// `months` arrives newest-first from the API (that is what the LIMIT needs),
// so it is reversed here to read left-to-right like a calendar.
// `format` defaults to money(), so a caller that does not pass one behaves
// exactly as before. The user dashboard passes display.amount, which is what
// makes Settings > Display > "estimated amounts" reach this chart.
const MonthlyTrend = ({ months, title = "Spend over time", format = money }) => {
    const data = [...months].reverse();

    if (!data.length) {
        return (
            <section className="panel">
                <div className="panel-head"><h3>{title}</h3></div>
                <div className="empty-state">No spending recorded yet.</div>
            </section>
        );
    }

    const max = Math.max(...data.map((m) => m.total), 1);
    const highest = data.reduce((a, b) => (b.total > a.total ? b : a), data[0]);

    return (
        <section className="panel">
            <div className="panel-head">
                <h3>{title}</h3>
                <span className="panel-note">
                    Peak {monthLabel(highest.month)} · {format(highest.total)}
                </span>
            </div>

            <div className="trend">
                {data.map((m) => {
                    const height = Math.max(Math.round((m.total / max) * 100), 2);
                    return (
                        <div className="trend-col" key={m.month}>
                            {/* The amount lives inside the growing column, directly
                                above the bar, so it rides up with the bar instead of
                                floating at the top of the chart. */}
                            <div className="trend-bar-wrap">
                                <span className="trend-value">{moneyShort(m.total)}</span>
                                <div
                                    className="trend-bar trend-bar-solid"
                                    style={{ height: `${height}%` }}
                                    title={`${monthLabel(m.month)}: ${format(m.total)} across ${m.count} ${
                                        m.count === 1 ? "entry" : "entries"
                                    }`}
                                />
                            </div>
                            <span className="trend-label">{monthLabel(m.month)}</span>
                        </div>
                    );
                })}
            </div>
        </section>
    );
};

export default MonthlyTrend;
