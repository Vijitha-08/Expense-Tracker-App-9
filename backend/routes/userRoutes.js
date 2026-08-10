const express = require("express");
const router = express.Router();

const {
    getProfile, changePassword, updateProfile,
} = require("../controllers/userController");
const auth = require("../middleware/authMiddleware");

router.use(auth);

router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.put("/password", changePassword);

module.exports = router;
