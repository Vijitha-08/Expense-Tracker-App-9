import { useState } from "react";
import { FiEdit2, FiTrash2 } from "react-icons/fi";
import { money, prettyDate } from "../services/format";

// `showOwner` turns this into the admin's all-expenses table; without it, it is
// the owner's own list. One component means the two views cannot drift apart
// in formatting the way the original duplicated pages did.
// `format` and `dateFormat` default to the exact/long helpers, so a caller that
// passes neither renders exactly as before. The user dashboard passes
// display.amount and display.date, which is what carries the estimate switch and
// the date-format choice into this table.
const ExpenseTable = ({
    expenses, onEdit, onDelete, showOwner = false,
    emptyText = "Nothing here yet.",
    format = money, dateFormat = prettyDate,
}) => {
    // Inline confirmation instead of window.confirm(): a native dialog blocks
    // the whole page, cannot be styled, and is awkward to drive in tests.
    const [confirmId, setConfirmId] = useState(null);

    if (!expenses.length) {
        return <div className="empty-state">{emptyText}</div>;
    }

    const hasActions = Boolean(onEdit || onDelete);

    return (
        <div className="table-wrap">
            <table className="expense-table">
                <thead>
                    <tr>
                        <th>Date</th>
                        {showOwner && <th>Added by</th>}
                        <th>Details</th>
                        <th>Category</th>
                        <th className="right">Amount</th>
                        {hasActions && <th className="right">Actions</th>}
                    </tr>
                </thead>
                <tbody>
                    {expenses.map((e) => {
                        const confirming = confirmId === e.id;

                        return (
                            <tr key={e.id}>
                                <td className="nowrap">{dateFormat(e.expense_date)}</td>

                                {showOwner && (
                                    <td>
                                        <div className="owner-cell">
                                            <span className="avatar" aria-hidden="true">
                                                {(e.owner_name || "?").charAt(0).toUpperCase()}
                                            </span>
                                            <span>
                                                <strong>{e.owner_name}</strong>
                                                <small>{e.owner_email}</small>
                                            </span>
                                        </div>
                                    </td>
                                )}

                                <td>
                                    <div className="title-cell">
                                        <strong>{e.title}</strong>
                                        {e.description && <small>{e.description}</small>}
                                    </div>
                                </td>

                                <td><span className="cat-chip">{e.category}</span></td>

                                <td className="right mono">{format(e.amount)}</td>

                                {hasActions && (
                                    <td className="right">
                                        {confirming ? (
                                            <span className="confirm-row">
                                                <button
                                                    className="btn btn-tiny btn-danger"
                                                    onClick={() => {
                                                        setConfirmId(null);
                                                        onDelete(e);
                                                    }}
                                                >
                                                    Confirm
                                                </button>
                                                <button
                                                    className="btn btn-tiny"
                                                    onClick={() => setConfirmId(null)}
                                                >
                                                    Keep
                                                </button>
                                            </span>
                                        ) : (
                                            <span className="action-row">
                                                {onEdit && (
                                                    <button className="btn btn-tiny"
                                                            onClick={() => onEdit(e)}>
                                                        <FiEdit2 aria-hidden="true" /> Edit
                                                    </button>
                                                )}
                                                {onDelete && (
                                                    <button className="btn btn-tiny btn-danger"
                                                            onClick={() => setConfirmId(e.id)}>
                                                        <FiTrash2 aria-hidden="true" /> Delete
                                                    </button>
                                                )}
                                            </span>
                                        )}
                                    </td>
                                )}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
};

export default ExpenseTable;
