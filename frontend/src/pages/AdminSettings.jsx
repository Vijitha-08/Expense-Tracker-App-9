import { useEffect, useState } from "react";
import {
    FiDownload, FiPlus, FiAlertCircle, FiCheckCircle, FiInfo,
} from "react-icons/fi";
import AdminLayout from "../components/AdminLayout";
import { useAuth } from "../context/useAuth";
import { useDisplay } from "../context/useDisplay";
import { PERIODS } from "../services/period";
import { money, moneyApprox } from "../services/format";
import * as admin from "../services/adminService";
import * as profile from "../services/profileService";

// Four sections: My account, Display, Administrators, Data.
//
// SCOPE NOTE, so nobody is surprised: My account, Add administrator and Export
// all talk to the API. The Display switches are stored in this browser
// (localStorage) rather than the database - they are cosmetic, and adding a
// settings table for four toggles would mean a migration and a read on every
// page load for no real gain. Delete and Reset are NOT built: they need
// destructive endpoints and confirmation flows, and deleting a user deletes
// every expense they recorded, so that is a decision to take deliberately
// rather than ship quietly.
const SAMPLE = 11054890;

const AdminSettings = () => {
    const { user, refresh } = useAuth();
    const display = useDisplay();

    const [tab, setTab] = useState("account");
    // Seeded from the signed-in user once. Re-syncing it in an effect would
    // fight the user's typing and trips the set-state-in-effect rule; the
    // <form key> below remounts it if the account itself changes.
    const [form, setForm] = useState(() => ({ name: user?.name || "", email: user?.email || "" }));
    const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");

    const [newAdmin, setNewAdmin] = useState({ name: "", email: "", password: "" });
    const [addingAdmin, setAddingAdmin] = useState(false);
    const [admins, setAdmins] = useState([]);

    useEffect(() => {
        admin.getPeople()
            .then(({ people }) => setAdmins(people.filter((p) => p.role === "admin")))
            .catch(() => setAdmins([]));
    }, []);

    const flash = (message) => {
        setNotice(message);
        setError("");
    };

    const saveProfile = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            await profile.updateProfile(form);
            // The signed-in name in the sidebar comes from the auth context, so
            // it has to be re-read or the header keeps showing the old name.
            if (refresh) await refresh();
            flash("Your account was updated");
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const savePassword = async (e) => {
        e.preventDefault();
        setError("");
        if (pw.newPassword !== pw.confirm) {
            setError("The two new passwords do not match");
            return;
        }
        setBusy(true);
        try {
            await profile.changePassword(pw);
            setPw({ currentPassword: "", newPassword: "", confirm: "" });
            flash("Your password was changed");
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const addAdmin = async (e) => {
        e.preventDefault();
        setBusy(true);
        setError("");
        try {
            const created = await admin.addTeamMember({ ...newAdmin, role: "admin" });
            setAdmins((list) => [...list, created]);
            setNewAdmin({ name: "", email: "", password: "" });
            setAddingAdmin(false);
            flash(`${created.name} is now an administrator`);
        } catch (err) {
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

    const TABS = [
        { id: "account", label: "My account" },
        { id: "display", label: "Display" },
        { id: "admins",  label: "Administrators" },
        { id: "data",    label: "Data" },
    ];

    return (
        <AdminLayout
            title="Settings"
            subtitle="Your account, how figures are shown, and who has administrator access."
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

            <div className="adm-tabs">
                {TABS.map((t) => (
                    <button
                        key={t.id}
                        type="button"
                        className={`adm-tab${tab === t.id ? " adm-tab-on" : ""}`}
                        onClick={() => { setTab(t.id); setNotice(""); setError(""); }}
                    >
                        {t.label}
                    </button>
                ))}
            </div>

            {tab === "account" && (
                <div className="adm-grid-2">
                    <form className="adm-panel" key={user?.id} onSubmit={saveProfile}>
                        <div className="adm-panel-head">
                            <h3>My account</h3>
                            <span className="adm-hint">Only affects your own login</span>
                        </div>
                        <div className="adm-row2">
                            <div className="adm-fld">
                                <label htmlFor="s-name">Full name</label>
                                <input id="s-name" value={form.name} required
                                       onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </div>
                            <div className="adm-fld">
                                <label htmlFor="s-email">Email</label>
                                <input id="s-email" type="email" value={form.email} required
                                       onChange={(e) => setForm({ ...form, email: e.target.value })} />
                            </div>
                        </div>
                        <p className="adm-fld-hint" style={{ marginBottom: 14 }}>
                            Your role cannot be changed here — an administrator demoting themselves
                            could lock everyone out of this panel.
                        </p>
                        <div className="adm-actions">
                            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                                {busy ? "Saving..." : "Save changes"}
                            </button>
                        </div>
                    </form>

                    <form className="adm-panel" onSubmit={savePassword}>
                        <div className="adm-panel-head"><h3>Change password</h3></div>
                        <div className="adm-fld">
                            <label htmlFor="s-cur">Current password</label>
                            <input id="s-cur" type="password" required value={pw.currentPassword}
                                   onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
                        </div>
                        <div className="adm-row2">
                            <div className="adm-fld">
                                <label htmlFor="s-new">New password</label>
                                <input id="s-new" type="password" required minLength={8} value={pw.newPassword}
                                       onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
                                <p className="adm-fld-hint">At least 8 characters. Stored as a bcrypt hash.</p>
                            </div>
                            <div className="adm-fld">
                                <label htmlFor="s-conf">Confirm new password</label>
                                <input id="s-conf" type="password" required value={pw.confirm}
                                       onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
                            </div>
                        </div>
                        <div className="adm-actions">
                            <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                                {busy ? "Saving..." : "Change password"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {tab === "display" && (
                <div className="adm-panel">
                    <div className="adm-panel-head">
                        <h3>Display</h3>
                        <span className="adm-hint">Saved in this browser</span>
                    </div>

                    <div className="adm-set-row">
                        <span className="adm-set-txt">
                            <b>Show estimated amounts</b>
                            <small>
                                {moneyApprox(SAMPLE)} instead of {money(SAMPLE)}.
                                Applies to cards, charts and tables.
                            </small>
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={display.estimated}
                            aria-label="Show estimated amounts"
                            className={`adm-switch${display.estimated ? " adm-switch-on" : ""}`}
                            onClick={() => display.set({ estimated: !display.estimated })}
                        >
                            <i />
                        </button>
                    </div>

                    <div className="adm-set-row">
                        <span className="adm-set-txt">
                            <b>Date format</b>
                            <small>How expense dates are written.</small>
                        </span>
                        <span className="adm-pick">
                            <button type="button"
                                    className={display.dateStyle === "long" ? "adm-pick-on" : ""}
                                    onClick={() => display.set({ dateStyle: "long" })}>07 Aug 2026</button>
                            <button type="button"
                                    className={display.dateStyle === "iso" ? "adm-pick-on" : ""}
                                    onClick={() => display.set({ dateStyle: "iso" })}>2026-08-07</button>
                        </span>
                    </div>

                    <div className="adm-set-row">
                        <span className="adm-set-txt">
                            <b>Default period</b>
                            <small>Which period Dashboard, Insights, Reports and All expenses open on.</small>
                        </span>
                        <label className="adm-select">
                            <select value={display.defaultPeriod}
                                    onChange={(e) => display.set({ defaultPeriod: e.target.value })}>
                                {PERIODS.map((p) => (
                                    <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <p className="adm-note">
                        <FiInfo aria-hidden="true" />
                        Estimated amounts round to the nearest lakh or crore, so individual rows will
                        not add up to the total exactly. Turn the switch off when a figure has to be
                        checked against a receipt. This setting covers the admin pages only —
                        everybody always sees their own expenses to the rupee.
                    </p>
                </div>
            )}

            {tab === "admins" && (
                <div className="adm-grid-2">
                    <div className="adm-panel">
                        <div className="adm-panel-head">
                            <h3>Administrators</h3>
                            <span className="adm-hint">{admins.length} with full access</span>
                        </div>
                        {admins.length === 0 ? (
                            <p className="adm-empty">Loading...</p>
                        ) : (
                            <table className="adm-table">
                                <tbody>
                                    {admins.map((a) => (
                                        <tr key={a.id}>
                                            <td>
                                                <span className="adm-who">
                                                    <span className="adm-pip adm-pip-accent">
                                                        {String(a.name).trim().split(/\s+/).slice(0, 2)
                                                            .map((w) => w[0]).join("").toUpperCase()}
                                                    </span>
                                                    <b>{a.name}</b>
                                                </span>
                                            </td>
                                            <td className="adm-dim">{a.email}</td>
                                            <td className="adm-right adm-dim">
                                                {a.id === user?.id ? "you" : ""}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                        <p className="adm-note">
                            <FiInfo aria-hidden="true" />
                            An administrator can read every user&apos;s expenses. Open administrator
                            sign-up is only available while no administrator exists.
                        </p>
                    </div>

                    <div className="adm-panel">
                        <div className="adm-panel-head"><h3>Add an administrator</h3></div>
                        {!addingAdmin ? (
                            <button type="button" className="adm-btn adm-btn-primary"
                                    onClick={() => setAddingAdmin(true)}>
                                <FiPlus aria-hidden="true" /> Add an administrator
                            </button>
                        ) : (
                            <form onSubmit={addAdmin}>
                                <div className="adm-fld">
                                    <label htmlFor="a-name">Full name</label>
                                    <input id="a-name" required value={newAdmin.name}
                                           onChange={(e) => setNewAdmin({ ...newAdmin, name: e.target.value })} />
                                </div>
                                <div className="adm-fld">
                                    <label htmlFor="a-email">Email</label>
                                    <input id="a-email" type="email" required value={newAdmin.email}
                                           onChange={(e) => setNewAdmin({ ...newAdmin, email: e.target.value })} />
                                </div>
                                <div className="adm-fld">
                                    <label htmlFor="a-pass">Temporary password</label>
                                    <input id="a-pass" type="password" required minLength={8}
                                           value={newAdmin.password}
                                           onChange={(e) => setNewAdmin({ ...newAdmin, password: e.target.value })} />
                                </div>
                                <div className="adm-actions">
                                    <button type="button" className="adm-btn"
                                            onClick={() => setAddingAdmin(false)}>Cancel</button>
                                    <button type="submit" className="adm-btn adm-btn-primary" disabled={busy}>
                                        {busy ? "Adding..." : "Add administrator"}
                                    </button>
                                </div>
                            </form>
                        )}
                    </div>
                </div>
            )}

            {tab === "data" && (
                <div className="adm-grid-2">
                    <div className="adm-panel">
                        <div className="adm-panel-head"><h3>Export</h3></div>
                        <div className="adm-set-row">
                            <span className="adm-set-txt">
                                <b>Export everything</b>
                                <small>
                                    Every expense with its owner as a CSV file. Amounts are exact in
                                    the export regardless of the estimate switch.
                                </small>
                            </span>
                            <button type="button" className="adm-btn" onClick={admin.downloadExpensesCsv}>
                                <FiDownload aria-hidden="true" /> Export
                            </button>
                        </div>
                    </div>

                    <div className="adm-panel adm-danger">
                        <div className="adm-panel-head"><h3>Danger zone</h3></div>
                        <p className="adm-fld-hint" style={{ marginTop: 0, marginBottom: 8 }}>
                            Not built yet, and deliberately so. Deleting a user also deletes every
                            expense they recorded, and there is no undo — that needs a confirmation
                            flow and a decision from whoever owns the data, not a button added
                            quietly.
                        </p>
                        <div className="adm-set-row">
                            <span className="adm-set-txt">
                                <b>Reset all expenses</b>
                                <small>
                                    Available today from the terminal: <code>npm run db:reset</code>
                                </small>
                            </span>
                            <button type="button" className="adm-btn adm-btn-danger" disabled>
                                Not available
                            </button>
                        </div>
                        <div className="adm-set-row">
                            <span className="adm-set-txt">
                                <b>Delete a user account</b>
                                <small>Removes the person and all their expenses.</small>
                            </span>
                            <button type="button" className="adm-btn adm-btn-danger" disabled>
                                Not available
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default AdminSettings;
