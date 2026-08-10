import axios from "axios";

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || "http://localhost:5000/api",
});

export const TOKEN_KEY = "et_token";
export const USER_KEY = "et_user";

// "Remember me" checked -> localStorage (survives closing the browser).
// Unchecked -> sessionStorage (cleared when the tab closes). Reads check both
// so the rest of the app does not care which was used.
export const readStored = (key) =>
    localStorage.getItem(key) ?? sessionStorage.getItem(key);

export const writeStored = (key, value, remember) => {
    const target = remember ? localStorage : sessionStorage;
    const other = remember ? sessionStorage : localStorage;
    other.removeItem(key);
    target.setItem(key, value);
};

export const clearStored = (key) => {
    localStorage.removeItem(key);
    sessionStorage.removeItem(key);
};

api.interceptors.request.use((config) => {
    const token = readStored(TOKEN_KEY);
    if (token) config.headers.Authorization = `Bearer ${token}`;
    return config;
});

api.interceptors.response.use(
    (response) => response,
    (error) => {
        const status = error.response?.status;
        const message =
            error.response?.data?.message ||
            (error.code === "ERR_NETWORK"
                ? "Cannot reach the server. Is the backend running on port 5000?"
                : "Something went wrong. Please try again.");

        if (status === 401 && !error.config?.url?.includes("/auth/")) {
            clearStored(TOKEN_KEY);
            clearStored(USER_KEY);
            if (window.location.pathname !== "/login") {
                window.location.replace("/login?expired=1");
            }
        }

        return Promise.reject(Object.assign(new Error(message), { status }));
    }
);

export default api;
