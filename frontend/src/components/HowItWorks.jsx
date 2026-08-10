import "../styles/HowItWorks.css";
const HowItWorks = () => {
  return (
    <section id ="howItWorks" className="how-it-works-section">
      <h2>How It Works</h2>

      <div className="steps">
        <div className="step">
          <h3>1. Add Income & Expenses</h3>
          <p>Record your daily income and expenses easily.</p>
        </div>

        <div className="step">
          <h3>2. Track Your Spending</h3>
          <p>View reports and charts to understand your spending habits.</p>
        </div>

        <div className="step">
          <h3>3. Achieve Your Goals</h3>
          <p>Set budgets and save more by monitoring your finances.</p>
        </div>
      </div>
    </section>
  );
};

export default HowItWorks;
