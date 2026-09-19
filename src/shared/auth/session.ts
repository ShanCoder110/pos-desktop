import { createContext, useContext } from "react";
import type { AuthUser, SetupFormPayload } from "@/services/auth";

export type AuthPhase = "loading" | "needs_setup" | "anonymous" | "authenticated";

/** Set to false to skip login/setup and auto-use seed credentials. */
export const AUTH_ENABLED = true;

export const SessionContext = createContext<{
  phase: AuthPhase;
  user: AuthUser | null;
  shopName: string | null;
  login: (email: string, password: string) => Promise<string | null>;
  logout: () => Promise<void>;
  completeSetup: (payload: SetupFormPayload) => Promise<string | null>;
  refreshStatus: () => Promise<void>;
}>({
  phase: "loading",
  user: null,
  shopName: null,
  login: async () => "Not ready",
  logout: async () => undefined,
  completeSetup: async () => "Not ready",
  refreshStatus: async () => undefined,
});

export function useSession() {
  return useContext(SessionContext);
}
