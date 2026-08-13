import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
    FiSearch, FiPlus, FiAlertCircle, FiCheckCircle, FiLock, FiFileText,
} from "react-icons/fi";
import AdminLayout from "../Layouts/AdminLayout";
import UserPanel from "../components/UserPanel";
import { useDisplay } from "../context/useDisplay";
import * as admin from "../services/adminService";

// Design P3: accounts grouped by role on the left, the selected account's
// details on the right. Same shape as Reports, so the two pages feel like one
// application rather than two.
const initials = (name) =>
    String(name || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase();

const BLANK = { name: "", email: "", password: "", role: "user" };

const AdminUsers = () => {
    const display = useDisplay();
    const [query, setQuery] = useState("");
    const [selectedId, setSelectedId] = useState(null);
    const [state, setState] = useState({ people: [], counts: {}, error: "", loading: true });
    const [adding, setAdding] = useState(false);
    const [form, setForm] = useState(BLANK);
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [formError, setFormError] = useState("");
    const alive = useRef(true);

    const load = useCallback(
        () =>
            admin.getPeople()
                .then(({ people, counts }) => {
                    if (!alive.current) return;
                    setState({ people, counts, error: "", loading: false });
                    setSelectedId((current) => current ?? people[0]?.id ?? null);
                })
                .catch((err) => {
                    if (alive.current) setState((p) => ({ ...p, error: err.message, loading: false }));
                }),
        []
    );

    useEffect(() => {
        alive.current = true;
        load();
        return () => { alive.current = false; };
    }, [load]);

    const { people, counts, error, loading } = state;

    const admins = people.filter((p) => p.role === "admin");
    const users = people.filter((p) => p.role === "user");

    const match = useCallback(
        (p) => p.name.toLowerCase().includes(query.trim().toLowerCase()),
        [query]
    );
    const visibleAdmins = useMemo(() => admins.filter(match), [admins, match]);
    const visibleUsers = useMemo(() => users.filter(match), [users, match]);

    const person = people.find((p) => p.id === selectedId) || null;

    const handleAdd = async (e) => {
        e.preventDefault();
        setFormError("");
        setBusy(true);
        try {
            const created = await admin.addTeamMember(form);
            setNotice(`${created.name} was added`);
            setForm(BLANK);
            setAdding(false);
            await load();
            setSelectedId(created.id);
        } catch (err) {
            setFormError(err.message);
        } finally {
            setBusy(false);
        }
    };

    return (
        <AdminLayout
            title="Users"
            subtitle="Every account on the app. Pick one to see its details."
            counts={{ users: counts.total }}
        >
            {error && (
                <div className="adm-alert" role="alert">
                    <FiAlertCircle aria-hidden="true" /> {error}
                </div>
            )}
            {notice && (
                <div className="adm-ok-msg" role="status">
                    <FiCheckCircle aria-hidden="true" /> {notice}
                </div>
            )}

            <UserPanel counts={counts} />

            <div className="adm-split">
                <div className="adm-list">
                    <div className="adm-list-head" style={{ padding: 0 }}>
                        <label className="adm-search" style={{ border: 0, boxShadow: "none", width: "100%" }}>
                            <FiSearch aria-hidden="true" />
                            <input
                                type="search"
                                value={query}
                                onChange={(e) => setQuery(e.target.value)}
                                placeholder="Search by name..."
                                aria-label="Search accounts by name"
                            />
                        </label>
                    </div>

                    {loading ? (
                        <p className="adm-empty">Loading...</p>
                    ) : (
                        <>
                            {/* The counts follow the search, and a group with
                                nothing left in it disappears rather than sitting
                                there as an empty heading. Searching for a name
                                that matches nobody used to print
                                "Administrators · 1" and "Users · 4" above a box
                                saying nobody matched. */}
                            {visibleAdmins.length > 0 && (
                                <div className="adm-list-grp">
                                    Administrators · {visibleAdmins.length}
                                </div>
                            )}
                            {visibleAdmins.map((p) => (
                                <PersonRow
                                    key={p.id} person={p} selected={p.id === selectedId}
                                    onSelect={setSelectedId} display={display} admin
                                />
                            ))}

                            {visibleUsers.length > 0 && (
                                <div className="adm-list-grp">Users · {visibleUsers.length}</div>
                            )}
                            {visibleUsers.map((p) => (
                                <PersonRow
                                    key={p.id} person={p} selected={p.id === selectedId}
                                    onSelect={setSelectedId} display={display}
                                />
                            ))}

                            {visibleAdmins.length === 0 && visibleUsers.length === 0 && (
                                <p className="adm-empty">
                                    {query.trim()
                                        ? `Nobody matches “${query.trim()}”.`
                                        : "No accounts yet."}
                                </p>
                            )}
                        </>
                    )}

                    <div className="adm-list-foot">
                        <button
                            type="button"
                            className="adm-btn adm-btn-primary"
                            onClick={() => { setAdding((v) => !v); setNotice(""); }}
                        >
                            <FiPlus aria-hidden="true" /> {adding ? "Cancel" : "Add a person"}
                        </button>
                    </div>
                </div>

                <div>
                    {adding && (
                        <form className="adm-panel" onSubmit={handleAdd}>
                            <div className="adm-panel-head"><h3>Add a person</h3></div>
                            {formError && (
                                <div className="adm-alert" role="alert">
                                    <FiAlertCircle aria-hidden="true" /> {formError}
                                </div>
                            )}
                            <div className="adm-row2">
                                <div className="adm-fld">
                                    <label htmlFor="np-name">Full name</label>
                                    <input id="np-name" value={form.name} required
                                           onChange={(e) => setForm({ ...form, name: e.target.value })} />
                                </div>
                                <div className="adm-fld">
                                    <label htmlFor="np-email">Email</label>
                                    <input id="np-email" type="email" value={form.email} required
                                           onChange={(e) => setForm({ ...form, email: e.target.value })} />
                                </div>
                            </div>
                            <div className="adm-row2">
                                <div className="adm-fld">
                                    <label htmlFor="np-pass">Temporary password</label>
                                    <input id="np-pass" type="password" value={form.password} required
                                           minLength={8}
                                           onChange={(e) => setForm({ ...form, password: e.target.value })} />
                                    <p className="adm-fld-hint">At least 8 characters. They can change it later.</p>
                                </div>
                                <div className="adm-fld">
                                    <label htmlFor="np-role">Role</label>
                                    <select id="np-role" className="adm-select" value={form.role}
                                            onChange={(e) => setForm({ ...form, role: e.target.value })}
                                            style={{ width: "100%", padding: "11px 14px" }}>
                                        <option value="user">User — records their own expenses</option>
                                        <option value="admin">Administrator — sees everyone</option>
                                    </select>
                                </div>
                            </div>
                            <div className="adm-actions">
                                <button type="button" className="adm-btn" onClick={() => setAdding(false)}>
                                    Cancel
                                </button>
                                <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                                    {busy ? "Adding..." : "Add person"}
                                </button>
                            </div>
                        </form>
                    )}

                    <div className="adm-panel">
                        {!person ? (
                            <p className="adm-empty">Pick an account on the left.</p>
                        ) : (
                            <>
                                <div className="adm-detail-head">
                                    <span className="adm-pip adm-pip-accent">{initials(person.name)}</span>
                                    <div>
                                        <h3>{person.name}</h3>
                                        <p>
                                            Joined {display.date(person.created_at)}
                                            {person.last_expense && ` · last expense ${display.date(person.last_expense)}`}
                                        </p>
                                        <span className={`adm-role adm-role-${person.role === "admin" ? "admin" : "user"}`}>
                                            {person.role === "admin" ? "Administrator" : "User"}
                                        </span>
                                    </div>
                                    {person.role === "user" && (
                                        <span className="adm-detail-acts">
                                            <Link className="adm-btn adm-btn-primary" to="/admin/reports">
                                                <FiFileText aria-hidden="true" /> Open their report
                                            </Link>
                                        </span>
                                    )}
                                </div>

                                <p className="adm-sub-label">Account details</p>
                                <table className="adm-table">
                                    <tbody>
                                        <tr><td className="adm-dim" style={{ width: 170 }}>Full name</td>
                                            <td><b>{person.name}</b></td></tr>
                                        <tr><td className="adm-dim">Email</td>
                                            <td>{person.email}</td></tr>
                                        <tr><td className="adm-dim">Role</td>
                                            <td>{person.role === "admin"
                                                ? "Administrator — sees everyone's expenses, records none"
                                                : "User — records their own expenses only"}</td></tr>
                                        <tr><td className="adm-dim">Joined</td>
                                            <td>{display.date(person.created_at)}</td></tr>
                                        <tr><td className="adm-dim">Password</td>
                                            <td className="adm-dim">
                                                Stored as a bcrypt hash. Nobody can read it, including administrators.
                                            </td></tr>
                                    </tbody>
                                </table>

                                {person.role === "user" && (
                                    <>
                                        <p className="adm-sub-label" style={{ marginTop: 24 }}>
                                            What they spend <span>— approximate</span>
                                        </p>
                                        <div className="adm-dstats adm-dstats-3">
                                            <div className="adm-ds adm-ds-hi">
                                                <div className="adm-ds-l">Their spend</div>
                                                <div className="adm-ds-v">{display.amount(person.total)}</div>
                                            </div>
                                            <div className="adm-ds">
                                                <div className="adm-ds-l">Expenses</div>
                                                <div className="adm-ds-v">{person.count}</div>
                                            </div>
                                            <div className="adm-ds">
                                                <div className="adm-ds-l">Largest one</div>
                                                <div className="adm-ds-v">{display.amount(person.largest)}</div>
                                            </div>
                                        </div>
                                    </>
                                )}

                                <p className="adm-note">
                                    <FiLock aria-hidden="true" />
                                    Administrators see full account details. Administrators oversee spending;
                                    they do not record expenses of their own.
                                </p>
                            </>
                        )}
                    </div>
                </div>
            </div>
        </AdminLayout>
    );
};

const PersonRow = ({ person, selected, onSelect, display, admin: isAdmin = false }) => (
    <button
        type="button"
        className={`adm-urow${selected ? " adm-urow-on" : ""}`}
        onClick={() => onSelect(person.id)}
    >
        <span className={`adm-pip${isAdmin ? " adm-pip-accent" : ""}`}>{initials(person.name)}</span>
        <span className="adm-urow-name">
            {person.name}
            <small>
                {isAdmin
                    ? "Administrator"
                    : person.count === 0
                        ? "nothing recorded yet"
                        : `${person.count} ${person.count === 1 ? "expense" : "expenses"} · ${display.amount(person.total)}`}
            </small>
        </span>
        <span className={`adm-dot${!isAdmin && person.count === 0 ? " adm-dot-off" : ""}`} />
    </button>
);

export default AdminUsers;
