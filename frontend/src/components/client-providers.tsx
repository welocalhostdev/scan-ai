"use client";

import { AuthProvider } from "@/lib/auth-context";
import { Navbar } from "@/components/navbar";

/**
 * Client-side providers wrapper.
 * Keeps the root layout as a server component while providing
 * client-side context (auth) and UI (navbar) to all pages.
 */
export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <Navbar />
      {children}
    </AuthProvider>
  );
}
