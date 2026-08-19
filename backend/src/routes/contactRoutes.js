const express = require("express");
const router = express.Router();

const { sendMessage } = require("../controllers/contactController");

// No auth middleware, on purpose: the form sits on the public landing page and
// the people it is for do not have accounts yet. The abuse controls - a length
// ceiling per field, a per-IP hourly cap and a per-address daily cap - are in
// the controller rather than here, because they need the request body.
router.post("/", sendMessage);

module.exports = router;
