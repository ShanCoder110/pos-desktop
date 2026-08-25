import { useMemo, useState, type ReactNode } from "react";
import {
  emptySession,
  loadSession,
  saveSession,
  SessionContext,
} from "@/shared/auth/session";
import type { AuthSession, OwnerProfile, ShopProfile } from "@/shared/types";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<AuthSession>(() => loadSession());

  const value = useMemo(
    () => ({
      session,
      saveShop: (shop: ShopProfile) => {
        const next = { ...session, shop, loggedIn: false };
        setSession(next);
        saveSession(next);
      },
      saveOwner: (owner: OwnerProfile) => {
        const next = { ...session, owner, loggedIn: false };
        setSession(next);
        saveSession(next);
      },
      completeSetup: (shop: ShopProfile, owner: OwnerProfile) => {
        const next = { shop, owner, loggedIn: false };
        setSession(next);
        saveSession(next);
      },
      login: (email: string, password: string) => {
        if (!session.owner) return "Set up the shop first";
        const match =
          email.trim().toLowerCase() === session.owner.email.toLowerCase() &&
          password === session.owner.password;
        if (!match) return "Email or password is wrong";
        const next = { ...session, loggedIn: true };
        setSession(next);
        saveSession(next);
        return null;
      },
      logout: () => {
        const next = { ...session, loggedIn: false };
        setSession(next);
        saveSession(next);
      },
    }),
    [session],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export { emptySession };
