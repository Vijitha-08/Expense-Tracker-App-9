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

module.exports = { sendResetCode, mailConfigured: () => CONFIGURED };
