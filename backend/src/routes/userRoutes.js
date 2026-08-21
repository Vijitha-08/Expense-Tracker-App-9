const express = require("express");
const router = express.Router();

const {
    getProfile, changePassword, updateProfile,
    readPreferences, writePreferences,
    clearMyExpenses, deleteMyAccount,
} = require("../controllers/userController");
const auth = require("../middlewares/authMiddleware");

// One `router.use(auth)` covering the whole file, so a route added below cannot
// be left public by forgetting to list the middleware. None of these take a user
// id - every handler works from req.user.id - so there is no id to tamper with.
router.use(auth);

router.get("/profile", getProfile);
router.put("/profile", updateProfile);
router.put("/password", changePassword);

// Settings -> Display. GET returns null when nothing has been saved yet, which
// is what lets the client keep its local choice on a first visit.
router.get("/preferences", readPreferences);
router.put("/preferences", writePreferences);

// Settings -> My data -> Danger zone. Both destroy data and both require the
// account password in the body on top of the bearer token - see confirmPassword
// in the controller for why a token alone is not enough.
router.delete("/me/expenses", clearMyExpenses);
router.delete("/me", deleteMyAccount);

module.exports = router;
