import {
  FiCreditCard, FiTrendingUp, FiPieChart,
  FiBarChart2, FiLock, FiSmartphone,
} from "react-icons/fi";
import "./../styles/About.css";

const aboutData = [
  { Icon: FiCreditCard, title: "Expense Tracking",
    description: "Record every expense in one place and keep a clear history." },
  { Icon: FiTrendingUp, title: "Income Management",
    description: "Track all your income sources alongside your spending." },
  { Icon: FiPieChart, title: "Budget Planning",
    description: "Create monthly budgets and control your spending effectively." },
  { Icon: FiBarChart2, title: "Spending Analytics",
    description: "Analyze your spending habits using reports and insightful charts." },
  { Icon: FiLock, title: "Secure Data",
    description: "Your financial information is encrypted and stored securely." },
  { Icon: FiSmartphone, title: "Access Anywhere",
    description: "Use the application smoothly on desktop, tablet, and mobile devices." },
];

const About = () => (
  <section className="about-section" id="about">
    <p className="about-tag">ABOUT EXPENSE TRACKER</p>
    <h2>Built to Make Expense Management Simple</h2>

    <p className="about-description">
      Our Expense Tracker helps you record income and expenses,
      create budgets, analyze spending habits, and achieve your
      financial goals with a simple, secure, and user-friendly platform.
    </p>

    <div className="about-grid">
      {aboutData.map(({ Icon, title, description }) => (
        <div className="about-card" key={title}>
          <div className="about-icon" aria-hidden="true"><Icon /></div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
      ))}
    </div>
  </section>
);

export default About;
