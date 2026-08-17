import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import { DisplayContext } from "./displayContextValue";
import { money, moneyApprox } from "../services/format";

// Display preferences for the admin panel: whether amounts are shown estimated
// (~₹1.11 Cr) or exact (₹1,10,54,890), how dates are written, and which period
// pages open on.
//
// Deliberately client-side only. There is no settings table in the database and
// adding one for four cosmetic switches would mean a migration, an endpoint and
// a read on every page load. localStorage keeps the choice per browser, which
// is what a display preference actually is. If these ever need to follow the
// account across machines, that is the point to move them server-side.
const KEY = "expense-tracker-display";

const DEFAULTS = {
    estimated: true,          // "Show estimated amounts"
    dateStyle: "long",        // "long" -> 07 Aug 2026 | "iso" -> 2026-08-07
    defaultPeriod: "all",     // which period Dashboard/Reports/All expenses open on
    theme: "system",          // "system" | "light" | "dark" - admin panel only
};

const read = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
        return { ...DEFAULTS, ...saved };
    } catch {
        return { ...DEFAULTS };
    }
};

// The one place that decides what "system" currently means.
//
// `matchMedia` is guarded because it does not exist in a non-browser render
// (tests, SSR) and an unguarded call there throws before the provider mounts.
//
// Read through `useSyncExternalStore` rather than useState + useEffect. The OS
// theme is exactly what that hook is for - an external store React does not
// own - and the effect version could not avoid a setState in its body to close
// the gap between the first render and the subscription, which is what
// `react-hooks/set-state-in-effect` (enabled in this repo, and referenced in
// the note about `form` in AdminSettings.jsx) correctly rejects. Here the
// getSnapshot call happens during render, so there is no gap to close.
const DARK_QUERY = "(prefers-color-scheme: dark)";

const canMatch = () =>
    typeof window !== "undefined" && typeof window.matchMedia === "function";

// Module scope, so the reference is stable and the subscription is not torn
// down and rebuilt on every render.
const subscribeToScheme = (onStoreChange) => {
    if (!canMatch()) return () => {};
    const mq = window.matchMedia(DARK_QUERY);
    mq.addEventListener("change", onStoreChange);
    return () => mq.removeEventListener("change", onStoreChange);
};

const getSchemeSnapshot = () => canMatch() && window.matchMedia(DARK_QUERY).matches;

// Server snapshot: light. Nothing renders on a server today, but the argument
// is required and guessing dark would mean a flash for most users if it ever did.
const getSchemeServerSnapshot = () => false;

const resolveTheme = (choice, prefersDark) =>
    choice === "system" ? (prefersDark ? "dark" : "light") : choice;

export const DisplayProvider = ({ children }) => {
    const [prefs, setPrefs] = useState(read);

    const prefersDark = useSyncExternalStore(
        subscribeToScheme,
        getSchemeSnapshot,
        getSchemeServerSnapshot
    );

    const theme = resolveTheme(prefs.theme, prefersDark);

    // `data-theme` goes on <html>, not on `.adm`, so the inline script in
    // index.html can set it before React mounts and there is no white flash on
    // a hard reload. The CSS still only reacts to it under `.adm`, so the
    // landing page, auth pages and user dashboard are untouched either way.
    useEffect(() => {
        document.documentElement.dataset.theme = theme;
    }, [theme]);

    useEffect(() => {
        try {
            localStorage.setItem(KEY, JSON.stringify(prefs));
        } catch {
            // A browser with storage blocked still works, it just forgets the
            // choice on reload. Not worth failing the whole app over.
        }
    }, [prefs]);

    const set = useCallback((patch) => setPrefs((p) => ({ ...p, ...patch })), []);
    const reset = useCallback(() => setPrefs({ ...DEFAULTS }), []);

    const value = useMemo(
        () => ({
            ...prefs,
            set,
            reset,
            // `theme` is the user's choice ("system" | "light" | "dark") and
            // comes from the spread above. `resolvedTheme` is what is actually
            // on screen right now - the controls need both, because a picker
            // has to show "System" as selected while the sidebar toggle has to
            // know whether it is currently showing a sun or a moon.
            resolvedTheme: theme,
            toggleTheme: () => set({ theme: theme === "dark" ? "light" : "dark" }),
            // One formatter every admin screen uses, so flipping the switch
            // changes the whole panel and no page can drift out of step.
            amount: (n) => (prefs.estimated ? moneyApprox(n) : money(n)),
            // Exact regardless of the switch - for the few places a precise
            // figure is the point, like the export note.
            exact: money,
            date: (value) => {
                const iso = String(value).slice(0, 10);
                if (prefs.dateStyle === "iso") return iso;
                const [y, m, d] = iso.split("-");
                const names = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
                               "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
                return `${d} ${names[Number(m) - 1] || "?"} ${y}`;
            },
        }),
        [prefs, set, reset, theme]
    );

    return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
};
