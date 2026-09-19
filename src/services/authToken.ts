const ACCESS_KEY = "pos.api.access";
const REFRESH_KEY = "pos.api.refresh";
const LEGACY_TOKEN_KEY = "pos.api.token";

export interface StoredTokens {
  accessToken: string;
  refreshToken: string;
}

export function getAccessToken(): string | null {
  try {
    return localStorage.getItem(ACCESS_KEY) ?? localStorage.getItem(LEGACY_TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getRefreshToken(): string | null {
  try {
    return localStorage.getItem(REFRESH_KEY);
  } catch {
    return null;
  }
}

/** @deprecated Use getAccessToken */
export function getToken(): string | null {
  return getAccessToken();
}

export function setTokens(accessToken: string, refreshToken: string) {
  localStorage.setItem(ACCESS_KEY, accessToken);
  localStorage.setItem(REFRESH_KEY, refreshToken);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

/** @deprecated Use setTokens */
export function setToken(token: string) {
  localStorage.setItem(ACCESS_KEY, token);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

export function clearTokens() {
  localStorage.removeItem(ACCESS_KEY);
  localStorage.removeItem(REFRESH_KEY);
  localStorage.removeItem(LEGACY_TOKEN_KEY);
}

/** @deprecated Use clearTokens */
export function clearToken() {
  clearTokens();
}
