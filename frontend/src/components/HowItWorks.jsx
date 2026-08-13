import "../styles/HowItWorks.css";
import useCardRail from "./useCardRail";

const HowItWorks = () => {
  // Horizontal rail + auto-advance below 768px only; a no-op above it.
  const stepsRef = useCardRail();

  return (
    <section id ="howItWorks" className="how-it-works-section">
      <h2>How It Works</h2>

      <div className="steps" ref={stepsRef}>
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
