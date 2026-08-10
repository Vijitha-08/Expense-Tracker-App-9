// `tone` colours the card (ok / warn / bad / accent) and `Icon` is optional, so
// the same grid serves the user's four personal figures and the admin's four
// organisation-wide ones.
const StatCards = ({ items }) => (
    <div className="stat-grid">
        {items.map(({ label, value, sub, tone, Icon }) => (
            <div key={label} className={`stat-card${tone ? ` tone-${tone}` : ""}`}>
                <div className="stat-top">
                    <span className="stat-label">{label}</span>
                    {Icon && (
                        <span className="stat-icon" aria-hidden="true">
                            <Icon />
                        </span>
                    )}
                </div>
                <span className="stat-value">{value}</span>
                {sub && <span className="stat-sub">{sub}</span>}
            </div>
        ))}
    </div>
);

export default StatCards;
