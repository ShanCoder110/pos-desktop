import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSession } from "@/shared/auth/session";
import { defaultSettings, SettingsContext } from "@/shared/settings";
import { loadShopSettings, persistShopSettings } from "@/shared/settingsStorage";
import { getAppSettings, saveAppSettings } from "@/services/settings";
import type { ShopSettings } from "@/shared/types";
import { SettingsSession } from "@/shared/settingsSession";

export function DatabaseSettingsProvider({ children }: { children: ReactNode }) {
  const { phase, user } = useSession();
  const scope = user?.id ?? "authenticated";
  const session = useRef(new SettingsSession());
  const [settings, setSettingsState] = useState(defaultSettings);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (phase !== "authenticated") {
      session.current.clear();
      setReady(false);
      return;
    }
    let active = true;
    setReady(false);
    setError(false);
    void session.current
      .load(scope, async () => {
        const saved = await getAppSettings();
        let loaded: ShopSettings;
        if (saved) {
          loaded = { ...defaultSettings, ...saved };
        } else {
          // Import the old browser-only preferences once; later devices/scopes
          // start with defaults rather than another branch's cached preferences.
          let legacy = defaultSettings;
          try {
            if (!localStorage.getItem("dukan:settings-db-migrated")) {
              legacy = loadShopSettings(localStorage, defaultSettings);
            }
          } catch {
            /* Database persistence does not require browser storage. */
          }
          loaded = await saveAppSettings(legacy);
        }
        try {
          persistShopSettings(localStorage, loaded);
          localStorage.setItem("dukan:settings-db-migrated", "1");
        } catch {
          /* Cache is optional; the database is authoritative. */
        }
        return loaded;
      })
      .then((loaded) => {
        if (!active) return;
        setSettingsState(loaded);
        setReady(true);
      })
      .catch(() => {
        if (active) setError(true);
      });
    return () => {
      active = false;
    };
  }, [phase, scope, retry]);

  const setSettings = useCallback(
    async (next: ShopSettings) => {
      if (!ready) throw new Error("Settings are still loading");
      const saved = await saveAppSettings(next);
      const loaded = { ...defaultSettings, ...saved };
      session.current.update(scope, loaded);
      setSettingsState(loaded);
      try {
        persistShopSettings(localStorage, saved);
      } catch {
        /* Optional cache. */
      }
    },
    [ready, scope],
  );

  const context = useMemo(() => ({ settings, setSettings }), [settings, setSettings]);

  return (
    <SettingsContext.Provider value={context}>
      {phase === "authenticated" && !ready ? (
        <div role="status" className="p-6 text-sm">
          {error ? (
            <>
              <p>Settings could not load from the database.</p>
              <button onClick={() => setRetry((value) => value + 1)}>Retry</button>
            </>
          ) : (
            "Loading saved settings…"
          )}
        </div>
      ) : (
        children
      )}
    </SettingsContext.Provider>
  );
}
