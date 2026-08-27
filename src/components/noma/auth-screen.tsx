import { Loader2, MailCheck } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { PasswordInput } from "./password-input";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { friendlyAuthError, useAuth } from "@/lib/noma/auth";

type Mode = "choose" | "email" | "reset" | "reset-sent";

const RESEND_COOLDOWN = 45;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

/** Shows enough of the address to recognise it without exposing the full inbox. */
function maskEmail(value: string): string {
  const [name = "", domain = ""] = value.trim().split("@");
  if (!domain) return value.trim();
  const head = name.slice(0, 2);
  return `${head}${"•".repeat(Math.max(name.length - 2, 1))}@${domain}`;
}

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

/** Wraps each auth step so switching modes crossfades instead of snapping. */
function Step({ children }: { children: React.ReactNode }) {
  return (
    <div className="animate-in fade-in slide-in-from-bottom-1 duration-200 motion-reduce:animate-none">{children}</div>
  );
}

export function AuthScreen({ onContinueWithoutAccount }: { onContinueWithoutAccount?: () => void } = {}) {
  const auth = useAuth();
  const [mode, setMode] = useState<Mode>("choose");
  const [isNew, setIsNew] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<null | "google" | "email" | "reset">(null);
  const [error, setError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  const run = async (kind: "google" | "email" | "reset", action: () => Promise<void>, onDone?: () => void) => {
    if (busy) return;
    setBusy(kind);
    setError(null);
    try {
      await action();
      onDone?.();
    } catch (caught) {
      const message = friendlyAuthError(caught);
      setError(message);
      toast.error(message);
    } finally {
      setBusy(null);
    }
  };

  const sendReset = (announce: boolean) =>
    void run(
      "reset",
      () => auth.resetPassword(email),
      () => {
        setCooldown(RESEND_COOLDOWN);
        setMode("reset-sent");
        if (announce) toast.success("Password reset email sent.");
      },
    );

  return (
    <main className="flex min-h-dvh items-center justify-center bg-background px-5 py-12">
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center text-center animate-in fade-in slide-in-from-bottom-2 duration-500 motion-reduce:animate-none">
          <img
            src="/noma-icon-512.png"
            alt="Noma"
            width={72}
            height={72}
            className="size-[72px] rounded-2xl noma-glow"
          />
          <h1 className="mt-5 font-serif text-4xl font-semibold tracking-tight">Noma</h1>
          <p className="mt-2 text-sm text-muted-foreground">A quiet place for your thoughts.</p>
        </div>


        {!auth.configured && (
          <div className="mt-8 rounded-lg border border-border bg-card p-4 text-sm">
            <p className="font-medium">Authentication isn't configured yet</p>
            <p className="mt-1 text-muted-foreground">
              Paste your Firebase Web App values into{" "}
              <code className="font-mono text-xs">src/config/firebaseConfig.ts</code> to enable Noma accounts. Until
              then Noma runs in local-only mode — your notes are still saved on this device.
            </p>
          </div>
        )}

        <div className="mt-10 space-y-3">
          {mode === "choose" && (
            <Step>
              <div className="space-y-3">
                <Button
                  variant="outline"
                  className="h-11 w-full justify-center gap-2 transition-transform active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
                  disabled={Boolean(busy) || !auth.configured}
                  onClick={() => void run("google", auth.signInWithGoogle)}
                >
                  {busy === "google" ? <Loader2 className="size-4 animate-spin" aria-hidden="true" /> : <GoogleMark />}
                  {busy === "google" ? "Connecting…" : "Continue with Google"}
                </Button>
                <div className="flex items-center gap-3 py-1 text-xs text-muted-foreground">
                  <span className="h-px flex-1 bg-border" />
                  or
                  <span className="h-px flex-1 bg-border" />
                </div>
                <Button
                  className="h-11 w-full transition-transform active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
                  onClick={() => setMode("email")}
                  disabled={!auth.configured || Boolean(busy)}
                >
                  Continue with Email
                </Button>
                {onContinueWithoutAccount && (
                  <Button
                    variant="ghost"
                    className="h-11 w-full text-muted-foreground transition-transform active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
                    disabled={Boolean(busy)}
                    onClick={onContinueWithoutAccount}
                  >
                    Continue without account
                  </Button>
                )}
                <p className="pt-1 text-center text-xs text-muted-foreground">
                  An account is optional — Noma keeps your notes on this device either way.
                </p>
              </div>
            </Step>
          )}


          {mode === "reset-sent" && (
            <Step>
              <div className="text-center">
                <MailCheck
                  className="mx-auto size-8 text-muted-foreground animate-in zoom-in-75 fade-in duration-300 motion-reduce:animate-none"
                  aria-hidden="true"
                />
                <h2 className="mt-4 font-serif text-2xl font-semibold tracking-tight">Check your inbox</h2>
                <p className="mt-2 text-sm text-muted-foreground">
                  We've sent a password reset link to{" "}
                  <span className="font-medium text-foreground">{maskEmail(email)}</span>. It can take a minute to
                  arrive — check spam too.
                </p>
                <div aria-live="polite" className="mt-6 space-y-3">
                  <Button
                    variant="outline"
                    className="h-11 w-full"
                    disabled={busy === "reset" || cooldown > 0}
                    onClick={() => sendReset(true)}
                  >
                    {busy === "reset" && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                    {busy === "reset" ? "Sending…" : cooldown > 0 ? `Resend in ${cooldown}s` : "Resend link"}
                  </Button>
                  <Button
                    variant="ghost"
                    className="h-11 w-full"
                    onClick={() => {
                      setMode("email");
                      setError(null);
                    }}
                  >
                    Back to sign in
                  </Button>
                </div>
              </div>
            </Step>
          )}

          {(mode === "email" || mode === "reset") && (
            <Step>
              <form
                className="space-y-4"
                noValidate
                onSubmit={(event) => {
                  event.preventDefault();
                  if (busy) return;
                  if (!EMAIL_PATTERN.test(email.trim())) {
                    setError("Enter a valid email address, like you@example.com.");
                    return;
                  }
                  if (mode === "reset") {
                    sendReset(true);
                    return;
                  }
                  if (password.length < 6) {
                    setError("Passwords need at least 6 characters.");
                    return;
                  }
                  if (isNew && password !== confirm) {
                    setError("Those passwords don't match yet.");
                    return;
                  }
                  void run("email", () => (isNew ? auth.signUp(email, password) : auth.signIn(email, password)));
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
                    onChange={(event) => {
                      setEmail(event.target.value);
                      setError(null);
                    }}
                    className="h-11"
                  />
                </div>

                {mode === "email" && (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="password">Password</Label>
                      <PasswordInput
                        id="password"
                        autoComplete={isNew ? "new-password" : "current-password"}
                        required
                        value={password}
                        onChange={(event) => {
                          setPassword(event.target.value);
                          setError(null);
                        }}
                      />
                    </div>
                    {isNew && (
                      <div className="space-y-2 animate-in fade-in slide-in-from-top-1 duration-200 motion-reduce:animate-none">
                        <Label htmlFor="confirm-password">Confirm password</Label>
                        <PasswordInput
                          id="confirm-password"
                          autoComplete="new-password"
                          required
                          value={confirm}
                          onChange={(event) => {
                            setConfirm(event.target.value);
                            setError(null);
                          }}
                        />
                        {confirm.length > 0 && confirm !== password && (
                          <p className="text-xs text-muted-foreground animate-in fade-in duration-150 motion-reduce:animate-none">
                            Passwords don't match yet.
                          </p>
                        )}
                      </div>
                    )}
                  </>
                )}

                {error && (
                  <p
                    role="alert"
                    className="rounded-md border border-destructive/30 bg-destructive/5 px-3 py-2 text-sm text-destructive animate-in fade-in duration-200 motion-reduce:animate-none"
                  >
                    {error}
                  </p>
                )}

                <Button
                  type="submit"
                  className="h-11 w-full transition-transform active:scale-[0.99] motion-reduce:transition-none motion-reduce:active:scale-100"
                  disabled={Boolean(busy)}
                >
                  {Boolean(busy) && <Loader2 className="size-4 animate-spin" aria-hidden="true" />}
                  {mode === "reset"
                    ? busy === "reset"
                      ? "Sending…"
                      : "Send reset link"
                    : busy === "email"
                      ? isNew
                        ? "Creating account…"
                        : "Signing in…"
                      : isNew
                        ? "Create account"
                        : "Sign in"}
                </Button>

                <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                  {mode === "email" ? (
                    <>
                      <button
                        type="button"
                        className="min-h-9 transition-colors hover:text-foreground"
                        onClick={() => {
                          setIsNew((value) => !value);
                          setError(null);
                        }}
                      >
                        {isNew ? "I already have an account" : "Create an account"}
                      </button>
                      <button
                        type="button"
                        className="min-h-9 transition-colors hover:text-foreground"
                        onClick={() => {
                          setMode("reset");
                          setError(null);
                        }}
                      >
                        Forgot password?
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      className="min-h-9 transition-colors hover:text-foreground"
                      onClick={() => {
                        setMode("email");
                        setError(null);
                      }}
                    >
                      Back to sign in
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  className="min-h-9 w-full text-center text-xs text-muted-foreground transition-colors hover:text-foreground"
                  onClick={() => {
                    setMode("choose");
                    setError(null);
                  }}
                >
                  Other sign-in options
                </button>
              </form>
            </Step>
          )}
        </div>
      </div>
    </main>
  );
}
