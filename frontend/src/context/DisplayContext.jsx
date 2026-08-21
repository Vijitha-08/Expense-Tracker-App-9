import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { DisplayContext } from "./displayContextValue";
import { money, moneyApprox } from "../services/format";
import { readStored, TOKEN_KEY } from "../services/api";
import { getPreferences, savePreferences } from "../services/profileService";

// Display preferences for the admin panel: whether amounts are shown estimated
// (~₹1.11 Cr) or exact (₹1,10,54,890), how dates are written, and which period
// pages open on.
//
// WAS client-side only, and the note here said: "If these ever need to follow
// the account across machines, that is the point to move them server-side."
// That point arrived - signing in on a second machine gave a different Settings
// page, which reads as a bug even though nothing was broken.
//
// localStorage is still the FIRST read, and that is the important part. The
// theme has to be on screen before any request finishes or every navigation
// flashes the wrong one, so local wins the race and the server reconciles a
// moment later. See the two effects in the provider:
//
//   hydrate      once per mount, only when signed in. If the account has saved
//                preferences they replace the local copy; if it never has
//                (server returns null) the local copy is kept and becomes the
//                account's first saved set on the next change.
//   write-through on every change, to localStorage synchronously and to the
//                server in the background. A failed PUT is logged, never shown:
//                the switch has already moved and re-rendering an error over a
//                cosmetic preference would be worse than the drift.
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

    // Holds the JSON the server is known to have. It starts null, is set by the
    // hydrate effect, and is compared before every PUT - without it, hydrating
    // would immediately push the values just received straight back, once per
    // page load, forever.
    const synced = useRef(null);
    const hydrated = useRef(false);

    // Hydrate once per mount. Guarded on a stored token because DisplayProvider
    // wraps the public pages too, and an unauthenticated GET would 401 on every
    // visit to the landing page.
    //
    // setPrefs happens inside the promise callback, not in the effect body -
    // this repo enables `react-hooks/set-state-in-effect`, which correctly
    // rejects the second. Same shape UserDashboard uses for its own load.
    useEffect(() => {
        if (!readStored(TOKEN_KEY)) { hydrated.current = true; return; }
        let alive = true;
        getPreferences()
            .then((remote) => {
                if (!alive) return;
                // null = this account has never saved. Keep the local choice
                // rather than stamping server defaults over a preference the
                // person has already expressed in this browser.
                if (remote) {
                    synced.current = JSON.stringify(remote);
                    setPrefs((p) => ({ ...p, ...remote }));
                }
            })
            .catch(() => { /* offline or 401 - local copy is still correct */ })
            .finally(() => { if (alive) hydrated.current = true; });
        return () => { alive = false; };
    }, []);

    useEffect(() => {
        try {
            localStorage.setItem(KEY, JSON.stringify(prefs));
        } catch {
            // A browser with storage blocked still works, it just forgets the
            // choice on reload. Not worth failing the whole app over.
        }

        // Write-through to the account. Skipped until hydration has finished, or
        // the first render would race the GET and could push stale local values
        // over newer server ones.
        if (!hydrated.current || !readStored(TOKEN_KEY)) return;
        const body = {
            estimated: prefs.estimated,
            dateStyle: prefs.dateStyle,
            defaultPeriod: prefs.defaultPeriod,
            theme: prefs.theme,
        };
        const next = JSON.stringify(body);
        if (next === synced.current) return;
        synced.current = next;
        savePreferences(body).catch((err) => {
            // Deliberately silent to the user. The control has already moved and
            // localStorage already has it; an error toast over a cosmetic
            // preference would be more disruptive than the drift it reports.
            synced.current = null;      // let the next change retry
            console.warn("display preferences not saved to your account:", err.message);
        });
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
