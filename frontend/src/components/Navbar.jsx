import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FiMenu, FiX, FiSun, FiMoon } from "react-icons/fi";
import { useDisplay } from "../context/useDisplay";

// The five nav links sat in a flex row with a 30px gap, coming to 402px - wider
// than a 390px phone. That pushed the whole page canvas out to 782px, so every
// centred section below it centred inside 782 rather than 390 and appeared
// squeezed into the left half of the screen. One overflowing row, whole page
// broken.
//
// Below 900px the links move into a panel behind a menu button instead.
const LINKS = [
  { to: "/", label: "Home", hash: false },
  { to: "#howItWorks", label: "How It Works", hash: true },
  { to: "#features", label: "Features", hash: true },
  { to: "#about", label: "About", hash: true },
  { to: "#contact", label: "Contact", hash: true },
];

const Navbar = () => {
  const [open, setOpen] = useState(false);
  // The same preference the admin panel uses, so a visitor who picks dark here
  // is still dark after signing in. DisplayProvider wraps the whole router in
  // App.jsx, so this works for a signed-out visitor too.
  const { resolvedTheme, toggleTheme } = useDisplay();
  const dark = resolvedTheme === "dark";

  // A phone rotated to landscape can cross the breakpoint with the panel still
  // open, leaving it stuck over a desktop layout.
  useEffect(() => {
    const onResize = () => { if (window.innerWidth > 900) setOpen(false); };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Stop the page scrolling behind the open panel.
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const close = () => setOpen(false);

  return (
    <>
      <nav className={`navbar${open ? " navbar--open" : ""}`}>
        <div className="logo">
          <h2>ExpenseTracker</h2>
        </div>

        <button
          type="button"
          className="nav-toggle"
          aria-label={open ? "Close menu" : "Open menu"}
          aria-expanded={open}
          aria-controls="nav-links"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <FiX aria-hidden="true" /> : <FiMenu aria-hidden="true" />}
        </button>

        <ul className="nav-links" id="nav-links">
          {LINKS.map((l) => (
            <li key={l.label}>
              {l.hash
                ? <a href={l.to} onClick={close}>{l.label}</a>
                : <Link to={l.to} onClick={close}>{l.label}</Link>}
            </li>
          ))}
        </ul>

        {/* `.nav-right` groups the toggle with the two buttons so the bar still
            has THREE flex children on desktop and `justify-content:
            space-between` keeps putting the logo left, links centre, actions
            right. Added as a fourth direct child instead, the toggle would
            have redistributed that spacing.

            Below 900px `.nav-right` becomes `display: contents`, which removes
            its box and promotes both children back to flex items of the bar -
            so the toggle stays visible next to the menu button while
            `.nav-actions` keeps its existing behaviour of moving into the
            collapsed panel. Same technique as `.adm-side-top` in Admin.css.
            Without it the toggle would be hidden behind the menu on a phone. */}
        <div className="nav-right">
          <button
            type="button"
            className="nav-theme"
            onClick={toggleTheme}
            aria-label={dark ? "Switch to the light theme" : "Switch to the dark theme"}
            title={dark ? "Switch to light" : "Switch to dark"}
          >
            {dark ? <FiSun aria-hidden="true" /> : <FiMoon aria-hidden="true" />}
          </button>

          <div className="nav-actions">
            {/* Both are real links. "Get Started" used to be a <button> with no
                handler, so clicking it did nothing. */}
            <Link to="/login" className="nav-btn nav-btn--ghost" onClick={close}>Log In</Link>
            <Link to="/register" className="nav-btn nav-btn--primary" onClick={close}>Get Started</Link>
          </div>
        </div>
      </nav>

      {/* A SIBLING of the nav, not a child. As a child it sat inside the
          navbar's own stacking context, so it painted over the navbar's white
          background and greyed out the menu it was supposed to sit behind.
          Outside, the whole bar paints above it.
          Tapping it closes the menu - the expected gesture, and it means the
          menu can never trap you. */}
      {open && (
        <button type="button" className="nav-scrim" aria-label="Close menu" onClick={close} />
      )}
    </>
  );
};

export default Navbar;
