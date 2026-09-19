import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { AUTH_ENABLED, SessionContext, type AuthPhase } from "@/shared/auth/session";
import { AUTH_COPY } from "@/shared/constants/auth";
import {
  authStatus,
  loginWithDevice,
  logout as apiLogout,
  me,
  setupShop,
  type AuthUser,
  type SetupFormPayload,
} from "@/services/auth";
import { clearTokens, getAccessToken } from "@/services/authToken";
import { getDeviceId } from "@/utils/device";
import { isAbortError } from "@/utils/async";

export function SessionProvider({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<AuthPhase>("loading");
  const [user, setUser] = useState<AuthUser | null>(null);
  const [shopName, setShopName] = useState<string | null>(null);

  const refreshStatus = useCallback(async () => {
    if (!AUTH_ENABLED) {
      setPhase("authenticated");
      return;
    }
    try {
      const status = await authStatus();
      setShopName(status.shopName ?? null);
      if (status.needsSetup) {
        clearTokens();
        setUser(null);
        setPhase("needs_setup");
        return;
      }
      if (!getAccessToken()) {
        setUser(null);
        setPhase("anonymous");
        return;
      }
      const session = await me();
      setUser(session.user);
      setShopName(status.shopName ?? null);
      setPhase("authenticated");
    } catch (error) {
      if (isAbortError(error)) return;
      clearTokens();
      setUser(null);
      setPhase("anonymous");
    }
  }, []);

  useEffect(() => {
    void refreshStatus();
  }, [refreshStatus]);

  const value = useMemo(
    () => ({
      phase,
      user,
      shopName,
      refreshStatus,
      login: async (email: string, password: string) => {
        try {
          const response = await loginWithDevice(email, password);
          setUser(response.user);
          setPhase("authenticated");
          return null;
        } catch (error) {
          return error instanceof Error && error.message.trim()
            ? error.message.trim()
            : AUTH_COPY.invalidCredentials;
        }
      },
      logout: async () => {
        await apiLogout();
        setUser(null);
        setPhase("anonymous");
      },
      completeSetup: async (payload: SetupFormPayload) => {
        try {
          const response = await setupShop({
            ...payload,
            deviceId: getDeviceId(),
            deviceName: payload.deviceName ?? "Counter 1",
          });
          setUser(response.user);
          setShopName(payload.shopName);
          setPhase("authenticated");
          return null;
        } catch (error) {
          return error instanceof Error && error.message.trim()
            ? error.message.trim()
            : "Could not complete setup";
        }
      },
    }),
    [phase, user, shopName, refreshStatus],
  );

  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
