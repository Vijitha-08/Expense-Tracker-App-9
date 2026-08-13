// Usage: router.get("/", auth, requireRole("admin"), handler)
const requireRole = (...allowedRoles) => (req, res, next) => {
    if (!req.user) {
        return res.status(401).json({ message: "Authentication required" });
    }
    if (!allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
            message: `This action requires one of: ${allowedRoles.join(", ")}`,
        });
    }
    next();
};

module.exports = { requireRole };
