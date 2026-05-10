"use client";

import { AuthProvider } from "@scanai/shared/auth-context";

export function ClientProviders({ children }: { children: React.ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}
