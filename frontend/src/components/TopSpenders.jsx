import { money, percent } from "../services/format";

// Admin-only: ranks the team by spend. A user has no way to see this, which is
// exactly the point - it is organisation-level information.
const TopSpenders = ({ people, limit = 6 }) => {
    const ranked = people.filter((p) => p.total > 0).slice(0, limit);

    if (!ranked.length) {
        return (
            <section className="panel">
                <div className="panel-head"><h3>Top spenders</h3></div>
                <div className="empty-state">No spending recorded yet.</div>
            </section>
        );
    }

    const max = Math.max(...ranked.map((p) => p.total), 1);
    const orgTotal = people.reduce((sum, p) => sum + Number(p.total), 0);

    return (
        <section className="panel">
            <div className="panel-head">
                <h3>Top spenders</h3>
                <span className="panel-note">Share of {money(orgTotal)}</span>
            </div>

            <ol className="spenders">
                {ranked.map((p, i) => (
                    <li key={p.id}>
                        <span className="spender-rank">{i + 1}</span>
                        <div className="spender-body">
                            <div className="spender-head">
                                <span className="spender-name">
                                    <strong>{p.name}</strong>
                                </span>
                                <span className="spender-value mono">{money(p.total)}</span>
                            </div>
                            <div className="breakdown-track">
                                <div
                                    className="breakdown-fill"
                                    style={{ width: `${Math.max(percent(p.total, max), 2)}%` }}
                                />
                            </div>
                            <span className="spender-sub">
                                {p.count} {p.count === 1 ? "expense" : "expenses"} ·{" "}
                                {percent(p.total, orgTotal)}% of total spend
                            </span>
                        </div>
                    </li>
                ))}
            </ol>
        </section>
    );
};

export default TopSpenders;
