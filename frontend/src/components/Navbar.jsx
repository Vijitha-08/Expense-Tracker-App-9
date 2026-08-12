import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { FiMenu, FiX } from "react-icons/fi";

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

        <div className="nav-actions">
          {/* Both are real links. "Get Started" used to be a <button> with no
              handler, so clicking it did nothing. */}
          <Link to="/login" className="nav-btn nav-btn--ghost" onClick={close}>Log In</Link>
          <Link to="/register" className="nav-btn nav-btn--primary" onClick={close}>Get Started</Link>
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
