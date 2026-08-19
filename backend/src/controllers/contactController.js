const { createMessage, markEmailed, countRecentFrom } = require("../models/contactModel");
const { sendContactMessage, mailConfigured } = require("../services/mailer");

// The public "Contact Us" form on the landing page.
//
// Public by necessity: somebody who has not signed up is exactly who this form
// is for, so there is no token to check. That makes it the only unauthenticated
// WRITE endpoint in the app, which is why it carries its own limits instead of
// borrowing the login ones.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

// Matched to the column widths in contactModel so a long paste is trimmed here
// rather than rejected by Postgres with a 500.
const LIMITS = { name: 100, email: 150, message: 2000 };

// Two ceilings, because they fail differently:
//
//   * per IP, in memory - stops a script hammering the endpoint right now.
//     Immediate and free, but lost on restart.
//   * per email, in the database - stops the same person filling the table over
//     an afternoon, and survives a restart.
//
// Deliberately NOT a rate-limit library: one endpoint does not justify a new
// dependency, and express-rate-limit is not in package.json.
//
// WORTH KNOWING: req.ip is the socket address unless Express is told to trust a
// proxy. Behind one (Render, nginx, Cloudflare) every request looks like the
// same IP, so the per-IP gate gets stricter, not looser - it fails safe. If this
// is ever deployed behind a proxy, set `app.set("trust proxy", 1)` in server.js
// so the real address is used.
const IP_WINDOW_MS = 60 * 60 * 1000;
const IP_MAX = 5;
const EMAIL_WINDOW_MS = 24 * 60 * 60 * 1000;
const EMAIL_MAX = 10;

const hits = new Map();     // ip -> array of timestamps inside the window

// Swept on read rather than on a timer: a setInterval started from a request
// handler keeps the process alive and never gets cleared in tests.
const recentHits = (ip, now) => {
    const fresh = (hits.get(ip) || []).filter((t) => now - t < IP_WINDOW_MS);
    if (fresh.length) hits.set(ip, fresh);
    else hits.delete(ip);
    return fresh;
};

const clean = (value, max) => String(value ?? "").trim().slice(0, max);

const sendMessage = async (req, res) => {
    const now = Date.now();
    const ip = req.ip || req.socket?.remoteAddress || "unknown";

    const name = clean(req.body?.name, LIMITS.name);
    const email = clean(req.body?.email, LIMITS.email).toLowerCase();
    const message = clean(req.body?.message, LIMITS.message);

    // Checked field by field. "Please fill in the form" makes somebody hunt for
    // which box is wrong, and the form marks the field this names.
    if (name.length < 2) {
        return res.status(400).json({ message: "Please enter your name.", field: "name" });
    }
    if (!EMAIL_RE.test(email)) {
        return res.status(400).json({ message: "Please enter a valid email address.", field: "email" });
    }
    if (message.length < 10) {
        return res.status(400).json({
            message: "Please write a little more so we know what you need - at least 10 characters.",
            field: "message",
        });
    }

    const fresh = recentHits(ip, now);
    if (fresh.length >= IP_MAX) {
        const wait = Math.max(1, Math.ceil((IP_WINDOW_MS - (now - fresh[0])) / 60000));
        return res.status(429).json({
            message: `That is a lot of messages at once. Please try again in about ${wait} minute${wait === 1 ? "" : "s"}.`,
        });
    }

    try {
        if ((await countRecentFrom(email, new Date(now - EMAIL_WINDOW_MS))) >= EMAIL_MAX) {
            return res.status(429).json({
                message: "We already have several messages from this address today - we will reply to those first.",
            });
        }

        const row = await createMessage({ name, email, message });
        // Counted only once the row is actually in. A request rejected above
        // should not spend somebody's allowance.
        hits.set(ip, [...fresh, now]);

        // "Stored" is the promise this endpoint keeps, so a mail failure is
        // logged and swallowed rather than turned into a 500 that tells the
        // sender their message did not arrive. It did.
        let delivered = false;
        try {
            ({ delivered } = await sendContactMessage({ name, email, message, id: row.id }));
            if (delivered) await markEmailed(row.id);
        } catch (err) {
            console.error(`contact message #${row.id} was saved but not emailed:`, err.message);
        }

        return res.status(201).json({
            message: "Thanks — your message has reached us. We will reply to that email address.",
            id: row.id,
            delivered,
            emailConfigured: mailConfigured(),
        });
    } catch (err) {
        console.error("contact form failed:", err);
        return res.status(500).json({ message: "Could not send your message. Please try again." });
    }
};

module.exports = { sendMessage };
