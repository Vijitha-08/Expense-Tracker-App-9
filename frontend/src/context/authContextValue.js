import { createContext } from "react";

// Kept separate from AuthContext.jsx so that file exports only a component
// (react-refresh needs component-only modules to hot-reload correctly).
export const AuthContext = createContext(null);
