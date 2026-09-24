import { createContext, useContext, useState, type ReactNode } from "react";

const SoundStatusContext = createContext<{
  muted: boolean;
  toggleMuted: () => void;
} | null>(null);

export function SoundStatusProvider({ children }: { children: ReactNode }) {
  const [muted, setMuted] = useState(false);
  const toggleMuted = () => setMuted((m) => !m);
  return <SoundStatusContext.Provider value={{ muted, toggleMuted }}>{children}</SoundStatusContext.Provider>;
}

export function useSoundStatus() {
  const ctx = useContext(SoundStatusContext);
  if (!ctx) throw new Error("useSoundStatus must be used inside SoundStatusProvider");
  return ctx;
}
