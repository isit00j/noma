import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/noma/auth";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallbackComponent,
});

function AuthCallbackComponent() {
  const auth = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // If not in Capacitor, redirect back to root or normal flow.
    // In Capacitor, AuthProvider runs getRedirectResult on mount.
    // We just wait for auth.loading to finish.

    if (!auth.loading) {
      if (auth.user) {
        navigate({ to: "/", replace: true });
      } else {
        // If not loading, and no user, there was probably an error or cancelled.
        // Navigate to signin to try again
        const timer = setTimeout(() => {
          if (!auth.user) {
            navigate({ to: "/signin", replace: true });
          }
        }, 1500);
        return () => clearTimeout(timer);
      }
    }
  }, [auth.loading, auth.user, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center p-4 text-center">
      <div className="animate-pulse space-y-4">
        <h2 className="font-serif text-2xl font-medium tracking-tight">Completing sign in...</h2>
        <p className="text-muted-foreground">Please wait while we log you in.</p>
      </div>
    </div>
  );
}
