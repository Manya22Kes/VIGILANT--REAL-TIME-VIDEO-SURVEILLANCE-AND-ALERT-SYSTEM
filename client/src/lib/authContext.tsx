import { createContext, useContext, useState, type ReactNode } from "react";
import { setAuthToken } from "./api";

const AuthContext = createContext<{
  token: string | null;
  login: (token: string) => void;
  logout: () => void;
} | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);

  const login = (t: string) => {
    setAuthToken(t);
    setToken(t);
  };
  const logout = () => {
    setAuthToken(null);
    setToken(null);
  };

  return <AuthContext.Provider value={{ token, login, logout }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
