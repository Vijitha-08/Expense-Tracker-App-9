import { FiShield } from "react-icons/fi";

// The marketing column: badge, headline, lead, feature pills and a quote card.
const AuthIntro = ({ badge, badgeIcon, title, highlight, lead, pills, quoteLabel, quoteText }) => (
    <>
        <span className="auth-badge">
            {badgeIcon}
            {badge}
        </span>

        <h1 className="auth-title">
            {title} {highlight && <><br /><span>{highlight}</span></>}
        </h1>

        <p className="auth-lead">{lead}</p>

        {pills.map(({ Icon, text }) => (
            <div className="auth-pill" key={text}>
                <Icon aria-hidden="true" />
                {text}
            </div>
        ))}

        {quoteText && (
            <div className="auth-quote">
                <span className="auth-quote-mark" aria-hidden="true"><FiShield /></span>
                <div>
                    <span className="auth-quote-label">{quoteLabel}</span>
                    <p className="auth-quote-text">{quoteText}</p>
                </div>
            </div>
        )}
    </>
);

export default AuthIntro;
