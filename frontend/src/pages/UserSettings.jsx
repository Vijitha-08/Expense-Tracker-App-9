import { useState } from "react";
import {
    FiUser, FiSliders, FiDatabase, FiDownload,
    FiAlertCircle, FiCheckCircle, FiInfo,
} from "react-icons/fi";
import DashboardLayout from "../Layouts/DashboardLayout";
import { useAuth } from "../context/useAuth";
import { useDisplay } from "../context/useDisplay";
import { PERIODS } from "../services/period";
import { money, moneyApprox } from "../services/format";
import * as profile from "../services/profileService";
import { downloadMyExpensesCsv } from "../services/expenseService";

// The user-side counterpart of AdminSettings, on the same three mechanisms:
// profileService for the account, DisplayContext for the preferences, and a CSV
// endpoint for the export.
//
// WHAT IS DIFFERENT FROM THE ADMIN PAGE, and why:
//
//   * Three tabs, not four. The admin's "Administrators" tab lists everyone with
//     full access and can add one; both call /api/admin/people, which is behind
//     requireRole("admin"). A user hitting it gets a 403, so the tab would be a
//     permanent error panel. It is dropped rather than shown empty.
//
//   * Export goes to /api/expenses/export, not /api/admin/expenses/export. The
//     admin route returns EVERY user's rows. The user route is scoped server-side
//     from the token, so it can only ever return your own - the scoping is not a
//     filter the client asks for and could forget.
//
//   * The Display switches are wired into the user dashboard in this same change.
//     Before it they were read by admin pages only, so shipping them here first
//     would have meant four controls that visibly change nothing.
//
// Danger zone: still not built, for the same reason it is not built on the admin
// page. Deleting your account deletes every expense you recorded and there is no
// undo, so it needs a confirmation flow and a deliberate decision rather than a
// button added quietly. Said out loud on the page instead of hidden.
const SAMPLE = 1104567;

// "System" first: it is the default and the one that needs no decision.
const THEMES = [
    { id: "system", label: "System" },
    { id: "light",  label: "Light" },
    { id: "dark",   label: "Dark" },
];

const TABS = [
    { id: "account", label: "My account", Icon: FiUser },
    { id: "display", label: "Display",    Icon: FiSliders },
    { id: "data",    label: "My data",    Icon: FiDatabase },
];

const UserSettings = () => {
    const { user, refresh } = useAuth();
    const display = useDisplay();

    const [tab, setTab] = useState("account");
    // Seeded from the signed-in user once. Re-syncing it in an effect would fight
    // the user's typing and trips this repo's react-hooks/set-state-in-effect
    // rule; the <form key> below remounts it if the account itself changes.
    const [form, setForm] = useState(() => ({ name: user?.name || "", email: user?.email || "" }));
    const [pw, setPw] = useState({ currentPassword: "", newPassword: "", confirm: "" });
    const [busy, setBusy] = useState(false);
    const [notice, setNotice] = useState("");
    const [error, setError] = useState("");

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
            // The greeting and the drawer both read the name from the auth
            // context, so it has to be re-read or they keep showing the old one.
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

    const exportCsv = async () => {
        setBusy(true);
        setError("");
        try {
            await downloadMyExpensesCsv();
            flash("Your export has been downloaded");
        } catch (err) {
            setError(err.message || "Could not build the export");
        } finally {
            setBusy(false);
        }
    };

    return (
        <DashboardLayout
            title="Settings"
            subtitle="Your account, how your figures are shown, and a copy of your data."
            tabs={TABS}
            activeTab={tab}
            onTabChange={(id) => { setTab(id); setNotice(""); setError(""); }}
        >
            {error && (
                <div className="alert alert-error" role="alert">
                    <FiAlertCircle aria-hidden="true" /> {error}
                </div>
            )}
            {notice && (
                <div className="alert alert-ok" role="status">
                    <FiCheckCircle aria-hidden="true" /> {notice}
                </div>
            )}

            {tab === "account" && (
                <div className="grid-2">
                    <form className="panel dash-set-form" key={user?.id} onSubmit={saveProfile}>
                        <div className="panel-head">
                            <h3>My account</h3>
                            <span className="dash-hint">Only affects your own login</span>
                        </div>
                        <div className="form-row">
                            <label htmlFor="us-name">
                                Full name
                                <input id="us-name" name="name" value={form.name} required
                                       onChange={(e) => setForm({ ...form, name: e.target.value })} />
                            </label>
                            <label htmlFor="us-email">
                                Email
                                <input id="us-email" name="email" type="email" value={form.email} required
                                       onChange={(e) => setForm({ ...form, email: e.target.value })} />
                            </label>
                        </div>
                        <p className="dash-note">
                            <FiInfo aria-hidden="true" />
                            Your email is also your login, so changing it changes how you sign in.
                            Your expenses stay with the account either way.
                        </p>
                        <div className="form-actions">
                            <button type="submit" className="btn btn-primary" disabled={busy}>
                                {busy ? "Saving..." : "Save changes"}
                            </button>
                        </div>
                    </form>

                    <form className="panel dash-set-form" onSubmit={savePassword}>
                        <div className="panel-head"><h3>Change password</h3></div>
                        <label htmlFor="us-cur">
                            Current password
                            <input id="us-cur" type="password" required autoComplete="current-password"
                                   value={pw.currentPassword}
                                   onChange={(e) => setPw({ ...pw, currentPassword: e.target.value })} />
                        </label>
                        <div className="form-row">
                            <label htmlFor="us-new">
                                New password
                                <input id="us-new" type="password" required minLength={8}
                                       autoComplete="new-password" value={pw.newPassword}
                                       onChange={(e) => setPw({ ...pw, newPassword: e.target.value })} />
                            </label>
                            <label htmlFor="us-conf">
                                Confirm new password
                                <input id="us-conf" type="password" required autoComplete="new-password"
                                       value={pw.confirm}
                                       onChange={(e) => setPw({ ...pw, confirm: e.target.value })} />
                            </label>
                        </div>
                        <p className="dash-hint">At least 8 characters. Stored as a bcrypt hash.</p>
                        <div className="form-actions">
                            <button type="submit" className="btn btn-primary" disabled={busy}>
                                {busy ? "Saving..." : "Change password"}
                            </button>
                        </div>
                    </form>
                </div>
            )}

            {tab === "display" && (
                <div className="panel">
                    <div className="panel-head">
                        <h3>Display</h3>
                        <span className="dash-hint">Saved in this browser</span>
                    </div>

                    {/* Theme first: it is what someone opens this tab looking for,
                        and the only preference that changes the page while they
                        are still on it. */}
                    <div className="dash-set-row">
                        <span className="dash-set-txt">
                            <b>Theme</b>
                            <small>
                                {display.theme === "system"
                                    ? `Following this device, which is currently ${display.resolvedTheme}.`
                                    : "Applies to your dashboard and the public pages."}
                            </small>
                        </span>
                        <span className="dash-pick" role="group" aria-label="Theme">
                            {THEMES.map(({ id, label }) => (
                                <button key={id} type="button"
                                        aria-pressed={display.theme === id}
                                        className={display.theme === id ? "dash-pick-on" : ""}
                                        onClick={() => display.set({ theme: id })}>
                                    {label}
                                </button>
                            ))}
                        </span>
                    </div>

                    <div className="dash-set-row">
                        <span className="dash-set-txt">
                            <b>Show estimated amounts</b>
                            <small>
                                {moneyApprox(SAMPLE)} instead of {money(SAMPLE)}.
                                Applies to your cards, charts and tables.
                            </small>
                        </span>
                        <button
                            type="button"
                            role="switch"
                            aria-checked={display.estimated}
                            aria-label="Show estimated amounts"
                            className={`dash-switch${display.estimated ? " dash-switch-on" : ""}`}
                            onClick={() => display.set({ estimated: !display.estimated })}
                        >
                            <i />
                        </button>
                    </div>

                    <div className="dash-set-row">
                        <span className="dash-set-txt">
                            <b>Date format</b>
                            <small>How your expense dates are written.</small>
                        </span>
                        <span className="dash-pick" role="group" aria-label="Date format">
                            <button type="button"
                                    aria-pressed={display.dateStyle === "long"}
                                    className={display.dateStyle === "long" ? "dash-pick-on" : ""}
                                    onClick={() => display.set({ dateStyle: "long" })}>07 Aug 2026</button>
                            <button type="button"
                                    aria-pressed={display.dateStyle === "iso"}
                                    className={display.dateStyle === "iso" ? "dash-pick-on" : ""}
                                    onClick={() => display.set({ dateStyle: "iso" })}>2026-08-07</button>
                        </span>
                    </div>

                    <div className="dash-set-row">
                        <span className="dash-set-txt">
                            <b>Default period</b>
                            <small>Which period your dashboard opens on.</small>
                        </span>
                        <label className="select-inline">
                            <select value={display.defaultPeriod}
                                    aria-label="Default period"
                                    onChange={(e) => display.set({ defaultPeriod: e.target.value })}>
                                {PERIODS.map((p) => (
                                    <option key={p.id} value={p.id}>{p.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    <p className="dash-note">
                        <FiInfo aria-hidden="true" />
                        Estimated amounts round to the nearest thousand, lakh or crore, so individual
                        rows will not add up to the total exactly. Turn the switch off when a figure
                        has to be checked against a receipt — the export is always exact regardless
                        of this setting.
                    </p>
                </div>
            )}

            {tab === "data" && (
                <div className="grid-2">
                    <div className="panel">
                        <div className="panel-head"><h3>Export</h3></div>
                        <div className="dash-set-row">
                            <span className="dash-set-txt">
                                <b>Download my expenses</b>
                                <small>
                                    A CSV of your own entries — date, title, category, amount and
                                    notes. Amounts are exact even with estimates switched on. Covers
                                    your 500 most recent entries, which is the server&apos;s own limit
                                    on a single listing.
                                </small>
                            </span>
                            <button type="button" className="btn btn-ghost" onClick={exportCsv} disabled={busy}>
                                <FiDownload aria-hidden="true" /> {busy ? "Preparing..." : "Export"}
                            </button>
                        </div>
                        <p className="dash-note">
                            <FiInfo aria-hidden="true" />
                            The file contains only your expenses. Nobody else&apos;s rows can appear
                            in it — the server builds it from your login, not from anything this page
                            sends.
                        </p>
                    </div>

                    <div className="panel dash-danger">
                        <div className="panel-head"><h3>Danger zone</h3></div>
                        <p className="dash-hint" style={{ marginTop: 0 }}>
                            Not built yet, and deliberately so. Deleting your account also deletes
                            every expense you have recorded, and there is no undo — that needs a
                            confirmation flow and a decision from whoever owns the data, not a button
                            added quietly.
                        </p>
                        <div className="dash-set-row">
                            <span className="dash-set-txt">
                                <b>Delete my account</b>
                                <small>Would remove your login and all of your expenses.</small>
                            </span>
                            <button type="button" className="btn btn-danger" disabled>
                                Not available
                            </button>
                        </div>
                        <div className="dash-set-row">
                            <span className="dash-set-txt">
                                <b>Clear all my expenses</b>
                                <small>
                                    Delete them one at a time from your dashboard for now — each row
                                    has its own Delete.
                                </small>
                            </span>
                            <button type="button" className="btn btn-danger" disabled>
                                Not available
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </DashboardLayout>
    );
};

export default UserSettings;
