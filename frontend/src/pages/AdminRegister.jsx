import { FiShield, FiBarChart2, FiUsers, FiList } from "react-icons/fi";
import RegisterForm from "./RegisterForm";

const AdminRegister = () => (
  <RegisterForm
    role="admin"
    badge="For administrators"
    badgeIcon={<FiShield aria-hidden="true" />}
    title="See what everyone"
    highlight="actually spends."
    lead="An administrator account sees every expense recorded, with overall charts and top spenders, and manages user accounts."
    pills={[
      { Icon: FiList, text: "Every user's expenses in one table" },
      { Icon: FiBarChart2, text: "Overall spend and top spenders" },
      { Icon: FiUsers, text: "Add and manage user accounts" },
    ]}
    quoteLabel="First administrator"
    quoteText="Only the first administrator can sign up here. After that, new admins are added from inside the Users panel."
    cardBadge={<><FiShield aria-hidden="true" /> Administrator</>}
    cardTitle="Create the admin account"
    cardSub="This account can see everyone's expenses, so it is set up once."
    note="An administrator does not record expenses of their own."
  />
);

export default AdminRegister;
