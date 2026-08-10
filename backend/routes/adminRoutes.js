const express = require("express");
const router = express.Router();

const {
    getOverview, getAllExpenses, getTeam, createTeamMember,
    getPeople, getPerson, exportExpenses,
} = require("../controllers/adminController");
const auth = require("../middleware/authMiddleware");
const { requireRole } = require("../middleware/roleMiddleware");

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

module.exports = router;
