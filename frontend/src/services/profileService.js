import api from "./api";

// Settings -> My account. Separate from authService: these are changes to an
// existing session's own account, not signing in or out.

export const updateProfile = async ({ name, email }) => {
    const { data } = await api.put("/users/profile", { name, email });
    return data.user;
};

export const changePassword = async ({ currentPassword, newPassword }) => {
    const { data } = await api.put("/users/password", { currentPassword, newPassword });
    return data.message;
};

// Settings -> Display. Returns null when this account has never saved anything,
// which is the signal DisplayContext uses to keep whatever is already in
// localStorage instead of overwriting it with server defaults.
export const getPreferences = async () => {
    const { data } = await api.get("/users/preferences");
    return data.preferences;
};

export const savePreferences = async ({ estimated, dateStyle, defaultPeriod, theme }) => {
    const { data } = await api.put("/users/preferences", {
        estimated, dateStyle, defaultPeriod, theme,
    });
    return data.preferences;
};

// Settings -> My data -> Danger zone. Both take the account password, and both
// need it in the request BODY, which for a DELETE means axios's `{ data: ... }`
// option rather than a second positional argument - axios reads the second
// argument of `delete` as config, not as a body, so passing the object directly
// would send an empty body and the server would answer "Enter your password".
export const clearMyExpenses = async (password) => {
    const { data } = await api.delete("/users/me/expenses", { data: { password } });
    return data;
};

export const deleteMyAccount = async (password) => {
    const { data } = await api.delete("/users/me", { data: { password } });
    return data;
};
