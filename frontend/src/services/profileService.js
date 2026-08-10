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
