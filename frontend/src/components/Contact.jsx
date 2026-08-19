import { useState } from "react";
import { FiAlertCircle, FiCheckCircle, FiSend } from "react-icons/fi";
import { sendContactMessage } from "../services/contactService";

// The form was inert: no state, no submit handler, no `name` attributes, so
// pressing Send Message reloaded the page with the fields in the URL and threw
// the message away. It now posts to POST /api/contact, which stores the row and
// emails a notification.
//
// The look is unchanged on purpose - same three fields, same placeholders, same
// full-width button - because that is the design that was signed off. What is
// added is everything a form needs but had none of:
//
//   * labels. Every field had a placeholder and nothing else, which is not a
//     label: it disappears the moment you type, so anyone who looks away loses
//     which box they are in, and a screen reader announces three unnamed inputs.
//     They are `.sr-only` here rather than visible, so the rendered design does
//     not move.
//   * `name`, `autoComplete` and `type`, so a browser can fill the first two.
//   * a busy state, so a slow network cannot send the same message five times.
//   * somewhere for the answer to appear. A form that silently succeeds is
//     indistinguishable from a form that silently fails.
const EMPTY = { name: "", email: "", message: "" };

const Contact = () => {
    const [form, setForm] = useState(EMPTY);
    const [busy, setBusy] = useState(false);
    const [ok, setOk] = useState("");
    const [error, setError] = useState("");

    const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

    const submit = async (e) => {
        e.preventDefault();
        if (busy) return;
        setBusy(true);
        setError("");
        setOk("");
        try {
            const res = await sendContactMessage(form);
            // Cleared only on success. On a failure the words somebody typed are
            // still in the boxes, which is the difference between "try again" and
            // "type it all again".
            setForm(EMPTY);
            setOk(res.message || "Thanks — your message has reached us.");
        } catch (err) {
            setError(err.message || "Could not send your message. Please try again.");
        } finally {
            setBusy(false);
        }
    };

    return (
        <section id="contact" className="contact">
            <h2>Contact Us</h2>
            <p>Have questions? We&apos;d love to hear from you.</p>

            <form className="contact-form" onSubmit={submit} noValidate>
                {/* role="alert" so the reply is announced, and aria-live means a
                    sighted keyboard user who has already tabbed past sees it
                    too. Rendered above the fields: below the button it would be
                    off-screen on a phone at the moment it appears. */}
                {error && (
                    <p className="contact-note contact-note-bad" role="alert">
                        <FiAlertCircle aria-hidden="true" /> {error}
                    </p>
                )}
                {ok && (
                    <p className="contact-note contact-note-ok" role="status">
                        <FiCheckCircle aria-hidden="true" /> {ok}
                    </p>
                )}

                <label className="sr-only" htmlFor="contact-name">Your name</label>
                <input
                    id="contact-name"
                    name="name"
                    type="text"
                    placeholder="Your Name"
                    autoComplete="name"
                    maxLength={100}
                    required
                    value={form.name}
                    onChange={set("name")}
                    disabled={busy}
                />

                <label className="sr-only" htmlFor="contact-email">Your email</label>
                <input
                    id="contact-email"
                    name="email"
                    type="email"
                    placeholder="Your Email"
                    autoComplete="email"
                    maxLength={150}
                    required
                    value={form.email}
                    onChange={set("email")}
                    disabled={busy}
                />

                <label className="sr-only" htmlFor="contact-message">Your message</label>
                <textarea
                    id="contact-message"
                    name="message"
                    placeholder="Your Message"
                    maxLength={2000}
                    required
                    value={form.message}
                    onChange={set("message")}
                    disabled={busy}
                ></textarea>

                <button type="submit" disabled={busy}>
                    {busy ? "Sending..." : <><FiSend aria-hidden="true" /> Send Message</>}
                </button>
            </form>
        </section>
    );
};

export default Contact;
