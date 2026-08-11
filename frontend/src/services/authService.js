import api, { TOKEN_KEY, USER_KEY, readStored, writeStored, clearStored } from "./api";

const persist = ({ token, user }, remember) => {
    writeStored(TOKEN_KEY, token, remember);
    writeStored(USER_KEY, JSON.stringify(user), remember);
    return user;
};

export const register = async ({ name, email, password, role }) => {
    const { data } = await api.post("/auth/register", { name, email, password, role });
    return persist(data, true);
};

export const login = async ({ email, password, remember = true }) => {
    const { data } = await api.post("/auth/login", { email, password });
    return persist(data, remember);
};

export const fetchMe = async () => {
    const { data } = await api.get("/auth/me");
    // Refresh the cached copy in whichever storage already holds it.
    const remember = localStorage.getItem(TOKEN_KEY) !== null;
    writeStored(USER_KEY, JSON.stringify(data.user), remember);
    return data.user;
};

// Whether the app already has an administrator. Drives whether the register
// page offers the "Administrator" option at all, so a visitor is not sent to
// a form that is guaranteed to be rejected.
export const fetchSetupState = async () => {
    const { data } = await api.get("/auth/setup-state");
    return data;
};

// ---- forgot password ----------------------------------------------------
// Three calls rather than one so a wrong code is caught before somebody types
// a new password twice. The API deliberately never returns the code, and never
// confirms whether the address has an account.
export const requestResetCode = async (email) => {
    const { data } = await api.post("/auth/forgot-password", { email });
    return data;                    // { message, emailConfigured, delivered }
};

export const verifyResetCode = async ({ email, code }) => {
    const { data } = await api.post("/auth/verify-reset-code", { email, code });
    return data;
};

export const resetPassword = async ({ email, code, newPassword }) => {
    const { data } = await api.post("/auth/reset-password", { email, code, newPassword });
    return data;
};

export const logout = () => {
    clearStored(TOKEN_KEY);
    clearStored(USER_KEY);
};

export const getStoredUser = () => {
    try {
        return JSON.parse(readStored(USER_KEY)) || null;
    } catch {
        return null;
    }
};

export const getStoredToken = () => readStored(TOKEN_KEY);

export const dashboardPath = (role) =>
    role === "admin" ? "/admin/dashboard" : "/user/dashboard";
