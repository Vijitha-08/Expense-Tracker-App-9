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
