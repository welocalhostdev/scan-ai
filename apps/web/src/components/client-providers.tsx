"use client";

import { AuthProvider } from "@/lib/auth-context";

/**
 * Client-side providers wrapper.
 * Keeps the root layout as a server component while providing
 * client-side context (auth) to all pages.
 * Navigation is handled by individual route group layouts.
 */
export function ClientProviders({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      {children}
    </AuthProvider>
  );
}
