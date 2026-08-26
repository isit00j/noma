import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyAuthError, useAuth } from "@/lib/noma/auth";

type Mode = "choose" | "email" | "reset";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" className="size-4" aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1Z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23Z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84Z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.3 9.14 5.38 12 5.38Z" />
    </svg>
  );
}

export function AuthScreen() {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("choose");
  const [isNew, setIsNew] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  const run = async (action: () => Promise<void>, success?: string) => {
    setBusy(true);
    try {
      await action();
      if (success) toast.success(success);
    } catch (error) {
      toast.error(friendlyAuthError(error));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="text-center">
          <h1 className="font-serif text-4xl font-semibold tracking-tight">Noma</h1>
          <p className="mt-2 text-sm text-muted-foreground">A quiet place for your thoughts.</p>
        </div>

        {!auth.configured && (
          <div className="mt-8 rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-medium">Authentication isn't configured yet</p>
            <p className="mt-1 text-muted-foreground">
              Add your Firebase keys from <code className="font-mono text-xs">.env.example</code> to enable Noma
              accounts. Until then Noma runs in local-only mode — your notes are still saved on this device.
            </p>
          </div>
        )}

        <div className="mt-10 space-y-3">
          {mode === "choose" && (
            <>
              <Button
                variant="outline"
                className="h-11 w-full justify-center gap-2"
                disabled={busy || !auth.configured}
                onClick={() => run(auth.signInWithGoogle)}
              >
                <GoogleMark />
                Continue with Google
              </Button>
              <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                <span className="h-px flex-1 bg-border" />
                or
                <span className="h-px flex-1 bg-border" />
              </div>
              <Button className="h-11 w-full" onClick={() => setMode("email")} disabled={!auth.configured}>
                Continue with Email
              </Button>
            </>
          )}

          {mode !== "choose" && (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (mode === "reset") {
                  void run(() => auth.resetPassword(email), "Password reset email sent.");
                  return;
                }
                void run(() => (isNew ? auth.signUp(email, password) : auth.signIn(email, password)));
              }}
            >
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  autoComplete="email"
                  required
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  className="h-11"
                />
              </div>

              {mode === "email" && (
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    autoComplete={isNew ? "new-password" : "current-password"}
                    required
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-11"
                  />
                </div>
              )}

              <Button type="submit" className="h-11 w-full" disabled={busy}>
                {busy && <Loader2 className="size-4 animate-spin" />}
                {mode === "reset" ? "Send reset link" : isNew ? "Create account" : "Sign in"}
              </Button>

              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                {mode === "email" ? (
                  <>
                    <button type="button" className="hover:text-foreground" onClick={() => setIsNew((value) => !value)}>
                      {isNew ? "I already have an account" : "Create an account"}
                    </button>
                    <button type="button" className="hover:text-foreground" onClick={() => setMode("reset")}>
                      Forgot password?
                    </button>
                  </>
                ) : (
                  <button type="button" className="hover:text-foreground" onClick={() => setMode("email")}>
                    Back to sign in
                  </button>
                )}
              </div>

              <button
                type="button"
                className="w-full text-center text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setMode("choose")}
              >
                Other sign-in options
              </button>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
