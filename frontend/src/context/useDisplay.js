import { useContext } from "react";
import { DisplayContext } from "./displayContextValue";

// Split from the provider file so the fast-refresh boundary stays clean:
// a file that exports a component should not also export a hook.
export const useDisplay = () => {
    const ctx = useContext(DisplayContext);
    if (!ctx) throw new Error("useDisplay must be used inside DisplayProvider");
    return ctx;
};
