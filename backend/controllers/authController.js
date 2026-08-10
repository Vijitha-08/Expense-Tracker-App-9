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

module.exports = { register, login, me, setupState };
