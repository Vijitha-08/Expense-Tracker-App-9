const nodemailer = require("nodemailer");

// Email delivery for the password-reset code.
//
// The honest position on this: an app cannot send email without an account to
// send it from. If SMTP_* is not configured, nothing arrives in anybody's inbox
// - no library changes that. So this module does two things:
//
//   1. If SMTP is configured, it sends for real.
//   2. If it is not, it does NOT pretend to. It returns delivered:false and
//      logs the code to the server console so the flow can still be walked
//      through end to end while credentials are being sorted out.
//
// The console fallback is refused when NODE_ENV=production, because a reset
// code in a production log is a way into every account on the system.
const CONFIGURED = Boolean(
    process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS
);

let transport = null;
const getTransport = () => {
    if (!transport) {
        transport = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: Number(process.env.SMTP_PORT) || 587,
            // 465 is implicit TLS; 587 upgrades with STARTTLS.
            secure: Number(process.env.SMTP_PORT) === 465,
            auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
            // Nodemailer waits indefinitely by default. On a network that
            // silently drops port 587 that would hang the forgot-password
            // request rather than failing it, leaving the page spinning with
            // no error at all. Fail fast and let the 502 explain itself.
            connectionTimeout: 10000,
            greetingTimeout: 8000,
            socketTimeout: 15000,
        });
    }
    return transport;
};

const plain = (name, code, minutes) =>
    `Hi ${name},

Your Expense Tracker password reset code is:

    ${code}

It expires in ${minutes} minutes and can be used once.

If you did not ask to reset your password, you can ignore this email - your
current password still works and nothing has changed.`;

const html = (name, code, minutes) => `
<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
            max-width:520px;margin:0 auto;padding:8px 4px;color:#0f172a">
  <p style="font-size:15px">Hi ${name},</p>
  <p style="font-size:15px;color:#334155">
    Here is your password reset code for <b>Expense Tracker</b>.
  </p>
  <div style="margin:22px 0;padding:18px;text-align:center;
              background:#eef0fe;border:1px solid #dcdffb;border-radius:14px">
    <div style="font-size:32px;font-weight:800;letter-spacing:.22em;
                font-variant-numeric:tabular-nums;color:#4f46e5">${code}</div>
  </div>
  <p style="font-size:13.5px;color:#64748b">
    It expires in ${minutes} minutes and can be used once.
  </p>
  <p style="font-size:13.5px;color:#64748b">
    If you did not ask to reset your password you can ignore this email &mdash;
    your current password still works and nothing has changed.
  </p>
</div>`;

// Can we actually reach the mail server?
//
// This is checked BEFORE the account lookup, and that ordering is the whole
// point. If it were checked after, a broken mail server would answer "502" for
// a real address and "200" for a made-up one - handing an attacker exactly the
// account-enumeration oracle the vague reply exists to prevent. Checked first,
// the answer depends only on the health of the server.
//
// Cached briefly so a burst of requests does not open a connection each time.
const VERIFY_TTL_MS = 30000;
let lastVerify = { at: 0, ok: false, error: null };

const verifyTransport = async () => {
    if (!CONFIGURED) return { ok: false, error: "not configured" };
    if (Date.now() - lastVerify.at < VERIFY_TTL_MS) return lastVerify;
    try {
        await getTransport().verify();
        lastVerify = { at: Date.now(), ok: true, error: null };
    } catch (err) {
        // Drop the cached transport: a bad password or a changed host needs a
        // fresh connection once the settings are corrected.
        transport = null;
        lastVerify = { at: Date.now(), ok: false, error: err.message };
    }
    return lastVerify;
};

const sendResetCode = async ({ to, name, code, minutes }) => {
    if (!CONFIGURED) {
        if (process.env.NODE_ENV === "production") {
            // Refuse rather than print a working credential into a production log.
            throw new Error("SMTP is not configured");
        }
        console.log(
            `\n  [reset code] SMTP not configured - not emailed.` +
            `\n  ${to} -> ${code}  (expires in ${minutes} minutes)` +
            `\n  Set SMTP_HOST / SMTP_USER / SMTP_PASS in backend/.env to send this by email.\n`
        );
        return { delivered: false };
    }

    await getTransport().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject: "Your Expense Tracker password reset code",
        text: plain(name, code, minutes),
        html: html(name, code, minutes),
    });
    return { delivered: true };
};

// ------------------------------------------------------------------
// Contact form notification
// ------------------------------------------------------------------
// A different shape of email from the reset code, and the differences are the
// point:
//
//   * it goes TO the site owner, not to the person who filled in the form, so
//     the address comes from CONTACT_TO (falling back to SMTP_USER - the account
//     already sending, which is a sane default rather than a silent nowhere).
//   * replyTo is the sender, so hitting Reply in a mail client answers them
//     without anybody copying an address out by hand.
//   * it does NOT throw in production when SMTP is unconfigured. sendResetCode
//     refuses because the alternative is printing a working credential into a
//     log. There is no credential here, and the message is already saved in the
//     database - refusing would turn "we could not email you about it" into "we
//     could not accept it", which is worse and untrue.
const contactPlain = ({ name, email, message, id }) =>
    `New message from the Expense Tracker contact form.

From:    ${name} <${email}>
Message #${id}

${message}

Reply to this email to answer them directly.`;

// The sender's words go in a <pre> so line breaks survive, and it is the only
// place in this file that renders text somebody else typed. React escapes for
// us everywhere in the app EXCEPT here, where the HTML is built by hand - so it
// is escaped explicitly. Without this, a message containing "<script>" would be
// live markup in whoever opens the notification.
const escapeHtml = (s) =>
    String(s)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");

const contactHtml = ({ name, email, message, id }) => `
<div style="font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif;
            max-width:560px;margin:0 auto;padding:8px 4px;color:#0f172a">
  <p style="font-size:15px;margin:0 0 4px">
    New message from the <b>Expense Tracker</b> contact form.
  </p>
  <p style="font-size:13.5px;color:#5e6e85;margin:0 0 18px">
    Message #${id} &middot; reply to this email to answer them directly.
  </p>
  <table style="font-size:14px;border-collapse:collapse;margin-bottom:16px">
    <tr><td style="padding:2px 12px 2px 0;color:#5e6e85">Name</td>
        <td style="padding:2px 0"><b>${escapeHtml(name)}</b></td></tr>
    <tr><td style="padding:2px 12px 2px 0;color:#5e6e85">Email</td>
        <td style="padding:2px 0"><a href="mailto:${escapeHtml(email)}"
            style="color:#4f46e5">${escapeHtml(email)}</a></td></tr>
  </table>
  <pre style="margin:0;padding:16px;background:#f6f7fb;border:1px solid #e4e7f2;
              border-radius:12px;font:inherit;font-size:14.5px;
              white-space:pre-wrap;word-break:break-word">${escapeHtml(message)}</pre>
</div>`;

const sendContactMessage = async ({ name, email, message, id }) => {
    if (!CONFIGURED) {
        console.log(
            `\n  [contact form] SMTP not configured - not emailed.` +
            `\n  #${id} from ${name} <${email}>` +
            `\n  The message IS saved in contact_messages.` +
            `\n  Set SMTP_HOST / SMTP_USER / SMTP_PASS in backend/.env to be notified by email.\n`
        );
        return { delivered: false };
    }

    await getTransport().sendMail({
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to: process.env.CONTACT_TO || process.env.SMTP_USER,
        // Not `from`: some providers refuse to send a message claiming to be
        // from an address they do not own, which is why the sender goes here.
        replyTo: `${name} <${email}>`,
        subject: `Contact form: ${name}`,
        text: contactPlain({ name, email, message, id }),
        html: contactHtml({ name, email, message, id }),
    });
    return { delivered: true };
};

module.exports = {
    sendResetCode,
    sendContactMessage,
    verifyTransport,
    mailConfigured: () => CONFIGURED,
};
