#!/usr/bin/env node
/**
 * Tests the email settings on their own.
 *
 *   npm run test:email                  -> sends to SMTP_USER
 *   npm run test:email you@example.com  -> sends to that address
 *
 * Why this exists as a separate script: Gmail's rejections are terse and they
 * look identical to an application bug when they arrive through three layers of
 * app. Run this first. If it says OK, the settings are right and anything still
 * failing is the app's problem. If it fails, it prints the actual reason and
 * what to do about it.
 */
require("dotenv").config();
const nodemailer = require("nodemailer");

const need = ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS"];
const missing = need.filter((k) => !process.env[k]);

const line = (s = "") => console.log("  " + s);

if (missing.length) {
    console.log("\n  Email is not configured.\n");
    line("Missing from backend/.env:  " + missing.join(", "));
    line("");
    line("Add these five lines to backend/.env and run this again:");
    line("");
    line("  SMTP_HOST=smtp.gmail.com");
    line("  SMTP_PORT=587");
    line("  SMTP_USER=youraddress@gmail.com");
    line("  SMTP_PASS=your16charapppassword");
    line("  SMTP_FROM=Expense Tracker <youraddress@gmail.com>");
    line("");
    process.exit(1);
}

const pass = process.env.SMTP_PASS;
const to = process.argv[2] || process.env.SMTP_USER;

console.log("\n  Testing email settings\n");
line(`host      ${process.env.SMTP_HOST}:${process.env.SMTP_PORT}`);
line(`user      ${process.env.SMTP_USER}`);
line(`password  ${pass.length} characters${/\s/.test(pass) ? "  <-- CONTAINS SPACES, remove them" : ""}`);
line(`sending to  ${to}`);
line("");

// A Gmail app password is always 16 characters. Flagging it here turns the most
// common mistake into a sentence rather than a 535 error five steps later.
if (process.env.SMTP_HOST.includes("gmail") && pass.replace(/\s/g, "").length !== 16) {
    line(`NOTE: Gmail app passwords are 16 characters. Yours is ${pass.replace(/\s/g, "").length}.`);
    line("      A normal Gmail password will not work here.");
    line("");
}

const transport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass },
    // Without these nodemailer waits forever. On a network that silently drops
    // port 587 - plenty of office and college networks do - the script would
    // just sit there with no output at all, which reads as "it froze" rather
    // than "your network is blocking this".
    connectionTimeout: 15000,
    greetingTimeout: 10000,
    socketTimeout: 20000,
});

const explain = (err) => {
    const m = `${err.message} ${err.response || ""}`;
    if (/535|Username and Password not accepted|BadCredentials/i.test(m)) {
        return [
            "Gmail refused the username or password.",
            "",
            "  - SMTP_PASS must be an APP PASSWORD, not the normal Gmail password.",
            "  - Turn on 2-Step Verification first, then generate one at",
            "    https://myaccount.google.com/apppasswords",
            "  - Paste all 16 characters with no spaces.",
            "  - SMTP_USER must be the same account the app password belongs to.",
        ];
    }
    if (/ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|Greeting never received|timeout/i.test(m)) {
        return [
            "Could not reach the mail server.",
            "",
            "  - Check SMTP_HOST and SMTP_PORT are spelled correctly.",
            "  - Many office, college and hotel networks block port 587.",
            "    Test on a phone hotspot to rule that out.",
            "  - If the hotspot works, use SMTP_PORT=465 on the blocked network.",
        ];
    }
    if (/self.signed|certificate|SSL|wrong version number/i.test(m)) {
        return [
            "TLS handshake failed - usually the wrong port.",
            "",
            "  - Port 587 needs SMTP_PORT=587 (STARTTLS).",
            "  - Port 465 needs SMTP_PORT=465 (implicit TLS).",
        ];
    }
    return ["The mail server rejected the request.", "", "  " + m.trim()];
};

(async () => {
    try {
        process.stdout.write("  1. connecting and signing in ... ");
        await transport.verify();
        console.log("OK");

        process.stdout.write("  2. sending a test message ..... ");
        const info = await transport.sendMail({
            from: process.env.SMTP_FROM || process.env.SMTP_USER,
            to,
            subject: "Expense Tracker - email is working",
            text: "If you are reading this, the password reset codes will arrive by email.",
        });
        console.log("OK");
        line("");
        line(`Sent. Message id ${info.messageId}`);
        line(`Check the inbox for ${to} (look in Spam too, the first one often lands there).`);
        line("");
        line("Email is set up. Restart the backend and the reset codes will be emailed.");
        line("");
        process.exit(0);
    } catch (err) {
        console.log("FAILED");
        line("");
        explain(err).forEach(line);
        line("");
        line(`(raw: ${err.message})`);
        line("");
        process.exit(1);
    }
})();
