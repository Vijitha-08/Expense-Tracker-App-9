import api from "./api";

// The one call the public contact form makes. It goes through the same axios
// instance as everything else so it inherits the base URL and, more importantly,
// the response interceptor that turns an axios error into a plain Error with the
// server's own message on it - which is what the form displays.
//
// The request interceptor attaches a bearer token when one is stored. Harmless
// here: the endpoint ignores it, and a signed-in person filling in the contact
// form is a perfectly ordinary thing to do.
export const sendContactMessage = async ({ name, email, message }) => {
    const { data } = await api.post("/contact", { name, email, message });
    return data;
};
