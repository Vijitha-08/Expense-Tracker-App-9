import { useEffect, useState, useCallback, useMemo } from "react";
import { AuthContext } from "./authContextValue";
import * as authService from "../services/authService";

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(() => authService.getStoredUser());
    // Start in 'loading' only if there is a token worth validating. That way a
    // logged-out visitor is never held on a spinner, and a logged-in one is not
    // bounced to /login on refresh before we have re-checked the token.
    const [loading, setLoading] = useState(() => Boolean(authService.getStoredToken()));

    useEffect(() => {
        if (!authService.getStoredToken()) return; // loading already false

        let cancelled = false;
        authService
            .fetchMe()
            .then((fresh) => {
                if (!cancelled) setUser(fresh);
            })
            .catch(() => {
                if (cancelled) return;
                authService.logout();
                setUser(null);
            })
            .finally(() => {
                if (!cancelled) setLoading(false);
            });

        return () => { cancelled = true; };
    }, []);

    const login = useCallback(async (credentials) => {
        const loggedIn = await authService.login(credentials);
        setUser(loggedIn);
        return loggedIn;
    }, []);

    const register = useCallback(async (payload) => {
        const created = await authService.register(payload);
        setUser(created);
        return created;
    }, []);

    // Re-read the signed-in user from the API. Settings -> My account needs
    // this: without it the sidebar keeps showing the old name until a reload.
    const refresh = useCallback(async () => {
        const fresh = await authService.fetchMe();
        setUser(fresh);
        return fresh;
    }, []);

    const logout = useCallback(() => {
        authService.logout();
        setUser(null);
    }, []);

    const value = useMemo(
        () => ({ user, loading, login, register, logout, refresh }),
        [user, loading, login, register, logout, refresh]
    );

    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};
