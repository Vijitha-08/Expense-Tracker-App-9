import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "../context/useAuth";
import { dashboardPath } from "../services/authService";

// Gate a route on being logged in and, optionally, on role.
const ProtectedRoute = ({ children, allow }) => {
    const { user, loading } = useAuth();
    const location = useLocation();

    if (loading) {
        return <div className="route-loading">Checking your session...</div>;
    }

    if (!user) {
        return <Navigate to="/login" replace state={{ from: location.pathname }} />;
    }

    // Logged in but wrong role - send them to their own dashboard, not to login.
    if (allow && !allow.includes(user.role)) {
        return <Navigate to={dashboardPath(user.role)} replace />;
    }

    return children;
};

export default ProtectedRoute;
