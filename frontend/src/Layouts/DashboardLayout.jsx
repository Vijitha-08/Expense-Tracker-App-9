import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
    FiTrendingUp, FiLogOut, FiShield, FiUser, FiSun, FiMoon, FiMenu, FiX,
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
