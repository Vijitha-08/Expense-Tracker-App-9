import { createContext } from "react";

// Context object lives in its own file so DisplayContext.jsx can export only
// the provider component - the same split as authContextValue.js.
export const DisplayContext = createContext(null);
