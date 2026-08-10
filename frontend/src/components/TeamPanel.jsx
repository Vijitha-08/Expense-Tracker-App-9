import { useState } from "react";
import { FiUserPlus, FiShield, FiUser, FiAlertCircle, FiCheckCircle } from "react-icons/fi";
import { money, shortDate } from "../services/format";

// Admin-only. This panel is why open admin self-registration can stay closed
// after the first account: a real admin adds the rest from here.
const TeamPanel = ({ people, admins, onAdd }) => {
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState({ name: "", email: "", password: "", role: "user" });
    const [error, setError] = useState("");
    const [done, setDone] = useState("");
    const [busy, setBusy] = useState(false);

    const change = (e) => {
        setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));
        setError("");
        setDone("");
    };

    const submit = async (e) => {
        e.preventDefault();
        if (!form.name.trim()) return setError("Name is required");
        if (form.password.length < 8) return setError("Password must be at least 8 characters");

        setBusy(true);
        setError("");
        try {
            const created = await onAdd(form);
            setDone(`${created.name} was added as ${created.role}.`);
            setForm({ name: "", email: "", password: "", role: "user" });
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <section className="panel">
            <div className="panel-head">
                <h3>Users</h3>
                <button className="btn btn-tiny btn-primary" onClick={() => setOpen((v) => !v)}>
                    <FiUserPlus aria-hidden="true" /> {open ? "Close" : "Add user"}
                </button>
            </div>

            {open && (
                <form className="team-form" onSubmit={submit} noValidate>
                    {error && (
                        <div className="alert alert-error" role="alert">
                            <FiAlertCircle aria-hidden="true" /> {error}
                        </div>
                    )}
                    {done && (
                        <div className="alert alert-ok" role="status">
                            <FiCheckCircle aria-hidden="true" /> {done}
                        </div>
                    )}

                    <div className="form-row">
                        <label>
                            Full name
                            <input name="name" value={form.name} onChange={change}
                                   placeholder="e.g. Priya Sharma" required />
                        </label>
                        <label>
                            Email
                            <input name="email" type="email" value={form.email} onChange={change}
                                   placeholder="name@example.com" required />
                        </label>
                    </div>

                    <div className="form-row">
                        <label>
                            Temporary password
                            <input name="password" type="password" value={form.password}
                                   onChange={change} placeholder="At least 8 characters" required />
                        </label>
                        <label>
                            Role
                            <select name="role" value={form.role} onChange={change}>
                                <option value="user">User - submits expenses</option>
                                <option value="admin">Admin - sees all expenses</option>
                            </select>
                        </label>
                    </div>

                    <p className="form-hint">
                        Share the password with them and ask them to change it after signing in.
                    </p>

                    <div className="form-actions">
                        <button type="submit" className="btn btn-primary" disabled={busy}>
                            {busy ? "Adding..." : "Add user"}
                        </button>
                    </div>
                </form>
            )}

            <div className="table-wrap">
                <table className="expense-table">
                    <thead>
                        <tr>
                            <th>Member</th>
                            <th>Role</th>
                            <th>Joined</th>
                            <th className="right">Expenses</th>
                            <th className="right">Total spend</th>
                        </tr>
                    </thead>
                    <tbody>
                        {admins.map((a) => (
                            <tr key={`admin-${a.id}`}>
                                <td>
                                    <div className="owner-cell">
                                        <span className="avatar avatar-admin" aria-hidden="true">
                                            {(a.name || "?").charAt(0).toUpperCase()}
                                        </span>
                                        <span>
                                            <strong>{a.name}</strong>
                                            <small>{a.email}</small>
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <span className="role-chip role-admin">
                                        <FiShield aria-hidden="true" /> Admin
                                    </span>
                                </td>
                                <td className="nowrap">{shortDate(a.created_at)}</td>
                                {/* Admins oversee expenses, they do not file them,
                                    so there is nothing to count here. */}
                                <td className="right muted-cell">—</td>
                                <td className="right muted-cell">—</td>
                            </tr>
                        ))}

                        {people.map((p) => (
                            <tr key={`user-${p.id}`}>
                                <td>
                                    <div className="owner-cell">
                                        <span className="avatar" aria-hidden="true">
                                            {(p.name || "?").charAt(0).toUpperCase()}
                                        </span>
                                        <span>
                                            <strong>{p.name}</strong>
                                            <small>{p.email}</small>
                                        </span>
                                    </div>
                                </td>
                                <td>
                                    <span className="role-chip role-user">
                                        <FiUser aria-hidden="true" /> User
                                    </span>
                                </td>
                                <td className="nowrap">{shortDate(p.created_at)}</td>
                                <td className="right mono">{p.count}</td>
                                <td className="right mono">{money(p.total)}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </section>
    );
};

export default TeamPanel;
