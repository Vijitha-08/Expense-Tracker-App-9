import { money, percent } from "../services/format";

// Proportional bars - the same figures the donut shows, ranked. Once there are
// more than four or five categories a ranked list is easier to read off than a
// ring, so the admin insights tab shows both.
const CategoryBreakdown = ({ categories, title = "Category ranking" }) => {
    if (!categories.length) {
        return (
            <section className="panel">
                <div className="panel-head"><h3>{title}</h3></div>
                <div className="empty-state">Nothing to rank yet.</div>
            </section>
        );
    }

    const max = Math.max(...categories.map((c) => c.total), 1);
    const total = categories.reduce((sum, c) => sum + Number(c.total), 0);

    return (
        <section className="panel">
            <div className="panel-head">
                <h3>{title}</h3>
                <span className="panel-note">{categories.length} categories in use</span>
            </div>

            <ul className="breakdown">
                {categories.map((c) => (
                    <li key={c.category}>
                        <div className="breakdown-head">
                            <span className="breakdown-name">{c.category}</span>
                            <span className="breakdown-value mono">{money(c.total)}</span>
                        </div>
                        <div className="breakdown-track">
                            <div className="breakdown-fill"
                                 style={{ width: `${Math.max(percent(c.total, max), 2)}%` }} />
                        </div>
                        <span className="breakdown-count">
                            {c.count} {c.count === 1 ? "entry" : "entries"} ·{" "}
                            {percent(c.total, total)}% of spend
                        </span>
                    </li>
                ))}
            </ul>
        </section>
    );
};

export default CategoryBreakdown;
