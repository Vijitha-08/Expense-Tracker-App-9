import { Link } from "react-router-dom";
import {
  FiGlobe, FiFacebook, FiLinkedin, FiInstagram,
  FiMail, FiPhone, FiMapPin,
} from "react-icons/fi";

const Footer = () => (
  <footer className="footer">
    <div className="footer-container">

      <div className="footer-section">
        <h2>Expense Tracker</h2>
        <p>
          Manage your income and expenses with ease. Track spending,
          set budgets, and achieve your financial goals with our
          smart expense tracking platform.
        </p>

        <div className="social-icons">
          <a href="#" aria-label="Website"><FiGlobe /></a>
          <a href="#" aria-label="Facebook"><FiFacebook /></a>
          <a href="#" aria-label="LinkedIn"><FiLinkedin /></a>
          <a href="#" aria-label="Instagram"><FiInstagram /></a>
        </div>
      </div>

      <div className="footer-section">
        <h3>Quick Links</h3>
        <ul>
          <li><Link to="/">Home</Link></li>
          <li><Link to="/features">Features</Link></li>
          <li><Link to="/register">Register</Link></li>
          <li><Link to="/login">Login</Link></li>
        </ul>
      </div>

      <div className="footer-section">
        <h3>Contact Us</h3>
        <p><FiMail aria-hidden="true" /> support@expensetracker.com</p>
        <p><FiPhone aria-hidden="true" /> +91 98765 43210</p>
        <p><FiMapPin aria-hidden="true" /> Bangalore, Karnataka</p>
      </div>

    </div>

    <hr />

    <div className="footer-bottom">
      <p>&copy; 2026 Expense Tracker. All Rights Reserved.</p>

      <div className="footer-links">
        <a href="#">Privacy Policy</a>
        <a href="#">Terms &amp; Conditions</a>
        <a href="#">Cookie Policy</a>
      </div>
    </div>
  </footer>
);

export default Footer;
