import { FiCalendar } from "react-icons/fi";
import { PERIODS } from "../services/period";

// A dropdown, not a row of pills: chosen by the reviewer, and it stays one
// line tall no matter how many periods the list grows to.
const PeriodPicker = ({ value, onChange, label = "Period" }) => (
    <label className="adm-drop">
        <FiCalendar aria-hidden="true" />
        <span className="adm-drop-label">{label}</span>
        <select value={value} onChange={(e) => onChange(e.target.value)}
                aria-label="Period">
            {PERIODS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
            ))}
        </select>
    </label>
);

export default PeriodPicker;
