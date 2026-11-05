import { createContext, useContext, useState, type ReactNode } from "react";
import { setAuthToken } from "./api";

// Keep the login across page refreshes. The token is kept in sessionStorage, so it is
// forgotten when the tab/browser is closed. To go back to "log in again after every
// refresh", set this to false.
const PERSIST_LOGIN = true;
const STORAGE_KEY = "vigilant_admin_token";

const AuthContext = createContext<{
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
} | null>(null);

// True while the JWT's own expiry time (exp, in seconds) is still in the future.
function isFresh(token: string): boolean {
  try {
    const part = token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/");
    const { exp } = JSON.parse(atob(part)) as { exp?: number };
    return typeof exp !== "number" || exp * 1000 > Date.now() + 60_000;
  } catch {
    return false;
  }
}

function readStoredToken(): string | null {
  if (!PERSIST_LOGIN) return null;
  try {
    const t = sessionStorage.getItem(STORAGE_KEY);
    if (t && isFresh(t)) {
      setAuthToken(t); // set before any child component makes a request
      return t;
    }
    if (t) sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: just behave as logged out
  }
  return null;
}

function writeStoredToken(t: string | null) {
  if (!PERSIST_LOGIN) return;
  try {
    if (t) sessionStorage.setItem(STORAGE_KEY, t);
    else sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // storage blocked: the login simply won't survive a refresh
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(readStoredToken);

  const login = (t: string) => {
    setAuthToken(t);
    writeStoredToken(t);
    setToken(t);
  };
  const logout = () => {
    setAuthToken(null);
    writeStoredToken(null);
    setToken(null);
  };

  return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
