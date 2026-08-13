const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const { findUserByEmail, createUser, countAdmins } = require("../models/userModel");

const VALID_ROLES = ["user", "admin"];
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BCRYPT_ROUNDS = 12;

const signToken = (user) =>
    jwt.sign(
        { id: user.id, role: user.role },
        process.env.JWT_SECRET,
        { expiresIn: process.env.JWT_EXPIRES_IN || "1d" }
    );

const publicUser = (user) => ({
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
});

const register = async (req, res) => {
    try {
        const name = (req.body.name || "").trim();
        const email = (req.body.email || "").trim().toLowerCase();
        const password = req.body.password || "";
        const role = (req.body.role || "user").trim().toLowerCase();

        if (!name || !email || !password) {
            return res.status(400).json({ message: "Name, email and password are required" });
        }
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ message: "Please enter a valid email address" });
        }
        if (password.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }
        if (!VALID_ROLES.includes(role)) {
            return res.status(400).json({ message: "Invalid role" });
        }

        if (await findUserByEmail(email)) {
            return res.status(409).json({ message: "An account with this email already exists" });
        }

        // An admin can read every user's expenses, so open self-registration
        // as an admin is only safe while there is nobody to protect. The very
        // first admin signs up freely - that is how a fresh install gets one -
        // and after that new admins are added from inside the admin dashboard.
        if (role === "admin" && (await countAdmins()) > 0) {
            return res.status(403).json({
                message: "An administrator already exists. Ask them to create your admin account from the Team panel.",
            });
        }

        const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
        const user = await createUser(name, email, hashedPassword, role);

        // Log them straight in - no dead end after registering.
        return res.status(201).json({
            message: "Registration successful",
            token: signToken(user),
            user: publicUser(user),
        });
    } catch (err) {
        console.error("register failed:", err);
        return res.status(500).json({ message: "Could not create the account" });
    }
};

const login = async (req, res) => {
    try {
        const email = (req.body.email || "").trim().toLowerCase();
        const password = req.body.password || "";

        if (!email || !password) {
            return res.status(400).json({ message: "Email and password are required" });
        }

        const user = await findUserByEmail(email);

        // Same message and a dummy compare for both branches so the response
        // does not reveal whether an email is registered.
        if (!user) {
            await bcrypt.compare(password, "$2b$12$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidinv");
            return res.status(401).json({ message: "Invalid email or password" });
        }

        if (!(await bcrypt.compare(password, user.password))) {
            return res.status(401).json({ message: "Invalid email or password" });
        }

        return res.json({
            message: "Login successful",
            token: signToken(user),
            user: publicUser(user),
        });
    } catch (err) {
        console.error("login failed:", err);
        return res.status(500).json({ message: "Could not sign you in" });
    }
};

// Lets the frontend restore a session on refresh and confirm the token is live.
const me = async (req, res) => res.json({ user: publicUser(req.user) });

// Tells the register page whether to offer the "Administrator" option. Public
// on purpose: it reveals only whether the app has been set up yet, which an
// attacker learns anyway the moment they try to register as an admin.
const setupState = async (req, res) => {
    try {
        return res.json({ adminExists: (await countAdmins()) > 0 });
    } catch (err) {
        console.error("setupState failed:", err);
        // Fail closed: if we cannot tell, hide the admin option rather than
        // advertising a route that will reject them.
        return res.json({ adminExists: true });
    }
};

/* ============================================================
   Forgot password - email a one-time code, verify it, set a new password.
   ============================================================
   Three rules shape all of this, and they are why it is longer than the happy
   path would need:

   1. The reply NEVER says whether the address has an account. "If that address
      has an account, a code is on its way" comes back either way. An endpoint
      that answers "no such user" is a free tool for working out who is
      registered.

   2. The code is stored as a bcrypt hash, never in plaintext. It is a
      short-lived password, so it gets a password's treatment.

   3. Six digits is only a million guesses, which is worthless without a
      ceiling. Five wrong attempts burn the code, and a new one cannot be
      requested more than once a minute.
   ============================================================ */
const crypto = require("crypto");
const { createCode, latestFor, countAttempt, markUsed, purgeOld } = require("../models/resetModel");
const { sendResetCode, verifyTransport, mailConfigured } = require("../services/mailer");
const db = require("../config/db");

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;
const RESEND_SECONDS = 60;
const VAGUE = "If that address has an account, a reset code is on its way.";

// randomInt, not Math.random: this is a credential.
const newCode = () => String(crypto.randomInt(0, 1000000)).padStart(6, "0");

const forgotPassword = async (req, res) => {
    const email = (req.body.email || "").trim().toLowerCase();
    try {
        if (!EMAIL_RE.test(email)) {
            return res.status(400).json({ message: "Please enter a valid email address" });
        }

        // Checked BEFORE the account lookup, deliberately. A mail server that
        // is configured but unreachable - a mistyped app password is the usual
        // cause - used to throw further down and come back as a bare 500, which
        // left the person staring at "something went wrong" while the real
        // reason sat in the server log. Now it says what is wrong and who can
        // fix it. Doing this first also keeps the reply independent of whether
        // the address exists, so it cannot be used to test for accounts.
        if (mailConfigured()) {
            const mail = await verifyTransport();
            if (!mail.ok) {
                console.error("reset email cannot be sent - SMTP unreachable:", mail.error);
                return res.status(502).json({
                    message: "Codes cannot be emailed right now - the email settings on the server need checking. Please ask the administrator.",
                    emailConfigured: true,
                    delivered: false,
                });
            }
        }

        const user = await findUserByEmail(email);
        if (!user) return res.json({ message: VAGUE, emailConfigured: mailConfigured() });

        const outstanding = await latestFor(user.id);
        if (outstanding && !outstanding.used_at) {
            const age = (Date.now() - new Date(outstanding.created_at).getTime()) / 1000;
            if (age < RESEND_SECONDS) {
                return res.status(429).json({
                    message: `A code was just sent. Wait ${Math.ceil(RESEND_SECONDS - age)} seconds before asking for another.`,
                });
            }
        }

        const code = newCode();
        await createCode(user.id, await bcrypt.hash(code, BCRYPT_ROUNDS), CODE_MINUTES);

        const { delivered } = await sendResetCode({
            to: user.email, name: user.name, code, minutes: CODE_MINUTES,
        });

        purgeOld().catch(() => {});   // housekeeping; never blocks the response

        return res.json({
            message: VAGUE,
            // Lets the UI say "check your email" or "email is not set up yet".
            // Reveals neither the code nor whether the account exists.
            emailConfigured: mailConfigured(),
            delivered,
        });
    } catch (err) {
        console.error("forgotPassword failed:", err);
        return res.status(500).json({ message: "Could not start the password reset" });
    }
};

// Shared by verify and reset so the two cannot drift apart on what counts as a
// valid code.
const checkCode = async (email, code) => {
    const user = await findUserByEmail(email);
    if (!user) return { ok: false, status: 400, message: "That code is not valid." };

    const row = await latestFor(user.id);
    if (!row || row.used_at) {
        return { ok: false, status: 400, message: "That code is not valid. Request a new one." };
    }
    if (new Date(row.expires_at).getTime() < Date.now()) {
        return { ok: false, status: 400, message: "That code has expired. Request a new one." };
    }
    if (row.attempts >= MAX_ATTEMPTS) {
        await markUsed(row.id);
        return { ok: false, status: 429, message: "Too many incorrect attempts. Request a new code." };
    }
    if (!(await bcrypt.compare(String(code || ""), row.code_hash))) {
        await countAttempt(row.id);
        const left = MAX_ATTEMPTS - (row.attempts + 1);
        return {
            ok: false, status: 400,
            message: left > 0
                ? `That code is not correct. ${left} ${left === 1 ? "attempt" : "attempts"} left.`
                : "That code is not correct. Request a new one.",
        };
    }
    return { ok: true, user, row };
};

// Lets the UI move to the "new password" step without holding the code back
// until the end - a wrong code should be caught before somebody types a new
// password twice.
const verifyResetCode = async (req, res) => {
    try {
        const result = await checkCode((req.body.email || "").trim().toLowerCase(), req.body.code);
        if (!result.ok) return res.status(result.status).json({ message: result.message });
        return res.json({ message: "Code accepted" });
    } catch (err) {
        console.error("verifyResetCode failed:", err);
        return res.status(500).json({ message: "Could not check that code" });
    }
};

const resetPassword = async (req, res) => {
    try {
        const newPassword = req.body.newPassword || "";
        if (newPassword.length < 8) {
            return res.status(400).json({ message: "Password must be at least 8 characters" });
        }

        // Re-checked here rather than trusting the verify step. Without this,
        // anyone could POST straight to reset and skip the code entirely.
        const result = await checkCode((req.body.email || "").trim().toLowerCase(), req.body.code);
        if (!result.ok) return res.status(result.status).json({ message: result.message });

        await db.query("UPDATE users SET password = $2 WHERE id = $1", [
            result.user.id,
            await bcrypt.hash(newPassword, BCRYPT_ROUNDS),
        ]);
        await markUsed(result.row.id);

        return res.json({ message: "Password updated. You can sign in with it now." });
    } catch (err) {
        console.error("resetPassword failed:", err);
        return res.status(500).json({ message: "Could not update the password" });
    }
};

module.exports = {
    register, login, me, setupState,
    forgotPassword, verifyResetCode, resetPassword,
};
