import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
    FiMail, FiLock, FiAlertCircle, FiCheckCircle, FiArrowLeft,
    FiEye, FiEyeOff, FiShield, FiClock,
} from "react-icons/fi";
import AuthShell from "../Layouts/AuthShell";
import AuthIntro from "../components/AuthIntro";
import { requestResetCode, verifyResetCode, resetPassword } from "../services/authService";

// The flow the reviewer asked for, in the order they asked for it:
//
//   click Forgot password -> enter email -> code arrives by email
//   -> enter the code -> choose a new password
//
// Three separate steps rather than one long form. A wrong code is caught before
// somebody types a new password twice, and each step only asks for the one
// thing it needs.
const STEPS = ["email", "code", "password"];

const ForgotPassword = () => {
    const navigate = useNavigate();
    const [step, setStep] = useState("email");
    const [email, setEmail] = useState("");
    const [code, setCode] = useState("");
    const [password, setPassword] = useState("");
    const [confirm, setConfirm] = useState("");
    const [show, setShow] = useState(false);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState("");
    const [note, setNote] = useState("");
    const [mailOff, setMailOff] = useState(false);

    const fail = (err) =>
        setError(err.response?.data?.message || err.message || "Something went wrong");

    const sendCode = async (e) => {
        e?.preventDefault();
        setError(""); setNote(""); setBusy(true);
        try {
            const data = await requestResetCode(email.trim().toLowerCase());
            // The reply is the same whether or not the address has an account,
            // so the wording here cannot promise an email is coming.
            setMailOff(data.emailConfigured === false);
            setNote(data.message);
            setStep("code");
        } catch (err) { fail(err); } finally { setBusy(false); }
    };

    const checkCode = async (e) => {
        e.preventDefault();
        setError(""); setBusy(true);
        try {
            await verifyResetCode({ email: email.trim().toLowerCase(), code: code.trim() });
            setNote("");
            setStep("password");
        } catch (err) { fail(err); } finally { setBusy(false); }
    };

    const save = async (e) => {
        e.preventDefault();
        setError("");
        if (password.length < 8) return setError("Password must be at least 8 characters");
        if (password !== confirm) return setError("The two passwords do not match");
        setBusy(true);
        try {
            await resetPassword({
                email: email.trim().toLowerCase(), code: code.trim(), newPassword: password,
            });
            navigate("/login", { replace: true, state: { reset: true } });
        } catch (err) { fail(err); } finally { setBusy(false); }
    };

    return (
        <AuthShell
            left={
                <AuthIntro
                    badge="Account recovery"
                    badgeIcon={<FiShield aria-hidden="true" />}
                    title="Reset your"
                    highlight="password."
                    lead="We email a six-digit code to the address on your account. Enter it here and choose a new password."
                    pills={[
                        { Icon: FiMail, text: "The code arrives by email" },
                        { Icon: FiClock, text: "It expires after 10 minutes" },
                        { Icon: FiLock, text: "It can only be used once" },
                    ]}
                    quoteLabel="Why a code"
                    quoteText="A code sent to your inbox proves you can read the email on the account, so nobody ever has to be emailed a password."
                />
            }
        >
            <span className="auth-badge"><FiShield aria-hidden="true" /> Password reset</span>

            <ol className="auth-steps" aria-label="Progress">
                {STEPS.map((s, i) => (
                    <li
                        key={s}
                        className={
                            s === step ? "auth-step auth-step--on"
                                : STEPS.indexOf(step) > i ? "auth-step auth-step--done"
                                    : "auth-step"
                        }
                    >
                        <span>{i + 1}</span>
                        {s === "email" ? "Your email" : s === "code" ? "Code" : "New password"}
                    </li>
                ))}
            </ol>

            {error && (
                <div className="auth-alert auth-alert--error" role="alert">
                    <FiAlertCircle aria-hidden="true" /> {error}
                </div>
            )}
            {note && !error && (
                <div className="auth-alert auth-alert--ok">
                    <FiCheckCircle aria-hidden="true" /> {note}
                </div>
            )}
            {mailOff && step !== "email" && (
                <div className="auth-alert auth-alert--warn">
                    <FiAlertCircle aria-hidden="true" />
                    Email is not set up on this server yet, so nothing will arrive in your
                    inbox. The code is printed in the backend terminal instead.
                </div>
            )}

            {step === "email" && (
                <>
                    <h2>Forgot your password?</h2>
                    <p className="auth-card-sub">
                        Enter the email address on your account and we will send a code to it.
                    </p>
                    <form className="auth-form" onSubmit={sendCode} noValidate>
                        <div className="auth-field">
                            <label htmlFor="fp-email">Email address</label>
                            <div className="auth-input">
                                <FiMail aria-hidden="true" />
                                <input
                                    id="fp-email" type="email" name="email" autoComplete="email"
                                    placeholder="Enter your email" value={email}
                                    onChange={(e) => setEmail(e.target.value)} required autoFocus
                                />
                            </div>
                        </div>
                        <button type="submit" className="auth-submit" disabled={busy}>
                            {busy ? "Sending..." : "Send the code"}
                        </button>
                    </form>
                </>
            )}

            {step === "code" && (
                <>
                    <h2>Enter the code</h2>
                    <p className="auth-card-sub">
                        We sent a six-digit code to <b>{email}</b>. It expires in 10 minutes.
                    </p>
                    <form className="auth-form" onSubmit={checkCode} noValidate>
                        <div className="auth-field">
                            <label htmlFor="fp-code">Six-digit code</label>
                            <div className="auth-input">
                                <FiLock aria-hidden="true" />
                                <input
                                    id="fp-code" name="code"
                                    /* text, not number: a leading zero is part of the
                                       code and a number input would eat it */
                                    type="text" inputMode="numeric" autoComplete="one-time-code"
                                    maxLength={6} placeholder="000000"
                                    className="auth-code" value={code}
                                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                                    required autoFocus
                                />
                            </div>
                        </div>
                        <button type="submit" className="auth-submit" disabled={busy || code.length < 6}>
                            {busy ? "Checking..." : "Continue"}
                        </button>
                    </form>
                    <p className="auth-foot">
                        Did not get it?
                        <button type="button" className="auth-linkbtn" onClick={sendCode} disabled={busy}>
                            Send another
                        </button>
                    </p>
                </>
            )}

            {step === "password" && (
                <>
                    <h2>Choose a new password</h2>
                    <p className="auth-card-sub">At least 8 characters. Stored as a bcrypt hash.</p>
                    <form className="auth-form" onSubmit={save} noValidate>
                        <div className="auth-field">
                            <label htmlFor="fp-new">New password</label>
                            <div className="auth-input">
                                <FiLock aria-hidden="true" />
                                <input
                                    id="fp-new" name="newPassword"
                                    type={show ? "text" : "password"}
                                    autoComplete="new-password" placeholder="Enter a new password"
                                    value={password} onChange={(e) => setPassword(e.target.value)}
                                    required autoFocus
                                />
                                <button
                                    type="button" className="auth-eye"
                                    aria-label={show ? "Hide password" : "Show password"}
                                    onClick={() => setShow((v) => !v)}
                                >
                                    {show ? <FiEyeOff /> : <FiEye />}
                                </button>
                            </div>
                        </div>
                        <div className="auth-field">
                            <label htmlFor="fp-confirm">Confirm new password</label>
                            <div className="auth-input">
                                <FiLock aria-hidden="true" />
                                <input
                                    id="fp-confirm" name="confirmPassword"
                                    type={show ? "text" : "password"}
                                    autoComplete="new-password" placeholder="Type it again"
                                    value={confirm} onChange={(e) => setConfirm(e.target.value)}
                                    required
                                />
                            </div>
                        </div>
                        <button type="submit" className="auth-submit" disabled={busy}>
                            {busy ? "Saving..." : "Save the new password"}
                        </button>
                    </form>
                </>
            )}

            <p className="auth-foot">
                <Link to="/login" className="auth-linkback">
                    <FiArrowLeft aria-hidden="true" /> Back to sign in
                </Link>
            </p>
        </AuthShell>
    );
};

export default ForgotPassword;
