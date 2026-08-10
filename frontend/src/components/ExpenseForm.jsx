import { useState } from "react";
import { FiAlertCircle } from "react-icons/fi";

const today = () => {
    // Local date, not toISOString(): in IST the UTC date is still yesterday
    // for the first 5.5 hours of every day, which would put a fresh expense
    // one day in the past and quietly fail the max= check below.
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(
        now.getDate()
    ).padStart(2, "0")}`;
};

// State is initialised from `editing` once. The parent passes a changing `key`
// so React remounts this form when the edit target changes - which replaces the
// old prop-to-state useEffect and its cascading re-render.
const ExpenseForm = ({
    onSubmit, editing, onCancelEdit,
    submitLabel = "Add Expense", bare = false,
}) => {
    const [form, setForm] = useState(() =>
        editing
            ? {
                title: editing.title,
                amount: String(editing.amount),
                category: editing.category,
                expenseDate: String(editing.expense_date).slice(0, 10),
                description: editing.description || "",
            }
            : { title: "", amount: "", category: "", expenseDate: today(), description: "" }
    );
    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const handleChange = (e) => {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
        setError("");
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (!form.title.trim()) return setError("Title is required");
        if (!(Number(form.amount) > 0)) return setError("Amount must be greater than 0");

        setBusy(true);
        try {
            await onSubmit({ ...form, amount: Number(form.amount) });
            if (!editing) {
                setForm({
                    title: "", amount: "", category: "",
                    expenseDate: today(), description: "",
                });
            }
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <form
            className={bare ? "expense-form" : "expense-form panel"}
            onSubmit={handleSubmit}
            noValidate
        >
            {!bare && <h3>{editing ? `Edit "${editing.title}"` : submitLabel}</h3>}

            {error && (
                <div className="alert alert-error" role="alert">
                    <FiAlertCircle aria-hidden="true" /> {error}
                </div>
            )}

            <div className="form-row">
                <label>
                    Title
                    <input name="title" value={form.title} onChange={handleChange}
                           placeholder="e.g. Client dinner" required />
                </label>
                <label>
                    Amount
                    <input name="amount" type="number" step="0.01" min="0.01"
                           value={form.amount} onChange={handleChange}
                           placeholder="0.00" required />
                </label>
            </div>

            <div className="form-row">
                <label>
                    Category
                    {/* Free text on purpose - the category is whatever the user
                        types (Food, Rent, OTT...), not a fixed list. maxLength
                        mirrors the VARCHAR(50) column so nothing is silently cut. */}
                    <input name="category" value={form.category} onChange={handleChange}
                           placeholder="e.g. Food, Rent, Travel" maxLength={50} />
                </label>
                <label>
                    Date
                    <input name="expenseDate" type="date" max={today()}
                           value={form.expenseDate} onChange={handleChange} required />
                </label>
            </div>

            <label>
                Notes <span className="optional">(optional)</span>
                <textarea name="description" rows={3} value={form.description}
                          onChange={handleChange}
                          placeholder="What was this for?" />
            </label>

            <div className="form-actions">
                <button type="submit" className="btn btn-primary" disabled={busy}>
                    {busy ? "Saving..." : editing ? "Save changes" : submitLabel}
                </button>
                {onCancelEdit && (
                    <button type="button" className="btn btn-ghost" onClick={onCancelEdit}>
                        Cancel
                    </button>
                )}
            </div>
        </form>
    );
};

export default ExpenseForm;
