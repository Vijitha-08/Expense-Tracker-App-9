import { Link } from "react-router-dom";
import { FiArrowLeft, FiTrendingUp } from "react-icons/fi";
import "../styles/Login.css";

// Shared chrome for /login, /register and the role pages: brand bar,
// "Back to Home", and the two-column body. `left` is optional so the
// account-type chooser can render a single centred card.
const AuthShell = ({ left, children }) => (
    <div className="auth">
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
