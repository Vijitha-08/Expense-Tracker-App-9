import {
  FiCreditCard, FiPieChart, FiFileText, FiLock,
  FiTrendingUp, FiFolder, FiBarChart2, FiSmartphone,
} from "react-icons/fi";
import "./../styles/Features.css";

const features = [
  { Icon: FiCreditCard, title: "Expense Tracking",
    description: "Track all your daily expenses in one place." },
  { Icon: FiPieChart, title: "Budget Planning",
    description: "Create monthly budgets and control your spending." },
  { Icon: FiFileText, title: "Expense Reports",
    description: "Generate reports to analyze your expenses." },
  { Icon: FiLock, title: "Secure Data",
    description: "Your financial information is protected securely." },
  { Icon: FiTrendingUp, title: "Income Management",
    description: "Record and manage all your income sources." },
  { Icon: FiFolder, title: "Expense Categories",
    description: "Organize expenses into categories like Food, Travel and Bills." },
  { Icon: FiBarChart2, title: "Monthly Analytics",
    description: "Understand spending habits with charts and insights." },
  { Icon: FiSmartphone, title: "Responsive Design",
    description: "Use the application smoothly on desktop and mobile." },
];

const Features = () => (
  <section id="features" className="features-section">
    <p className="feature-tag">SMART FEATURES</p>
    <h2>Everything You Need to Manage Expenses</h2>

    <div className="features-grid">
      {features.map(({ Icon, title, description }) => (
        <div className="feature-card" key={title}>
          <span className="feature-icon" aria-hidden="true"><Icon /></span>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      ))}
    </div>
  </section>
);

export default Features;
