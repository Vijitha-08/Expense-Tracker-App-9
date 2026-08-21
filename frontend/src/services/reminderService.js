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

// Create or correct a reminder. `kind` picks which of the three the server
// builds, and the shape of the rest follows from it:
//
//   "existing"  { expenseId }                    - the common case
//   "expense"   { title, amount, paidOn }        - Others, already paid: creates
//                                                  a real expense and attaches
//   "bill"      { title, amount, dueOn }         - Others, still coming up:
//                                                  creates NO expense, so the
//                                                  money is never counted as
//                                                  spent anywhere
//
// dueOn and remindOn are optional on every kind (mandatory only for a bill) and
// are passed straight through - the server owns every rule about them, so this
// function deliberately validates nothing and computes nothing.
export const saveReminder = async (payload) => {
    const { data } = await api.post("/reminders", payload);
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

// Mark this occurrence paid. THIS CREATES A REAL EXPENSE on the server, dated
// today, from the reminder's own name and amount - so it moves the dashboard
// total. A sub-resource rather than a field on updateReminder for exactly that
// reason: it is not a settings change and must not be reachable from the edit
// form by accident.
export const markPaid = async (id) => {
    const { data } = await api.post(`/reminders/${id}/paid`);
    return data;
};

// Undo. Clears the paid marks but leaves the expense that was created - the
// server's reply says so, and the page repeats it, because silently deleting a
// real expense would be the more dangerous half of an undo.
export const unmarkPaid = async (id) => {
    const { data } = await api.delete(`/reminders/${id}/paid`);
    return data;
};
