const bcrypt = require("bcrypt");
const db = require("../config/db");
const { findUserByEmail, updateProfile: updateProfileRow } = require("../models/userModel");

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const getProfile = async (req, res) => res.json({ user: req.user });

const changePassword = async (req, res) => {
    try {
        const currentPassword = req.body.currentPassword || "";
        const newPassword = req.body.newPassword || "";

        if (newPassword.length < 8) {
            return res.status(400).json({ message: "New password must be at least 8 characters" });
        }

        const full = await findUserByEmail(req.user.email);
        if (!(await bcrypt.compare(currentPassword, full.password))) {
            return res.status(401).json({ message: "Current password is incorrect" });
        }

        await db.query("UPDATE users SET password = $2 WHERE id = $1", [
            req.user.id,
            await bcrypt.hash(newPassword, 12),
        ]);

        return res.json({ message: "Password updated" });
    } catch (err) {
        console.error("changePassword failed:", err);
        return res.status(500).json({ message: "Could not update the password" });
    }
};

// Settings -> My account: your own name and email only. Role is deliberately
// NOT editable here, or the last administrator could quietly demote themselves
// and lock everyone out of the admin panel.
const updateProfile = async (req, res) => {
    try {
        const name = (req.body.name || "").trim();
        const email = (req.body.email || "").trim().toLowerCase();

        if (!name) return res.status(400).json({ message: "Name is required" });
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ message: "Please enter a valid email address" });
        }

        // Only a clash with SOMEBODY ELSE is a conflict - saving your own
        // address unchanged has to keep working.
        const existing = await findUserByEmail(email);
        if (existing && existing.id !== req.user.id) {
            return res.status(409).json({ message: "An account with this email already exists" });
        }

        const user = await updateProfileRow(req.user.id, { name, email });
        return res.json({ message: "Profile updated", user });
    } catch (err) {
        console.error("updateProfile failed:", err);
        return res.status(500).json({ message: "Could not update the profile" });
    }
};

/* ============================================================
   Settings -> Display, and Settings -> Danger zone.
   ============================================================
   Everything below is scoped to req.user.id, never to an id from the request
   body or params. That is the whole authorisation story for this file: there is
   no route here that takes a user id, so there is nothing to tamper with. A
   signed-in person can only ever read and change their own row, and the admin
   endpoints that reach other accounts live in adminController behind
   requireRole("admin").
   ============================================================ */
const { getPreferences, savePreferences } = require("../models/preferenceModel");

// The four Display switches, with the same defaults DisplayContext.jsx uses.
// Restated here rather than imported because the frontend constant is an ES
// module and this is CommonJS - and because the server must not trust the
// client's idea of what a valid value is anyway.
const DATE_STYLES = ["long", "iso"];
const THEMES = ["system", "light", "dark"];
const PERIODS = ["7d", "tm", "lm", "3m", "6m", "1y", "all"];

const readPreferences = async (req, res) => {
    try {
        const prefs = await getPreferences(req.user.id);
        // null, not the defaults. The frontend needs to tell "never saved" from
        // "saved, and happens to equal the defaults": in the first case whatever
        // is already in localStorage should win, in the second the server should.
        return res.json({ preferences: prefs });
    } catch (err) {
        console.error("readPreferences failed:", err);
        return res.status(500).json({ message: "Could not load your display preferences" });
    }
};

const writePreferences = async (req, res) => {
    try {
        const body = req.body || {};

        // Whitelisted, not coerced. An unknown theme would be stored happily by
        // Postgres (it is a varchar) and then break every page that switch feeds,
        // so a bad value is rejected here with the field named.
        if (typeof body.estimated !== "boolean") {
            return res.status(400).json({ message: "estimated must be true or false", field: "estimated" });
        }
        if (!DATE_STYLES.includes(body.dateStyle)) {
            return res.status(400).json({ message: `dateStyle must be one of: ${DATE_STYLES.join(", ")}`, field: "dateStyle" });
        }
        if (!THEMES.includes(body.theme)) {
            return res.status(400).json({ message: `theme must be one of: ${THEMES.join(", ")}`, field: "theme" });
        }
        if (!PERIODS.includes(body.defaultPeriod)) {
            return res.status(400).json({ message: `defaultPeriod must be one of: ${PERIODS.join(", ")}`, field: "defaultPeriod" });
        }

        const preferences = await savePreferences(req.user.id, {
            estimated: body.estimated,
            dateStyle: body.dateStyle,
            defaultPeriod: body.defaultPeriod,
            theme: body.theme,
        });
        return res.json({ message: "Display preferences saved", preferences });
    } catch (err) {
        console.error("writePreferences failed:", err);
        return res.status(500).json({ message: "Could not save your display preferences" });
    }
};

// ---------------------------------------------------------------- danger zone
// Both endpoints below destroy data, so both demand the account password in the
// body. That is not belt-and-braces: a bearer token sits in localStorage and
// travels with every request, so a token alone proves only that a session was
// opened at some point - it cannot prove the person at the keyboard right now is
// the account holder. A password can. Same reason changePassword above asks for
// the current one.
const confirmPassword = async (req) => {
    const supplied = req.body?.password || "";
    if (!supplied) return { ok: false, status: 400, message: "Enter your password to confirm" };
    const full = await findUserByEmail(req.user.email);
    if (!full || !(await bcrypt.compare(supplied, full.password))) {
        return { ok: false, status: 401, message: "That password is not correct" };
    }
    return { ok: true };
};

// Settings -> My data -> "Clear all my expenses".
//
// Scoped by user_id in the WHERE clause, so it cannot reach another account's
// rows even if something upstream went wrong. Returns the count so the page can
// say what actually happened rather than a bare "done" - "Deleted 14 expenses"
// is checkable, "Cleared" is not.
const clearMyExpenses = async (req, res) => {
    try {
        const check = await confirmPassword(req);
        if (!check.ok) return res.status(check.status).json({ message: check.message });

        const { rowCount } = await db.query("DELETE FROM expenses WHERE user_id = $1", [req.user.id]);
        return res.json({
            message: rowCount === 0
                ? "You had no expenses to clear"
                : `Deleted ${rowCount} ${rowCount === 1 ? "expense" : "expenses"}`,
            deleted: rowCount,
        });
    } catch (err) {
        console.error("clearMyExpenses failed:", err);
        return res.status(500).json({ message: "Could not clear your expenses" });
    }
};

// Settings -> My data -> "Delete my account".
//
// The expenses go with it through the ON DELETE CASCADE already on
// expenses.user_id, and preferences through the one on user_preferences - so
// this is a single statement rather than a hand-rolled cleanup that could miss a
// table added later.
//
// AN ADMIN CANNOT DELETE THE LAST ADMIN ACCOUNT. Without that check the only
// administrator could remove themselves and leave the app with no way into the
// admin panel and no way to create one - register refuses a second admin while
// one exists, and with none existing the first registration would hand admin to
// whoever signs up next. Checked here rather than trusted to the UI.
const deleteMyAccount = async (req, res) => {
    try {
        const check = await confirmPassword(req);
        if (!check.ok) return res.status(check.status).json({ message: check.message });

        if (req.user.role === "admin") {
            const { rows } = await db.query("SELECT COUNT(*)::int AS n FROM users WHERE role = 'admin'");
            if (rows[0].n <= 1) {
                return res.status(409).json({
                    message: "You are the only administrator. Promote somebody else from the Users page first, or this app would be left with no admin access at all.",
                });
            }
        }

        const { rowCount } = await db.query("DELETE FROM users WHERE id = $1", [req.user.id]);
        if (!rowCount) return res.status(404).json({ message: "That account no longer exists" });

        // No token invalidation to do: the JWT is stateless and simply stops
        // resolving, because authMiddleware looks the row up on every request
        // and will now find nothing. The client clears its own storage.
        return res.json({ message: "Your account and all of its expenses have been deleted" });
    } catch (err) {
        console.error("deleteMyAccount failed:", err);
        return res.status(500).json({ message: "Could not delete the account" });
    }
};

module.exports = {
    getProfile, changePassword, updateProfile,
    readPreferences, writePreferences,
    clearMyExpenses, deleteMyAccount,
};
