import { Link } from "react-router-dom";
import { FiArrowLeft, FiTrendingUp } from "react-icons/fi";
import "../styles/Login.css";

// Shared chrome for /login, /register and the role pages: brand bar,
// "Back to Home", and the two-column body. `left` is optional so the
// account-type chooser can render a single centred card.
// `variant` adds an `auth--<variant>` class, kept as a hook for any page
// that later needs layout the others should not get. The form-first
// reorder no longer uses it - it applies to every auth page now (PART B
// in Login.css), since all four measured the same: form below the fold.
const AuthShell = ({ left, variant, children }) => (
    <div className={`auth${variant ? ` auth--${variant}` : ""}`}>
        <header className="auth-topbar">
            <Link to="/" className="auth-brand">
                <span className="auth-brand-mark" aria-hidden="true"><FiTrendingUp /></span>
                <span>
                    <span className="auth-brand-name">EXPENSE TRACKER</span>
                    <span className="auth-brand-sub">Track and manage team expenses</span>
                </span>
            </Link>

            <Link to="/" className="auth-back">
                <FiArrowLeft aria-hidden="true" /> Back to Home
            </Link>
        </header>

        <div className={`auth-body${left ? "" : " auth-body--single"}`}>
            {left && <div className="auth-left">{left}</div>}
            <div className="auth-card">{children}</div>
        </div>
    </div>
);

export default AuthShell;
