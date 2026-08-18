import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
    FiTrendingUp, FiLogOut, FiGrid, FiUsers, FiBarChart2,
    FiFileText, FiList, FiSettings, FiMenu, FiX, FiSun, FiMoon,
} from "react-icons/fi";
import { useAuth } from "../context/useAuth";
import { useDisplay } from "../context/useDisplay";
import "../styles/Admin.css";

// Below 860px the sidebar collapses to a bar with a menu button - measured, it
// was rendering its full 467px above the content on every admin page, which is
// 57% of an 812px phone screen spent on navigation before any number appears.
const NAV_BREAKPOINT = 860;

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
    const { resolvedTheme, toggleTheme } = useDisplay();
    const navigate = useNavigate();
    const [navOpen, setNavOpen] = useState(false);
    const dark = resolvedTheme === "dark";

    // Closed from the link's own onClick rather than an effect on the pathname:
    // setState inside an effect causes a second render pass, and the click is
    // the moment we actually know the panel should go.
    const closeNav = () => setNavOpen(false);

    // A phone rotated to landscape can cross the breakpoint while the panel is
    // open, stranding it over the desktop layout.
    useEffect(() => {
        const onResize = () => {
            if (window.innerWidth > NAV_BREAKPOINT) setNavOpen(false);
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Stop the page scrolling behind the open panel.
    useEffect(() => {
        if (!navOpen) return;
        const previous = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => { document.body.style.overflow = previous; };
    }, [navOpen]);

    const handleLogout = () => {
        logout();
        navigate("/login", { replace: true });
    };

    return (
        <div className="adm">
            <aside className={`adm-side${navOpen ? " adm-side--open" : ""}`}>
                {/* `.adm-side-top` and `.adm-side-panel` are `display: contents`
                    above 860px, so on desktop the brand, nav sections and footer
                    remain direct flex children of `.adm-side` exactly as before
                    and `margin-top: auto` still pins Log out to the bottom. */}
                <div className="adm-side-top">
                    <div className="adm-brand">
                        <span className="adm-brand-mark" aria-hidden="true"><FiTrendingUp /></span>
                        <span className="adm-brand-text">
                            <b>Expense Tracker</b>
                            <small>Admin panel</small>
                        </span>
                    </div>

                    <button
                        type="button"
                        className="adm-nav-toggle"
                        aria-label={navOpen ? "Close menu" : "Open menu"}
                        aria-expanded={navOpen}
                        aria-controls="adm-side-panel"
                        onClick={() => setNavOpen((v) => !v)}
                    >
                        {navOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
                    </button>
                </div>

                <div className="adm-side-panel" id="adm-side-panel">
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
                                    onClick={closeNav}
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
                        {/* One click to flip, next to the signed-in name where
                            this control usually lives. It writes an explicit
                            "light" or "dark", so using it opts out of following
                            the device - Settings > Display is where you get
                            "System" back, and it says so in the tooltip. */}
                        <button
                            type="button"
                            className="adm-theme-btn"
                            onClick={toggleTheme}
                            aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
                            title={dark
                                ? "Switch to light (Settings › Display to follow your device)"
                                : "Switch to dark (Settings › Display to follow your device)"}
                        >
                            {dark ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
                            {/* Revealed only inside the mobile drawer, where
                                there is room for a word. One element with a
                                hidden label beats a second icon-only button
                                that exists purely for the other breakpoint -
                                two buttons for one action is two things to keep
                                in sync, and both would be in the tab order. */}
                            <span className="adm-theme-label">
                                {dark ? "Light theme" : "Dark theme"}
                            </span>
                        </button>
                    </div>
                    <button type="button" className="adm-logout" onClick={handleLogout}>
                        <FiLogOut aria-hidden="true" /> Log out
                    </button>
                </div>
                </div>
            </aside>

            {/* Rendered as a sibling of the aside on purpose: inside it, the
                scrim would join the sidebar's own stacking context and paint
                over the navy bar it is supposed to sit behind. Tapping it
                closes the panel, so the menu can never trap you. */}
            {navOpen && (
                <button
                    type="button"
                    className="adm-scrim"
                    aria-label="Close menu"
                    onClick={closeNav}
                />
            )}

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
