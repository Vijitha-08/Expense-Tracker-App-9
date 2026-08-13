import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import {
  FiUser, FiMail, FiLock, FiEye, FiEyeOff, FiAlertCircle, FiInfo,
} from "react-icons/fi";
import AuthShell from "../Layouts/AuthShell";
import AuthIntro from "../components/AuthIntro";
import { useAuth } from "../context/useAuth";
import { dashboardPath } from "../services/authService";

// One implementation for every role. The role is a prop, so the pages cannot
// drift apart the way the original three identical register pages did.
const RegisterForm = ({
  role, badge, badgeIcon, title, highlight, lead, pills,
  quoteLabel, quoteText, cardBadge, cardTitle, cardSub, note,
}) => {
  const [formData, setFormData] = useState({
    name: "", email: "", password: "", confirmPassword: "",
  });
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { register } = useAuth();
  const navigate = useNavigate();

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");

    if (formData.password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (formData.password !== formData.confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const user = await register({
        name: formData.name,
        email: formData.email,
        password: formData.password,
        role,
      });
      navigate(dashboardPath(user.role), { replace: true });
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <AuthShell
      left={
        <AuthIntro
          badge={badge}
          badgeIcon={badgeIcon}
          title={title}
          highlight={highlight}
          lead={lead}
          pills={pills}
          quoteLabel={quoteLabel}
          quoteText={quoteText}
        />
      }
    >
      <span className="auth-badge">{cardBadge}</span>
      <h2>{cardTitle}</h2>
      <p className="auth-card-sub">{cardSub}</p>

      {note && (
        <p className="auth-note">
          <FiInfo aria-hidden="true" />
          {note}
        </p>
      )}

      {error && (
        <div className="auth-alert auth-alert--error" role="alert">
          <FiAlertCircle aria-hidden="true" />
          {error}
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="name">Full name</label>
          <div className="auth-input">
            <FiUser aria-hidden="true" />
            <input id="name" type="text" name="name" autoComplete="name"
                   placeholder="Enter your full name"
                   value={formData.name} onChange={handleChange} required />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="email">Email address</label>
          <div className="auth-input">
            <FiMail aria-hidden="true" />
            <input id="email" type="email" name="email" autoComplete="email"
                   placeholder="Enter your email"
                   value={formData.email} onChange={handleChange} required />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <div className="auth-input">
            <FiLock aria-hidden="true" />
            <input id="password" type={showPassword ? "text" : "password"} name="password"
                   autoComplete="new-password" placeholder="At least 8 characters"
                   value={formData.password} onChange={handleChange} required />
            <button type="button" className="auth-eye"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    onClick={() => setShowPassword((v) => !v)}>
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="confirmPassword">Confirm password</label>
          <div className="auth-input">
            <FiLock aria-hidden="true" />
            <input id="confirmPassword" type={showPassword ? "text" : "password"}
                   name="confirmPassword" autoComplete="new-password"
                   placeholder="Re-enter your password"
                   value={formData.confirmPassword} onChange={handleChange} required />
          </div>
        </div>

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <p className="auth-foot">
        Already have an account?<Link to="/login">Sign in</Link>
      </p>
      <p className="auth-foot" style={{ marginTop: 10 }}>
        <Link to="/register">Choose a different account type</Link>
      </p>
    </AuthShell>
  );
};

export default RegisterForm;
