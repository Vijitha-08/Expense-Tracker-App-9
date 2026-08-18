import { useState } from "react";
import { FiAlertCircle } from "react-icons/fi";

// A fixed list with an Others escape hatch, replacing what used to be a bare
// text input. The old comment said free text was deliberate - "the category is
// whatever the user types" - and the data shows what that cost: the same
// database now holds "travel" AND "Travel" as two separate categories, plus
// "Accomodation" misspelled, so they report as different things and the totals
// split across them.
//
// The list stops NEW drift. Others keeps the field open for anything the list
// does not cover, and is also the fallback for an EXISTING row whose category
// is not on the list - so opening an old expense to edit it shows its real
// value in the text box rather than silently rewriting it to something else.
const CATEGORIES = [
    "Accommodation",
    "Utilities",
    "Groceries",
    "Travel",
    "Party",
    "Loan & EMI",
];

// A sentinel, not a real category: it must never be submitted. The double
// underscores make that obvious at a glance and cannot collide with a category
// someone actually types.
const OTHER = "__other__";

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
    // Which row of the dropdown is showing. Held separately from
    // `form.category` because two different states map to the same stored
    // value: "Others is selected and the box is still empty" and "nothing is
    // selected yet" would otherwise be indistinguishable.
    const [catChoice, setCatChoice] = useState(() => {
        const c = editing?.category || "";
        if (!c) return "";
        return CATEGORIES.includes(c) ? c : OTHER;
    });

    const [error, setError] = useState("");
    const [busy, setBusy] = useState(false);

    const handleChange = (e) => {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
        setError("");
    };

    const handleCategoryChoice = (e) => {
        const value = e.target.value;
        setCatChoice(value);
        // Choosing Others CLEARS the stored value so the text box starts empty,
        // rather than carrying the previous selection in as a default the user
        // never typed. Note this only runs on a real change event, so an
        // existing row that opens on Others keeps its value.
        setForm((prev) => ({ ...prev, category: value === OTHER ? "" : value }));
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
                setCatChoice("");
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
                    <select
                        name="categoryChoice"
                        value={catChoice}
                        onChange={handleCategoryChoice}
                    >
                        <option value="">Select a category</option>
                        {CATEGORIES.map((c) => (
                            <option key={c} value={c}>{c}</option>
                        ))}
                        <option value={OTHER}>Others</option>
                    </select>

                    {/* Rendered inside the same <label> rather than as a sibling:
                        `.form-row` is a two-column grid, so a third child would
                        push Date onto its own row. `.dash label` already stacks
                        its contents, so the box simply appears under the
                        dropdown. maxLength mirrors the VARCHAR(50) column so
                        nothing is silently cut on the way to the database. */}
                    {catChoice === OTHER && (
                        <input
                            name="category"
                            value={form.category}
                            onChange={handleChange}
                            placeholder="Type a category"
                            maxLength={50}
                            aria-label="Custom category"
                            autoFocus
                        />
                    )}
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
