const jwt = require("jsonwebtoken");
const { findUserById } = require("../models/userModel");

// Verifies the Bearer token and attaches the CURRENT db row to req.user.
// Reading the row (instead of trusting the token payload) means a deleted
// user or a changed role takes effect immediately, not after token expiry.
const authMiddleware = async (req, res, next) => {
    const header = req.headers.authorization || "";

    if (!header.startsWith("Bearer ")) {
        return res.status(401).json({ message: "Authentication required" });
    }

    const token = header.slice(7).trim();

    try {
        const payload = jwt.verify(token, process.env.JWT_SECRET);
        const user = await findUserById(payload.id);

        if (!user) {
            return res.status(401).json({ message: "Account no longer exists" });
        }

        req.user = user;
        next();
    } catch (err) {
        const message =
            err.name === "TokenExpiredError"
                ? "Session expired, please log in again"
                : "Invalid or malformed token";
        return res.status(401).json({ message });
    }
};

module.exports = authMiddleware;
