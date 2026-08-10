import { Link } from "react-router-dom";

const Navbar = () => (
  <nav className="navbar">
    <div className="logo">
      <h2>ExpenseTracker</h2>
    </div>

    <ul className="nav-links">
      <li><Link to="/">Home</Link></li>
      <li><a href="#howItWorks">How It Works</a></li>
      <li><a href="#features">Features</a></li>
      <li><a href="#about">About</a></li>
      <li><a href="#contact">Contact</a></li>
    </ul>

    <div className="nav-actions">
      {/* Both are real links. "Get Started" used to be a <button> with no
          handler, so clicking it did nothing. */}
      <Link to="/login" className="nav-btn nav-btn--ghost">Log In</Link>
      <Link to="/register" className="nav-btn nav-btn--primary">Get Started</Link>
    </div>
  </nav>
);

export default Navbar;
