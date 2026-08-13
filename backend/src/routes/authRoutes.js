const express = require("express");
const router = express.Router();

const {
    register, login, me, setupState,
    forgotPassword, verifyResetCode, resetPassword,
} = require("../controllers/authController");
const auth = require("../middlewares/authMiddleware");

router.post("/register", register);
router.post("/login", login);
router.get("/setup-state", setupState);
router.get("/me", auth, me);

// Forgot password. Public by necessity - somebody who cannot sign in cannot
// carry a token. The protection is in the controller: a vague reply that never
// confirms an address, a hashed single-use code, an attempt ceiling and a
// resend cooldown.
router.post("/forgot-password", forgotPassword);
router.post("/verify-reset-code", verifyResetCode);
router.post("/reset-password", resetPassword);

module.exports = router;
