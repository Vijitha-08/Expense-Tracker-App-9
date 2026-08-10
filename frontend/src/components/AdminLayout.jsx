import { NavLink, useNavigate } from "react-router-dom";
import {
    FiTrendingUp, FiLogOut, FiGrid, FiUsers, FiBarChart2,
    FiFileText, FiList, FiSettings,
} from "react-icons/fi";
import { useAuth } from "../context/useAuth";
import "../styles/Admin.css";

// Sidebar chrome for every admin page. The user dashboard keeps the old
// DashboardLayout top bar - the two roles are meant to read as different
// products, and a permanent admin sidebar is the clearest way to say so.
//
// Order matters and was chosen by the reviewer: Users sits directly under
// Dashboard, and Settings is separated into its own group at the bottom.
const NAV = [
    { group: "Overview", items: [
        { to: "/admin/dashboard", label: "Dashboard",    Icon: FiGrid },
        { to: "/admin/users",     label: "Users",        Icon: FiUsers,     count: "users" },
        { to: "/admin/insights",  label: "Insights",     Icon: FiBarChart2 },
        { to: "/admin/reports",   label: "Reports",      Icon: FiFileText },
        { to: "/admin/expenses",  label: "All expenses", Icon: FiList,      count: "expenses" },
    ]},
    { group: "System", items: [
        { to: "/admin/settings",  label: "Settings",     Icon: FiSettings },
    ]},
];

const initials = (name) =>
    String(name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();

const AdminLayout = ({ title, subtitle, actions, children, counts = {} }) => {
    const { user, logout } = useAuth();
    const navigate = useNavigate();

    const handleLogout = () => {
        logout();
        navigate("/login", { replace: true });
    };

    return (
        <div className="adm">
            <aside className="adm-side">
                <div className="adm-brand">
                    <span className="adm-brand-mark" aria-hidden="true"><FiTrendingUp /></span>
                    <span className="adm-brand-text">
                        <b>Expense Tracker</b>
                        <small>Admin panel</small>
                    </span>
                </div>

                {NAV.map((section) => (
                    <div key={section.group}>
                        <p className="adm-nav-label">{section.group}</p>
                        <nav className="adm-nav">
                            {section.items.map(({ to, label, Icon, count }) => (
                                <NavLink
                                    key={to}
                                    to={to}
                                    className={({ isActive }) =>
                                        `adm-nav-link${isActive ? " adm-nav-on" : ""}`
                                    }
                                >
                                    <Icon aria-hidden="true" />
                                    {label}
                                    {count && counts[count] > 0 && (
                                        <span className="adm-count">{counts[count]}</span>
                                    )}
                                </NavLink>
                            ))}
                        </nav>
                    </div>
                ))}

                <div className="adm-side-foot">
                    <div className="adm-me">
                        <span className="adm-avatar">{initials(user?.name)}</span>
                        <span className="adm-me-text">
                            <b>{user?.name}</b>
                            <small>Administrator</small>
                        </span>
                    </div>
                    <button type="button" className="adm-logout" onClick={handleLogout}>
                        <FiLogOut aria-hidden="true" /> Log out
                    </button>
                </div>
            </aside>

            <main className="adm-main">
                <div className="adm-head">
                    <div>
                        <h1>{title}</h1>
                        {subtitle && <p>{subtitle}</p>}
                    </div>
                    {actions && <div className="adm-head-right">{actions}</div>}
                </div>
                {children}
            </main>
        </div>
    );
};

export default AdminLayout;
