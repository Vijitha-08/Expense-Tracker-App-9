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

module.exports = { getProfile, changePassword, updateProfile };
