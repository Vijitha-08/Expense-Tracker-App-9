import api from "./api";

export const getExpenses = async (params = {}) => {
    const { data } = await api.get("/expenses", { params });
    return data.expenses;
};

export const getSummary = async () => {
    const { data } = await api.get("/expenses/summary");
    return data;
};

export const createExpense = async (payload) => {
    const { data } = await api.post("/expenses", payload);
    return data.expense;
};

export const updateExpense = async (id, payload) => {
    const { data } = await api.put(`/expenses/${id}`, payload);
    return data.expense;
};

export const deleteExpense = async (id) => {
    const { data } = await api.delete(`/expenses/${id}`);
    return data.id;
};

// CSV export of your own expenses. Goes through axios rather than a plain
// <a href> so the Authorization header is attached - the endpoint is behind
// auth, so an anchor would come back 401. Same shape as the admin export in
// adminService.js, pointed at the user-scoped route.
export const downloadMyExpensesCsv = async () => {
    const { data } = await api.get("/expenses/export", { responseType: "blob" });
    const url = URL.createObjectURL(new Blob([data], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "my-expenses.csv";
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
};
