import { useNavigate, Link } from "react-router-dom";
import { FiTrendingUp, FiLogOut, FiShield, FiUser, FiSun, FiMoon } from "react-icons/fi";
import { useAuth } from "../context/useAuth";
import { useDisplay } from "../context/useDisplay";
import "../styles/Dashboard.css";

const ROLE_LOOK = {
    admin: { label: "Administrator", Icon: FiShield },
    user:  { label: "User",          Icon: FiUser },
};

// Shared chrome for both dashboards: brand bar, who is signed in, log out, and
// an optional row of section tabs. The admin passes tabs; the user does not,
// which is part of why the two pages read as different products.
const DashboardLayout = ({
    title, subtitle, children, actions, tabs, activeTab, onTabChange,
}) => {
    const { user, logout } = useAuth();
    // The user side has no Settings page, so this bar is the only place a
    // theme control can live. Same shared preference as the navbar and the
    // admin sidebar.
    const { resolvedTheme, toggleTheme } = useDisplay();
    const dark = resolvedTheme === "dark";
    const navigate = useNavigate();

    const role = ROLE_LOOK[user?.role] || { label: user?.role, Icon: FiUser };
    const RoleIcon = role.Icon;

    const handleLogout = () => {
        logout();
        navigate("/login", { replace: true });
    };

    return (
        <div className={`dash dash-${user?.role || "user"}`}>
            <header className="dash-topbar">
                <Link to="/" className="dash-brand">
                    <span className="dash-brand-mark" aria-hidden="true"><FiTrendingUp /></span>
                    <span className="dash-brand-name">EXPENSE TRACKER</span>
                </Link>

                <div className="dash-user">
                    <span className="dash-user-meta">
                        <strong>{user?.name}</strong>
                        <span className={`role-chip role-${user?.role}`}>
                            <RoleIcon aria-hidden="true" /> {role.label}
                        </span>
                    </span>
                    <button
                        type="button"
                        className="dash-theme"
                        onClick={toggleTheme}
                        aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
                        title={dark ? "Switch to light" : "Switch to dark"}
                    >
                        {dark ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
                    </button>
                    <button className="btn btn-ghost" onClick={handleLogout}>
                        <FiLogOut aria-hidden="true" /> Log out
                    </button>
                </div>
            </header>

            <div className="dash-heading">
                <div>
                    <h1>{title}</h1>
                    {subtitle && <p className="dash-sub">{subtitle}</p>}
                </div>
                {actions && <div className="dash-heading-actions">{actions}</div>}
            </div>

            {tabs?.length > 0 && (
                <nav className="dash-tabs" aria-label="Dashboard sections">
                    {tabs.map((tab) => (
                        <button
                            key={tab.id}
                            type="button"
                            className={`dash-tab${activeTab === tab.id ? " dash-tab-active" : ""}`}
                            aria-current={activeTab === tab.id ? "page" : undefined}
                            onClick={() => onTabChange(tab.id)}
                        >
                            {tab.Icon && <tab.Icon aria-hidden="true" />}
                            {tab.label}
                            {tab.count > 0 && <span className="count-pill">{tab.count}</span>}
                        </button>
                    ))}
                </nav>
            )}

            <main className="dash-body">{children}</main>
        </div>
    );
};

export default DashboardLayout;
