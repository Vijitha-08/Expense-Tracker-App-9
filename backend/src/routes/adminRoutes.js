const express = require("express");
const router = express.Router();

const {
    getOverview, getAllExpenses, getTeam, createTeamMember,
    getPeople, getPerson, exportExpenses,
    resetAllExpenses, deleteUserAccount,
} = require("../controllers/adminController");
const auth = require("../middlewares/authMiddleware");
const { requireRole } = require("../middlewares/roleMiddleware");

// Applied once at the router level, so a new route added below cannot
// accidentally ship without the role check.
router.use(auth, requireRole("admin"));

router.get("/overview", getOverview);
router.get("/expenses", getAllExpenses);
router.get("/expenses/export", exportExpenses);
router.get("/people", getPeople);
router.get("/people/:id", getPerson);
router.get("/team", getTeam);
router.post("/team", createTeamMember);

// Danger zone. Both inherit auth + requireRole("admin") from the router.use
// above, and both additionally require the acting admin's own password in the
// body - see confirmAdminPassword in the controller for why a token is not
// enough on its own.
//
// DELETE /expenses is declared before /people/:id purely for readability; they
// cannot collide because the paths differ at the first segment. The ordering
// that DOES matter in this app is /expenses/export before /expenses/:id, which
// is why that comment lives in expenseRoutes.js.
router.delete("/expenses", resetAllExpenses);
router.delete("/people/:id", deleteUserAccount);

module.exports = router;
