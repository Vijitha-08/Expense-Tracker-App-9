import { useState } from "react";
import { useNavigate, useLocation, Link, useSearchParams } from "react-router-dom";
import {
  FiMail, FiLock, FiEye, FiEyeOff, FiAlertCircle,
  FiZap, FiPieChart, FiCheckSquare, FiLayers,
} from "react-icons/fi";
import AuthShell from "../components/AuthShell";
import AuthIntro from "../components/AuthIntro";
import { useAuth } from "../context/useAuth";
import { dashboardPath } from "../services/authService";

const PILLS = [
  { Icon: FiLayers, text: "Submit an expense in seconds" },
  { Icon: FiCheckSquare, text: "Monthly trend and top categories" },
  { Icon: FiPieChart, text: "See a category breakdown instantly" },
];

const LoginPage = () => {
  const [showPassword, setShowPassword] = useState(false);
  const [formData, setFormData] = useState({ email: "", password: "" });
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const expired = searchParams.get("expired");

  const handleChange = (e) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
    setError("");
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const user = await login({ ...formData, remember });
      navigate(location.state?.from || dashboardPath(user.role), { replace: true });
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
          badge="Welcome back"
          badgeIcon={<FiZap aria-hidden="true" />}
          title="Continue tracking your"
          highlight="expenses."
          lead="Sign in to track your expenses, or - if you are an administrator - to see what everyone has spent."
          pills={PILLS}
          quoteLabel="Secure sign in"
          quoteText="Passwords are hashed with bcrypt and every request is verified against a signed token."
        />
      }
    >
      <span className="auth-badge"><FiLock aria-hidden="true" /> System access</span>
      <h2>Sign in to your account</h2>
      <p className="auth-card-sub">Enter your credentials to access your dashboard.</p>

      {expired && !error && (
        <div className="auth-alert auth-alert--warn">
          <FiAlertCircle aria-hidden="true" />
          Your session expired. Please sign in again.
        </div>
      )}
      {error && (
        <div className="auth-alert auth-alert--error" role="alert">
          <FiAlertCircle aria-hidden="true" />
          {error}
        </div>
      )}

      <form className="auth-form" onSubmit={handleSubmit} noValidate>
        <div className="auth-field">
          <label htmlFor="email">Email address</label>
          <div className="auth-input">
            <FiMail aria-hidden="true" />
            <input
              id="email"
              type="email"
              name="email"
              autoComplete="email"
              placeholder="Enter your email"
              value={formData.email}
              onChange={handleChange}
              required
            />
          </div>
        </div>

        <div className="auth-field">
          <label htmlFor="password">Password</label>
          <div className="auth-input">
            <FiLock aria-hidden="true" />
            <input
              id="password"
              type={showPassword ? "text" : "password"}
              name="password"
              autoComplete="current-password"
              placeholder="Enter your password"
              value={formData.password}
              onChange={handleChange}
              required
            />
            <button
              type="button"
              className="auth-eye"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((v) => !v)}
            >
              {showPassword ? <FiEyeOff /> : <FiEye />}
            </button>
          </div>
        </div>

        <div className="auth-row">
          <label className="auth-remember">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
            />
            Remember me
          </label>
        </div>

        <button type="submit" className="auth-submit" disabled={submitting}>
          {submitting ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <p className="auth-foot">
        Don&apos;t have an account?<Link to="/register">Sign up</Link>
      </p>
    </AuthShell>
  );
};

export default LoginPage;
