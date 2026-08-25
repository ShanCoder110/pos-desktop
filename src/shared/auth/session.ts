import { createContext, useContext } from "react";
import type { AuthSession, OwnerProfile, ShopProfile } from "@/shared/types";

const KEY = "pos.session";

/** Login and first-time setup are skipped until auth is wired for real. */
export const AUTH_ENABLED: boolean = false;

export const emptySession: AuthSession = {
  shop: null,
  owner: null,
  loggedIn: false,
};

export function loadSession(): AuthSession {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptySession;
    const parsed = JSON.parse(raw) as AuthSession;
    return {
      shop: parsed.shop ?? null,
      owner: parsed.owner ?? null,
      loggedIn: Boolean(parsed.loggedIn),
    };
  } catch {
    return emptySession;
  }
}

export function saveSession(session: AuthSession) {
  localStorage.setItem(KEY, JSON.stringify(session));
}

export const SessionContext = createContext<{
  session: AuthSession;
  saveShop: (shop: ShopProfile) => void;
  saveOwner: (owner: OwnerProfile) => void;
  completeSetup: (shop: ShopProfile, owner: OwnerProfile) => void;
  login: (email: string, password: string) => string | null;
  logout: () => void;
}>({
  session: emptySession,
  saveShop: () => undefined,
  saveOwner: () => undefined,
  completeSetup: () => undefined,
  login: () => "Not ready",
  logout: () => undefined,
});

export function useSession() {
  return useContext(SessionContext);
}
