"use client";

import { createContext, useContext, useState } from "react";

/** Shared chrome state for the app shell — currently just the mobile drawer, so
 *  the topbar's hamburger and the sidebar drawer stay in sync across sibling
 *  client components without prop-drilling. */
interface ShellContextValue {
  mobileOpen: boolean;
  setMobileOpen: (open: boolean) => void;
}

const ShellContext = createContext<ShellContextValue | null>(null);

export function AppShellProvider({ children }: { children: React.ReactNode }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  return (
    <ShellContext.Provider value={{ mobileOpen, setMobileOpen }}>{children}</ShellContext.Provider>
  );
}

export function useShell(): ShellContextValue {
  const ctx = useContext(ShellContext);
  if (!ctx) throw new Error("useShell must be used within an AppShellProvider");
  return ctx;
}
