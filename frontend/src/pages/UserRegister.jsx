import { FiUser, FiLayers, FiPieChart, FiTrendingUp } from "react-icons/fi";
import RegisterForm from "./RegisterForm";

const UserRegister = () => (
  <RegisterForm
    role="user"
    badge="Join today"
    badgeIcon={<FiUser aria-hidden="true" />}
    title="Take control of your"
    highlight="spending."
    lead="Create your account to record everyday expenses, tag them by category, and see exactly where your money goes each month."
    pills={[
      { Icon: FiLayers, text: "Log an expense in seconds" },
      { Icon: FiPieChart, text: "Category breakdown at a glance" },
      { Icon: FiTrendingUp, text: "Monthly trend of your spending" },
    ]}
    quoteLabel="Secure registration"
    quoteText="Your password is hashed with bcrypt before it is stored, and other users can never see your expenses."
    cardBadge={<><FiUser aria-hidden="true" /> User account</>}
    cardTitle="Create your account"
    cardSub="Set up your account to start tracking your spending."
    note="Your expenses are visible only to you and the administrators."
  />
);

export default UserRegister;
