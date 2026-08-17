import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { DisplayProvider } from "./context/DisplayContext";
import ProtectedRoute from "./components/ProtectedRoute";

import Home from "./pages/Home";
import Features from "./components/Features";
import LoginPage from "./pages/LoginPage";
import RegisterChoice from "./pages/RegisterChoice";
import ForgotPassword from "./pages/ForgotPassword";
import UserRegister from "./pages/UserRegister";
import AdminRegister from "./pages/AdminRegister";
import UserDashboard from "./pages/UserDashboard";

import AdminDashboard from "./pages/AdminDashboard";
import AdminUsers from "./pages/AdminUsers";
import AdminInsights from "./pages/AdminInsights";
import AdminReports from "./pages/AdminReports";
import AdminExpenses from "./pages/AdminExpenses";
import AdminSettings from "./pages/AdminSettings";

import "./App.css";

// Each admin page is its own route rather than a tab inside one component, so
// the sidebar can highlight the current section and a link is shareable.
const adminPages = [
  { path: "dashboard", Page: AdminDashboard },
  { path: "users",     Page: AdminUsers },
  { path: "insights",  Page: AdminInsights },
  { path: "reports",   Page: AdminReports },
  { path: "expenses",  Page: AdminExpenses },
  { path: "settings",  Page: AdminSettings },
];

function App() {
  return (
    <AuthProvider>
      <DisplayProvider>
        <BrowserRouter>
          <Routes>
            {/* public */}
            <Route path="/" element={<Home />} />
            {/* Wrapped in `.site` like Home is: this route renders the
                Features section on its own, outside Home's wrapper, so
                without this it would be the one public page the dark theme
                could not reach. */}
            <Route path="/features" element={<div className="site"><Features /></div>} />
            <Route path="/login" element={<LoginPage />} />
            <Route path="/register" element={<RegisterChoice />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/register/user" element={<UserRegister />} />
            <Route path="/register/admin" element={<AdminRegister />} />

            {/* role-gated */}
            <Route
              path="/user/dashboard"
              element={
                <ProtectedRoute allow={["user"]}>
                  <UserDashboard />
                </ProtectedRoute>
              }
            />

            {adminPages.map(({ path, Page }) => (
              <Route
                key={path}
                path={`/admin/${path}`}
                element={
                  <ProtectedRoute allow={["admin"]}>
                    <Page />
                  </ProtectedRoute>
                }
              />
            ))}

            {/* an admin landing on bare /admin goes to the dashboard */}
            <Route path="/admin" element={<Navigate to="/admin/dashboard" replace />} />

            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </DisplayProvider>
    </AuthProvider>
  );
}

export default App;
