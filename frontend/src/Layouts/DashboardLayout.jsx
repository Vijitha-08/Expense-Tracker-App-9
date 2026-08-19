import { useState, useEffect } from "react";
import { useNavigate, Link, NavLink } from "react-router-dom";
import {
    FiTrendingUp, FiLogOut, FiShield, FiUser, FiSun, FiMoon, FiMenu, FiX,
    FiGrid, FiSettings,
} from "react-icons/fi";
import { useAuth } from "../context/useAuth";
import { useDisplay } from "../context/useDisplay";
import "../styles/Dashboard.css";

const ROLE_LOOK = {
    admin: { label: "Administrator", Icon: FiShield },
    user:  { label: "User",          Icon: FiUser },
};

// Matches the existing 720px mobile block in Dashboard.css rather than the
// admin's 860px: this bar only ever holds a brand and two controls, so it has
// no reason to collapse as early as a 250px sidebar does.
const NAV_BREAKPOINT = 720;

// Two pages, listed here rather than hard-coded in the markup so a third one is
// one line. Both links show at every width: a Settings-only bar would leave
// somebody on Settings with no way back to the dashboard except the browser's
// back button, since the brand mark goes to the public home page.
const NAV = [
    { to: "/user/dashboard", label: "Dashboard", Icon: FiGrid },
    { to: "/user/settings",  label: "Settings",  Icon: FiSettings },
];

// Same two-initial rule as the admin sidebar's `.adm-avatar`. Two, not three:
// three initials on a 38px pip has to shrink the type to fit, and the pip is
// there to be recognised at a glance rather than read.
const initials = (name) =>
    String(name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();

// Shared chrome for the user pages: brand bar, page links, who is signed in,
// the theme control and log out, plus an optional row of section tabs. The
// Settings page passes tabs for its own sections; the dashboard does not.
const DashboardLayout = ({
    title, subtitle, children, actions, tabs, activeTab, onTabChange,
}) => {
    const { user, logout } = useAuth();
    // One-click flip, kept here as well as on Settings > Display: this is the
    // control you reach for while looking at the page, and Settings is where you
    // go to pick "System" again. Same shared preference as the navbar and the
    // admin sidebar.
    const { resolvedTheme, toggleTheme } = useDisplay();
    const dark = resolvedTheme === "dark";
    const navigate = useNavigate();
    const [navOpen, setNavOpen] = useState(false);

    const role = ROLE_LOOK[user?.role] || { label: user?.role, Icon: FiUser };
    const RoleIcon = role.Icon;

    const closeNav = () => setNavOpen(false);

    // A phone rotated to landscape can cross the breakpoint with the drawer
    // open, stranding it over the desktop bar. Same guard as AdminLayout.
    useEffect(() => {
        const onResize = () => {
            if (window.innerWidth > NAV_BREAKPOINT) setNavOpen(false);
        };
        window.addEventListener("resize", onResize);
        return () => window.removeEventListener("resize", onResize);
    }, []);

    // Stop the page scrolling behind the open drawer.
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
        <div className={`dash dash-${user?.role || "user"}`}>
            <header className="dash-topbar">
                {/* `.dash-bar-top` and `.dash-side-panel` are `display: contents`
                    above 720px, so on a wide screen the brand and `.dash-user`
                    stay direct flex children of `.dash-topbar` exactly as
                    before and nothing about the desktop bar changes. Below it
                    they become real boxes: a bar, and a drawer beneath it. */}
                <div className="dash-bar-top">
                    <Link to="/" className="dash-brand" onClick={closeNav}>
                        <span className="dash-brand-mark" aria-hidden="true"><FiTrendingUp /></span>
                        <span className="dash-brand-name">EXPENSE TRACKER</span>
                    </Link>

                    <button
                        type="button"
                        className="dash-nav-toggle"
                        aria-label={navOpen ? "Close menu" : "Open menu"}
                        aria-expanded={navOpen}
                        aria-controls="dash-side-panel"
                        onClick={() => setNavOpen((v) => !v)}
                    >
                        {navOpen ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
                    </button>
                </div>

                <div
                    className={`dash-side-panel${navOpen ? " dash-side-panel--open" : ""}`}
                    id="dash-side-panel"
                >
                    <div className="dash-user">
                        <nav className="dash-nav" aria-label="Your pages">
                            {/* The admin sidebar's group heading, matched here.
                                Inside the <nav> rather than beside it so the
                                drawer's own column layout puts it directly over
                                the links with no extra wrapper; CSS hides it
                                above 720px, where the bar has no room for a
                                heading and does not need one. */}
                            <p className="dash-nav-label">Overview</p>
                            {NAV.map(({ to, label, Icon }) => (
                                <NavLink
                                    key={to}
                                    to={to}
                                    className={({ isActive }) =>
                                        `dash-nav-link${isActive ? " dash-nav-on" : ""}`
                                    }
                                    onClick={closeNav}
                                >
                                    <Icon aria-hidden="true" />
                                    {label}
                                </NavLink>
                            ))}
                        </nav>
                        <span className="dash-user-meta">
                            {/* Drawer-only, by CSS. The desktop bar hides the
                                name itself at that width for room, so a pip
                                beside a hidden name would be decoration. */}
                            <span className="dash-avatar" aria-hidden="true">
                                {initials(user?.name)}
                            </span>
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
                            {/* Revealed only inside the drawer. One element with a
                                hidden label beats a second icon-only button that
                                exists purely for the other breakpoint - two
                                buttons for one action is two things to keep in
                                sync, and both would be in the tab order. */}
                            <span className="dash-theme-label">
                                {dark ? "Light theme" : "Dark theme"}
                            </span>
                        </button>
                        <button className="btn btn-ghost dash-logout" onClick={handleLogout}>
                            <FiLogOut aria-hidden="true" /> Log out
                        </button>
                    </div>
                </div>
            </header>

            {/* Sibling of the header, not a child: inside it the scrim would join
                the sticky bar's stacking context and paint over the bar it is
                meant to sit behind. Tapping it closes the drawer, so the menu
                can never trap you. */}
            {navOpen && (
                <button
                    type="button"
                    className="dash-scrim"
                    aria-label="Close menu"
                    onClick={closeNav}
                />
            )}

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
