import api from "./api";

// Everything the admin dashboard needs, kept separate from expenseService so
// it is obvious at a glance which calls belong to which role.

export const getOverview = async () => {
    const { data } = await api.get("/admin/overview");
    return data;
};

export const getAllExpenses = async (params = {}) => {
    const { data } = await api.get("/admin/expenses", { params });
    return data.expenses;
};

export const getTeam = async () => {
    const { data } = await api.get("/admin/team");
    return data;
};

export const addTeamMember = async (payload) => {
    const { data } = await api.post("/admin/team", payload);
    return data.user;
};

// Every account (users and admins) with their spend, plus the four counts the
// user panel shows.
export const getPeople = async () => {
    const { data } = await api.get("/admin/people");
    return data;
};

// One person's drill-down for Reports: their totals, category split, months
// and expenses.
export const getPerson = async (id) => {
    const { data } = await api.get(`/admin/people/${id}`);
    return data;
};

// CSV export. Goes through axios rather than a plain link so the Authorization
// header is attached - the endpoint is admin-only, so an anchor href would
// come back 401.
export const downloadExpensesCsv = async () => {
    const { data } = await api.get("/admin/expenses/export", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "expenses.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};
