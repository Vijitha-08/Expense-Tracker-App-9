import api from "./api";

// Expense reminders. Same shape as expenseService.js and profileService.js: one
// thin function per endpoint, unwrapping the field the caller wants so no page
// has to know the envelope the API replies with.
//
// No date arithmetic here. The server computes dueOn, remindOn and status and
// sends them on every reminder, so there is one implementation of the projection
// rules rather than a second copy in the browser that could drift from it.

// Everything the Reminders page needs in one request: the reminders, the
// expenses still available to attach one to, and the counts for the tiles. One
// call rather than three, so the page paints once instead of flickering - the
// same reason /api/admin/overview exists.
export const getReminders = async () => {
    const { data } = await api.get("/reminders");
    return data;
};

// Create or correct the reminder on one expense. The endpoint is an upsert, so
// this is also what "save" does when editing an existing one.
export const saveReminder = async ({ expenseId, frequency, leadDays }) => {
    const { data } = await api.post("/reminders", { expenseId, frequency, leadDays });
    return data;
};

// A partial update: send only what changed. The switch sends { enabled } alone
// rather than resending the frequency and lead time it is not touching, so two
// tabs cannot undo each other's settings.
export const updateReminder = async (id, changes) => {
    const { data } = await api.put(`/reminders/${id}`, changes);
    return data;
};

// Removes the reminder only. The expense stays - the reply says so, and the page
// repeats it, because that is the one thing worth being certain about on a page
// full of real spending.
export const deleteReminder = async (id) => {
    const { data } = await api.delete(`/reminders/${id}`);
    return data;
};
