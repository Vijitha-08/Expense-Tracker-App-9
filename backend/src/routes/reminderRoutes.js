const express = require("express");
const router = express.Router();

const {
    listReminders, saveReminder, updateReminder, deleteReminder,
    markPaid, unmarkPaid,
} = require("../controllers/reminderController");
const auth = require("../middlewares/authMiddleware");
const { requireRole } = require("../middlewares/roleMiddleware");

// Applied once at the router level, so a route added below cannot accidentally
// ship without auth - the same pattern adminRoutes.js and expenseRoutes.js use.
//
// requireRole("user") rather than auth alone, and for the same reason
// expenseRoutes.js gives: admins oversee other people's spending rather than
// filing their own, so they have no expenses of their own to be reminded about.
// An admin token here gets a 403 instead of an empty page that looks broken.
router.use(auth, requireRole("user"));

router.get("/", listReminders);
// POST is an upsert - one reminder per expense, enforced by UNIQUE (expense_id)
// in the model - so saving the same expense twice edits rather than duplicates.
router.post("/", saveReminder);
router.put("/:id", updateReminder);
// A sub-resource rather than a field on PUT /:id, because marking paid is not a
// settings change: it CREATES an expense. Keeping it on its own verb means the
// edit form can never fire it by accident, and the 409 for a double-pay has
// somewhere unambiguous to live.
router.post("/:id/paid", markPaid);
router.delete("/:id/paid", unmarkPaid);
router.delete("/:id", deleteReminder);

module.exports = router;
