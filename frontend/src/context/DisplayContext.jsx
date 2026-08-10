import { useCallback, useEffect, useMemo, useState } from "react";
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
};

const read = () => {
    try {
        const saved = JSON.parse(localStorage.getItem(KEY) || "{}");
        return { ...DEFAULTS, ...saved };
    } catch {
        return { ...DEFAULTS };
    }
};

export const DisplayProvider = ({ children }) => {
    const [prefs, setPrefs] = useState(read);

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
        [prefs, set, reset]
    );

    return <DisplayContext.Provider value={value}>{children}</DisplayContext.Provider>;
};
