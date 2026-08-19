import { useState, useEffect } from "react";
import { useNavigate, Link, NavLink } from "react-router-dom";
import {
    FiTrendingUp, FiLogOut, FiSun, FiMoon, FiMenu, FiX,
    FiGrid, FiSettings,
} from "react-icons/fi";
import { useAuth } from "../context/useAuth";
import { useDisplay } from "../context/useDisplay";
import "../styles/Dashboard.css";

const ROLE_LABEL = { admin: "Administrator", user: "User" };

// 860px, the same figure AdminLayout uses, and deliberately not the 720px this
// file used when the chrome was a top bar. A 250px sidebar beside a table needs
// the same room whichever half of the app it is in, and two different collapse
// points between the user and admin sides is the kind of inconsistency somebody
// notices the first time they resize a window with both open.
const NAV_BREAKPOINT = 860;

// Two pages, listed here rather than hard-coded in the markup so a third one is
// one line. Grouped under a heading the way the admin nav is, because the shape
// has to survive a second group being added.
const NAV = [
    { group: "Overview", items: [
        { to: "/user/dashboard", label: "Dashboard", Icon: FiGrid },
        { to: "/user/settings",  label: "Settings",  Icon: FiSettings },
    ]},
];

// Same two-initial rule as the admin sidebar's `.adm-avatar`. Two, not three:
// three initials on a 34px pip has to shrink the type to fit, and the pip is
// there to be recognised at a glance rather than read.
const initials = (name) =>
    String(name || "?")
        .trim()
        .split(/\s+/)
        .slice(0, 2)
        .map((w) => w[0])
        .join("")
        .toUpperCase();

// Shared chrome for the user pages.
//
// WHAT CHANGED AND WHY: this was a sticky top bar with the brand on the left and
// the name, theme button and Log out on the right, plus a mobile drawer added in
// an earlier round. It is now the same structure as AdminLayout - a permanent
// 250px sidebar that collapses to that same drawer below 860px - because the two
// halves of the app were navigated in two different ways, and the user side had
// no side panel at all on a laptop.
//
// The sidebar is on the LIGHT surface, not the admin's navy. The `.dash` tokens
// are the light set, the drawer that shipped in the previous round was already
// light and was signed off that way, and painting this navy would make the user
// dashboard read as the admin panel rather than as its counterpart. Structure,
// geometry and behaviour are the admin's; the palette stays the user's.
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

    // Closed from the link's own onClick rather than an effect on the pathname:
    // setState inside an effect causes a second render pass, and the click is
    // the moment we actually know the panel should go.
    const closeNav = () => setNavOpen(false);

    // A phone rotated to landscape can cross the breakpoint with the drawer
    // open, stranding it over the desktop sidebar. Same guard as AdminLayout.
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
            <aside className={`dash-side${navOpen ? " dash-side--open" : ""}`}>
                {/* `.dash-side-top` and `.dash-side-panel` are `display: contents`
                    above 860px, so on a wide screen the brand, the nav and the
                    footer are direct flex children of `.dash-side` and
                    `margin-top: auto` on the footer still pins Log out to the
                    bottom. Below it they become real boxes: a bar, and a drawer
                    beneath it. Same trick AdminLayout uses, for the same
                    reason. */}
                <div className="dash-side-top">
                    <Link to="/" className="dash-brand" onClick={closeNav}>
                        <span className="dash-brand-mark" aria-hidden="true"><FiTrendingUp /></span>
                        <span className="dash-brand-text">
                            <b>Expense Tracker</b>
                            <small>Your expenses</small>
                        </span>
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

                <div className="dash-side-panel" id="dash-side-panel">
                    {NAV.map((section) => (
                        <div key={section.group}>
                            <p className="dash-nav-label">{section.group}</p>
                            <nav className="dash-nav" aria-label={section.group}>
                                {section.items.map(({ to, label, Icon }) => (
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
                        </div>
                    ))}

                    <div className="dash-side-foot">
                        <div className="dash-me">
                            <span className="dash-avatar" aria-hidden="true">
                                {initials(user?.name)}
                            </span>
                            <span className="dash-me-text">
                                <b>{user?.name}</b>
                                <small>{ROLE_LABEL[user?.role] || user?.role}</small>
                            </span>
                            {/* One click to flip, next to the signed-in name where
                                this control usually lives. It writes an explicit
                                "light" or "dark", so using it opts out of following
                                the device - Settings > Display is where you get
                                "System" back, and it says so in the tooltip. */}
                            <button
                                type="button"
                                className="dash-theme"
                                onClick={toggleTheme}
                                aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
                                title={dark
                                    ? "Switch to light (Settings › Display to follow your device)"
                                    : "Switch to dark (Settings › Display to follow your device)"}
                            >
                                {dark ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
                                <span className="dash-theme-label">
                                    {dark ? "Light theme" : "Dark theme"}
                                </span>
                            </button>
                        </div>
                        <button type="button" className="dash-logout" onClick={handleLogout}>
                            <FiLogOut aria-hidden="true" /> Log out
                        </button>
                    </div>
                </div>
            </aside>

            {/* Sibling of the aside, not a child: inside it the scrim would join
                the sidebar's stacking context and paint over the bar it is meant
                to sit behind - the bug that made this drawer render dimmed two
                rounds ago. Tapping it closes the drawer, so the menu can never
                trap you. */}
            {navOpen && (
                <button
                    type="button"
                    className="dash-scrim"
                    aria-label="Close menu"
                    onClick={closeNav}
                />
            )}

            <main className="dash-main">
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

                <div className="dash-body">{children}</div>
            </main>
        </div>
    );
};

export default DashboardLayout;
