import { useEffect, useRef } from "react";
import { FiX } from "react-icons/fi";
import ExpenseForm from "./ExpenseForm";

// A right-hand slide-over for adding or editing an expense. Real expense apps
// put the form behind a button rather than parking it permanently beside the
// data, which frees the whole width for the charts and the table.
//
// Accessibility is the part that is easy to get wrong on a hand-rolled drawer,
// so this handles all four of: Escape to close, backdrop click to close,
// focus moved in on open, and focus returned to the trigger on close.
const ExpenseDrawer = ({ open, onClose, editing, onSubmit }) => {
    const panelRef = useRef(null);
    const returnFocusTo = useRef(null);

    useEffect(() => {
        if (!open) return undefined;

        returnFocusTo.current = document.activeElement;
        // Focus the panel itself rather than the first input: screen readers
        // then announce the drawer heading before its fields.
        panelRef.current?.focus();

        const onKeyDown = (event) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKeyDown);

        // Stop the page behind from scrolling while the drawer is over it.
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";

        return () => {
            document.removeEventListener("keydown", onKeyDown);
            document.body.style.overflow = previousOverflow;
            if (returnFocusTo.current instanceof HTMLElement) {
                returnFocusTo.current.focus();
            }
        };
    }, [open, onClose]);

    if (!open) return null;

    return (
        <div className="drawer-root">
            {/* Not a <button>: a full-screen button would be announced as one
                interactive element covering the page. The Escape handler above
                is the keyboard route out. */}
            <div className="drawer-backdrop" onClick={onClose} aria-hidden="true" />

            <aside
                className="drawer"
                role="dialog"
                aria-modal="true"
                aria-label={editing ? "Edit expense" : "Add expense"}
                tabIndex={-1}
                ref={panelRef}
            >
                <header className="drawer-head">
                    <div>
                        <h2>{editing ? "Edit expense" : "New expense"}</h2>
                        <p className="drawer-sub">
                            {editing
                                ? "Update the details and save."
                                : "It is saved to your account straight away."}
                        </p>
                    </div>
                    <button type="button" className="drawer-close" onClick={onClose}
                            aria-label="Close">
                        <FiX />
                    </button>
                </header>

                <div className="drawer-body">
                    <ExpenseForm
                        key={editing?.id ?? "new"}
                        editing={editing}
                        onCancelEdit={onClose}
                        onSubmit={onSubmit}
                        submitLabel={editing ? "Save changes" : "Add expense"}
                        bare
                    />
                </div>
            </aside>
        </div>
    );
};

export default ExpenseDrawer;
