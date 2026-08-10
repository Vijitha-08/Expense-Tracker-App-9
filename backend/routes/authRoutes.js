const express = require("express");
const router = express.Router();

const { register, login, me, setupState } = require("../controllers/authController");
const auth = require("../middleware/authMiddleware");

router.post("/register", register);
router.post("/login", login);
router.get("/setup-state", setupState);
router.get("/me", auth, me);

module.exports = router;
