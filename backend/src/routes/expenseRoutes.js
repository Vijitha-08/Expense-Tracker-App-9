const express = require("express");
const router = express.Router();

const {
    addExpense, getExpenses,
    getExpense, updateExpense, deleteExpense, getSummary,
} = require("../controllers/expenseController");
const auth = require("../middlewares/authMiddleware");
const { requireRole } = require("../middlewares/roleMiddleware");

// Every route here is the owner's own expenses. Admins are deliberately
// excluded: they oversee other people's spending rather than filing their own,
// and their views live under /api/admin. Blocking the role here means an
// admin token cannot quietly create rows that no admin view would show.
router.use(auth, requireRole("user"));

router.get("/summary", getSummary);
router.post("/", addExpense);
router.get("/", getExpenses);
router.get("/:id", getExpense);
router.put("/:id", updateExpense);
router.delete("/:id", deleteExpense);

module.exports = router;
