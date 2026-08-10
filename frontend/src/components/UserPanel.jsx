import { FiUsers, FiCheckCircle, FiUserPlus, FiShield } from "react-icons/fi";

// The "user panel" the reviewer asked for: counts only, no bars, no charts.
// Design U5 - a small icon beside each number, matching the stat cards
// elsewhere on the page. Shown on both the Dashboard and the Users page.
//
// "Active" means the person has recorded at least one expense. That is defined
// in the backend (userModel.userCounts) and only described here.
const UserPanel = ({ counts = {} }) => {
    const items = [
        { label: "Total users",    value: counts.total     ?? 0, Icon: FiUsers },
        { label: "Active users",   value: counts.active    ?? 0, Icon: FiCheckCircle, tone: "ok" },
        { label: "New users",      value: counts.new_users ?? 0, Icon: FiUserPlus },
        { label: "Administrators", value: counts.admins    ?? 0, Icon: FiShield,      tone: "mut" },
    ];

    return (
        <div className="adm-upanel">
            {items.map(({ label, value, Icon, tone }) => (
                <div key={label} className={`adm-ig${tone ? ` adm-ig-${tone}` : ""}`}>
                    <span className="adm-ig-ico" aria-hidden="true"><Icon /></span>
                    <span>
                        <span className="adm-ig-n">{value}</span>
                        <span className="adm-ig-l">{label}</span>
                    </span>
                </div>
            ))}
        </div>
    );
};

export default UserPanel;
