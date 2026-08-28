import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { AppGate } from "@/components/noma/app-gate";
import { AuthScreen } from "@/components/noma/auth-screen";
import { useAuth } from "@/lib/noma/auth";

export const Route = createFileRoute("/signin")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Sign in — Noma" },
      {
        name: "description",
        content:
          "Sign in to your Noma account with Google or email, or keep writing without an account in Local Mode.",
      },
      { property: "og:title", content: "Sign in — Noma" },
      {
        property: "og:description",
        content: "Optional Noma account — your notes always stay on this device.",
      },
    ],
  }),
  component: SignInPage,
});

function SignInPage() {
  const auth = useAuth();
  const navigate = useNavigate();

  // Signing in (or linking) drops you straight back into your notes.
  useEffect(() => {
    if (auth.user && !auth.needsEmailVerification) void navigate({ to: "/", replace: true });
  }, [auth.user, auth.needsEmailVerification, navigate]);

  if (auth.user) {
    return (
      <AppGate>
        <div className="flex min-h-dvh items-center justify-center bg-background">
          <p className="text-sm text-muted-foreground">Opening Noma…</p>
        </div>
      </AppGate>
    );
  }

  return <AuthScreen onContinueWithoutAccount={() => void navigate({ to: "/", replace: true })} />;
}
