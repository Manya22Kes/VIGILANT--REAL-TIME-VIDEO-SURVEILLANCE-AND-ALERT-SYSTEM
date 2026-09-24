import { createContext, useContext, useState, type ReactNode } from "react";

type CameraState = "inactive" | "active" | "error";

const CameraStatusContext = createContext<{
  state: CameraState;
  setState: (s: CameraState) => void;
} | null>(null);

export function CameraStatusProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<CameraState>("inactive");
  return <CameraStatusContext.Provider value={{ state, setState }}>{children}</CameraStatusContext.Provider>;
}

export function useCameraStatus() {
  const ctx = useContext(CameraStatusContext);
  if (!ctx) throw new Error("useCameraStatus must be used inside CameraStatusProvider");
  return ctx;
}
