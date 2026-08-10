import { Link } from "react-router-dom";
import { FiTrendingUp } from "react-icons/fi";
import heroImage from "../assets/hero.png";

function Hero() {
  return (
    <section className="hero">
      <div className="hero-content">

        <div className="hero-text">
          <span className="hero-badge">
            <FiTrendingUp aria-hidden="true" /> SMART EXPENSE MANAGEMENT
          </span>

          <h1>
            Take Control of Your <br />
            <span>Expenses</span>
          </h1>

          <p>
            Track your income, monitor your expenses, create budgets,
            and achieve your financial goals with a modern and secure
            expense management system.
          </p>


          <div className="hero-buttons">
  <Link to="/register">
    <button className="primary-btn">
      Get Started
    </button>
  </Link>

  <button onClick={() => document.getElementById("about").scrollIntoView({ behavior: "smooth",})}>
    Learn More
  </button>
</div>

          <div className="stats">
            <div className="stat-card">
              <h3>10K+</h3>
              <p>Active Users</p>
            </div>

            <div className="stat-card">
              <h3>99%</h3>
              <p>Secure Data</p>
            </div>

            <div className="stat-card">
              <h3>₹2M+</h3>
              <p>Expenses Tracked</p>
            </div>
          </div>
        </div>

        <div className="hero-image">
          <img src={heroImage} alt="Expense Tracker" className="hero-image" />
        </div>
      </div>
    </section>
  );
}

export default Hero;





