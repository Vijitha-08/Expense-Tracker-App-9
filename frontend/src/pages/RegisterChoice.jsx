import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  FiUser, FiShield, FiUserPlus, FiLayers, FiCheckSquare, FiLock,
} from "react-icons/fi";
import AuthShell from "../components/AuthShell";
import AuthIntro from "../components/AuthIntro";
import { fetchSetupState } from "../services/authService";

const RegisterChoice = () => {
  // The admin option is only offered while the app has no administrator yet.
  // Start as `true` so the option never flashes on screen and then disappears
  // on an installation that already has one.
  const [adminExists, setAdminExists] = useState(true);

  useEffect(() => {
    let cancelled = false;
    fetchSetupState()
      .then((s) => { if (!cancelled) setAdminExists(Boolean(s.adminExists)); })
      .catch(() => { /* leave it hidden - fail closed */ });
    return () => { cancelled = true; };
  }, []);

  return (
    <AuthShell
      left={
        <AuthIntro
          badge="Join our community"
          badgeIcon={<FiUserPlus aria-hidden="true" />}
          title="Start managing your"
          highlight="expenses today."
          lead="Create your account to record expenses, tag them by category, and see exactly where your money goes."
          pills={[
            { Icon: FiLayers, text: "Submit an expense in seconds" },
            { Icon: FiCheckSquare, text: "Category breakdown and monthly trend" },
            { Icon: FiLock, text: "Only you and an admin can see it" },
          ]}
          quoteLabel="Secure registration"
          quoteText="Your password is hashed with bcrypt before it is stored, and other users can never see your expenses."
        />
      }
    >
      <span className="auth-badge"><FiUserPlus aria-hidden="true" /> Get started</span>
      <h2>Create your account</h2>
      <p className="auth-card-sub">Choose your account type to get started.</p>

      <div className="auth-options">
        <Link to="/register/user" className="auth-option">
          <span className="auth-option-icon" aria-hidden="true"><FiUser /></span>
          <span>
            <span className="auth-option-title">User Account</span>
            <span className="auth-option-desc">
              Record your expenses and see where your money goes.
            </span>
          </span>
        </Link>

        {!adminExists && (
          <Link to="/register/admin" className="auth-option auth-option-admin">
            <span className="auth-option-icon" aria-hidden="true"><FiShield /></span>
            <span>
              <span className="auth-option-title">Administrator</span>
              <span className="auth-option-desc">
                See everyone's expenses and spending insights, and manage users.
              </span>
            </span>
          </Link>
        )}
      </div>

      {adminExists && (
        <p className="auth-note">
          <FiShield aria-hidden="true" />
          Need an administrator account? Ask an existing admin to create one for you
          from their Team panel.
        </p>
      )}

      <p className="auth-foot">
        Already have an account?<Link to="/login">Sign in</Link>
      </p>
    </AuthShell>
  );
};

export default RegisterChoice;
