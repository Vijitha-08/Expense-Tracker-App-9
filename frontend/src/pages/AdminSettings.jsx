import { useEffect, useState } from "react";
import {
    FiDownload, FiPlus, FiAlertCircle, FiCheckCircle, FiInfo,
} from "react-icons/fi";
import AdminLayout from "../Layouts/AdminLayout";
import { useAuth } from "../context/useAuth";
import { useDisplay } from "../context/useDisplay";
import { PERIODS } from "../services/period";
import { money, moneyApprox } from "../services/format";
import * as admin from "../services/adminService";
import * as profile from "../services/profileService";

// Four sections: My account, Display, Administrators, Data.
//
// SCOPE NOTE, so nobody is surprised: every section on this page talks to the
// API. My account, Add administrator and Export always did.
//
// The two that changed:
//
//   * Display was localStorage-only, on the reasoning that four cosmetic
//     toggles did not justify a table. It now ALSO persists to the account via
//     GET/PUT /api/users/preferences, because signing in on a second machine
//     gave a different Settings page. localStorage is still the first read, so
//     the theme paints before any request finishes - see DisplayContext.jsx.
//
//   * Reset all expenses and Delete a user account are built. They were held
//     back for wanting "destructive endpoints and confirmation flows", and both
//     now have them: the acting admin's own password is re-checked server-side,
//     a distinct phrase has to be typed, the last administrator can never be
//     removed, and an admin cannot delete their own account from here. Reset
//     clears expenses only - no login, name, role or preference is touched.
const SAMPLE = 11054890;

// Typed confirmation phrases for the Danger zone. Deliberately different from
// each other, and different again from the two on the user Settings page, so
// muscle memory from one destructive action cannot carry somebody through a
// bigger one.
const RESET_PHRASE = "DELETE ALL EXPENSES";
const DELETE_USER_PHRASE = "DELETE THIS ACCOUNT";

// "System" first, because it is the default and the one that needs no decision.
const THEMES = [
    { id: "system", label: "System" },
    { id: "light",  label: "Light" },
    { id: "dark",   label: "Dark" },
];

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
    // The full list as well as the admin-only slice. The Danger zone's account
    // picker needs everybody, and loading it from the same response the page
    // already makes avoids a second request for data that is right there.
    const [people, setPeople] = useState([]);

    // One piece of state for the whole Danger zone: the acting admin's password,
    // which action is armed (null = neither), the chosen account, and the typed
    // confirmation. Together because they are only meaningful together, so
    // resetting is one assignment.
    const [danger, setDanger] = useState({ password: "", mode: null, typed: "", targetId: "" });
    const dangerPhrase = danger.mode === "reset" ? RESET_PHRASE : DELETE_USER_PHRASE;

    useEffect(() => {
        admin.getPeople()
            .then(({ people: all }) => {
                setPeople(all);
                setAdmins(all.filter((p) => p.role === "admin"));
            })
            .catch(() => { setPeople([]); setAdmins([]); });
    }, []);

    // Re-reads the people list after a destructive action so the picker and the
    // admin list on this page cannot keep offering an account that is gone.
    const reloadPeople = () =>
        admin.getPeople()
            .then(({ people: all }) => {
                setPeople(all);
                setAdmins(all.filter((p) => p.role === "admin"));
            })
            .catch(() => {});

    const runDanger = async (e) => {
        e.preventDefault();
        if (!danger.mode || !danger.password || danger.typed !== dangerPhrase) return;
        if (danger.mode === "user" && !danger.targetId) return;
        setBusy(true);
        setError("");
        try {
            const res = danger.mode === "reset"
                ? await admin.resetAllExpenses(danger.password)
                : await admin.deleteUserAccount(danger.targetId, danger.password);
            setDanger({ password: "", mode: null, typed: "", targetId: "" });
            await reloadPeople();
            flash(res.message);
        } catch (err) {
            // Left armed on failure - a wrong password should not make somebody
            // re-pick the account and retype the phrase.
            setError(err.message);
        } finally {
            setBusy(false);
        }
    };

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

                    {/* Theme sits first: it is the preference someone opens this
                        tab looking for, and the only one that changes the page
                        while they are still on it. */}
                    <div className="adm-set-row">
                        <span className="adm-set-txt">
                            <b>Theme</b>
                            <small>
                                {display.theme === "system"
                                    ? `Following this device, which is currently ${display.resolvedTheme}.`
                                    : "Applies to the admin panel only."}
                            </small>
                        </span>
                        <span className="adm-pick" role="group" aria-label="Theme">
                            {THEMES.map(({ id, label }) => (
                                <button key={id} type="button"
                                        aria-pressed={display.theme === id}
                                        className={display.theme === id ? "adm-pick-on" : ""}
                                        onClick={() => display.set({ theme: id })}>
                                    {label}
                                </button>
                            ))}
                        </span>
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
                            These affect other people's data and cannot be undone. Both ask for your
                            own password and then for the exact words shown. The password matters:
                            your sign-in token travels with every request, so it only proves a
                            session was opened — a password proves it is you doing this now.
                        </p>

                        <form onSubmit={runDanger}>
                            {/* `.adm-fld` is a WRAPPER with a nested <label>, which is how
                                every other field on this page is built. Putting the class
                                on the label itself silently loses the uppercase field-label
                                styling, because the rule is `.adm-fld label`. */}
                            <div className="adm-fld">
                                <label htmlFor="adm-danger-pw">Your password</label>
                                <input id="adm-danger-pw" type="password" autoComplete="current-password"
                                       value={danger.password}
                                       onChange={(e) => setDanger({ ...danger, password: e.target.value })} />
                            </div>

                            <div className="adm-set-row">
                                <span className="adm-set-txt">
                                    <b>Reset all expenses</b>
                                    <small>
                                        Deletes every expense from every account. Logins, names and
                                        roles all survive — only spending records go.
                                    </small>
                                </span>
                                <button type="button" className="adm-btn adm-btn-danger" disabled={busy}
                                        onClick={() => setDanger({ ...danger, mode: "reset", typed: "", targetId: "" })}>
                                    Reset expenses
                                </button>
                            </div>

                            <div className="adm-set-row">
                                <span className="adm-set-txt">
                                    <b>Delete a user account</b>
                                    <small>Removes the person and all their expenses.</small>
                                </span>
                                <button type="button" className="adm-btn adm-btn-danger" disabled={busy}
                                        onClick={() => setDanger({ ...danger, mode: "user", typed: "", targetId: "" })}>
                                    Delete an account
                                </button>
                            </div>

                            {danger.mode === "user" && (
                                <div className="adm-fld">
                                    <label htmlFor="adm-danger-who">Which account</label>
                                    {/* Built from the people list this page already loads, so an id
                                        cannot be mistyped. Your own account is filtered out - the
                                        server refuses it too, but offering it would be a trap.

                                        Wrapped in `.adm-select` because `.adm-fld` styles `input`
                                        only; without it the dropdown renders as an unstyled native
                                        control next to fields that are not. */}
                                    <label className="adm-select">
                                    <select id="adm-danger-who" value={danger.targetId}
                                            onChange={(e) => setDanger({ ...danger, targetId: e.target.value })}>
                                        <option value="">Choose a person…</option>
                                        {people.filter((p) => p.id !== user?.id).map((p) => (
                                            <option key={p.id} value={p.id}>
                                                {p.name} · {p.email}{p.role === "admin" ? " · Administrator" : ""}
                                            </option>
                                        ))}
                                    </select>
                                    </label>
                                </div>
                            )}

                            {danger.mode && (
                                <>
                                    <p className="adm-note">
                                        <FiAlertCircle aria-hidden="true" />
                                        {danger.mode === "reset"
                                            ? "This deletes every expense in the organisation, for every account. It cannot be undone."
                                            : "This deletes the chosen account and every expense on it. It cannot be undone."}
                                    </p>
                                    <div className="adm-fld">
                                        <label htmlFor="adm-danger-phrase">
                                            Type {danger.mode === "reset" ? RESET_PHRASE : DELETE_USER_PHRASE} to confirm
                                        </label>
                                        <input id="adm-danger-phrase" autoComplete="off"
                                               value={danger.typed}
                                               onChange={(e) => setDanger({ ...danger, typed: e.target.value })} />
                                    </div>
                                    <div className="adm-actions">
                                        <button type="button" className="adm-btn"
                                                onClick={() => setDanger({ password: "", mode: null, typed: "", targetId: "" })}>
                                            Cancel
                                        </button>
                                        {/* Password filled, phrase exact, and for a user delete a
                                            person chosen. The server re-checks all of it; this only
                                            stops an accidental click. */}
                                        <button type="submit" className="adm-btn adm-btn-danger"
                                                disabled={busy || !danger.password
                                                    || danger.typed !== dangerPhrase
                                                    || (danger.mode === "user" && !danger.targetId)}>
                                            {busy ? "Working..." : danger.mode === "reset"
                                                ? "Yes, delete every expense"
                                                : "Yes, delete this account"}
                                        </button>
                                    </div>
                                </>
                            )}
                        </form>
                    </div>
                </div>
            )}
        </AdminLayout>
    );
};

export default AdminSettings;
